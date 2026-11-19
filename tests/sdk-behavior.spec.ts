import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GrpcOptions, Transport } from '@nestjs/microservices';
import fs from 'fs-extra';
import { execFile } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BehaviorModule } from './fixtures/behavior.microservice.js';
import { RUST_SDK_TOOLCHAIN } from '../lib/constants/sdk-toolchain.const.js';
import { generateProtoService, generateSdk } from '../lib/helpers/generate.helper.js';
import { BUILD_TIMEOUT, findUnusableTools } from './helpers/sdk-toolchain.js';

const consumersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'consumers');
const packageName = 'behaviorSdk';

// A consumer that hangs (for example on a stream that never ends) is killed instead of blocking the run.
const CONSUMER_TIMEOUT = 15 * 60_000;

// The consumer must use the tonic the SDK is generated for, so its manifest is written from the same constant.
function writeRustConsumerManifest(directory: string): void {
    const { crates } = RUST_SDK_TOOLCHAIN;
    const manifest = [
        '[package]',
        'name = "behavior-consumer-rust"',
        'version = "0.1.0"',
        'edition = "2021"',
        'publish = false',
        '',
        '[dependencies]',
        'behavior-sdk = { path = "../sdk-rust" }',
        'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }',
        `tokio-stream = "${crates.tokioStream}"`,
        `tonic = "${crates.tonic}"`,
        ''
    ];
    fs.writeFileSync(path.join(directory, 'Cargo.toml'), manifest.join('\n'));
}

function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

/**
 * Runs a consumer without blocking the event loop: the gRPC server it calls lives in this process.
 * Resolves with the exit code and the combined output, so a failing check is shown by the assertion.
 */
function run(command: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
        const options = {
            cwd,
            maxBuffer: 64 * 1024 * 1024,
            timeout: CONSUMER_TIMEOUT,
            env: { ...process.env, ...cargoEnv() }
        };
        execFile(command, args, options, (error, stdout, stderr) => {
            const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
            resolve({ code, output: `${stdout}\n${stderr}`.trim() });
        });
    });
}

// CI points this at a cached directory so the consumer's dependencies are compiled once.
function cargoEnv(): Record<string, string> {
    const targetDir = process.env.SDK_TEST_CARGO_TARGET_DIR;
    return targetDir ? { CARGO_TARGET_DIR: targetDir } : {};
}

const unusableTools = findUnusableTools();

describe.skipIf(unusableTools.length > 0)('Rust and Go SDKs against a live server', () => {
    let workDir: string;
    let app: INestMicroservice;
    let address: string;

    beforeAll(async () => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-behavior-'));
        const protoDir = path.join(workDir, 'proto');
        generateProtoService(packageName, protoDir);
        generateSdk(
            {
                name: packageName,
                packageName: '@sample/behavior-sdk',
                output: path.join(workDir, 'ts'),
                rust: { crateName: 'behavior-sdk', output: path.join(workDir, 'sdk-rust') },
                go: { module: 'example.com/behavior-sdk-go', output: path.join(workDir, 'sdk-go') }
            },
            ['rust', 'go']
        );
        fs.copySync(path.join(consumersDir, 'go'), path.join(workDir, 'consumer-go'));
        fs.copySync(path.join(consumersDir, 'rust'), path.join(workDir, 'consumer-rust'));
        writeRustConsumerManifest(path.join(workDir, 'consumer-rust'));

        // Another process can take the port between probing it and binding it, so try a few ports.
        for (let attempt = 1; ; attempt++) {
            address = `127.0.0.1:${await findFreePort()}`;
            app = await NestFactory.createMicroservice<GrpcOptions>(BehaviorModule, {
                transport: Transport.GRPC,
                options: { url: address, package: packageName, protoPath: path.join(protoDir, 'microservice.proto') },
                logger: false
            });
            try {
                await app.listen();
                break;
            } catch (error) {
                await app.close();
                if (attempt === 3) {
                    throw error;
                }
            }
        }
    }, BUILD_TIMEOUT);

    afterAll(async () => {
        await app?.close();
        if (workDir) {
            fs.removeSync(workDir);
        }
    });

    it(
        'Go consumer passes every check',
        async () => {
            const cwd = path.join(workDir, 'consumer-go');
            const tidy = await run('go', ['mod', 'tidy'], cwd);
            expect(tidy.code, tidy.output).toBe(0);

            const result = await run('go', ['run', '.', address], cwd);

            expect(result.output).toContain('Done: 0 check(s) failed');
            expect(result.code).toBe(0);
        },
        BUILD_TIMEOUT
    );

    it(
        'Rust consumer passes every check',
        async () => {
            const cwd = path.join(workDir, 'consumer-rust');

            const result = await run('cargo', ['run', '--quiet', '--', `http://${address}`], cwd);

            expect(result.output).toContain('Done: 0 check(s) failed');
            expect(result.code).toBe(0);
        },
        BUILD_TIMEOUT
    );
});
