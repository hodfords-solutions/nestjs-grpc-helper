import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../sample/app.microservice.js';
import './fixtures/sdk-fixture.microservice.js';
import { generateSdk } from '../lib/helpers/generate.helper.js';
import { GO_SDK_TOOLCHAIN, RUST_SDK_TOOLCHAIN } from '../lib/constants/sdk-toolchain.const.js';
import { findBinary, isVersionAtLeast, readBinaryVersion, runBinary } from '../lib/helpers/shell.helper.js';
import { GoSdkGeneratorService } from '../lib/services/go-sdk-generator.service.js';
import { ProtocService } from '../lib/services/protoc.service.js';
import { RustSdkGeneratorService } from '../lib/services/rust-sdk-generator.service.js';

function readGoVersion(): string | null {
    try {
        return /go(\d+\.\d+(?:\.\d+)?)/.exec(runBinary('go', ['version']))?.[1] ?? null;
    } catch {
        return null;
    }
}

// protoc and the plugins, checked exactly like generateSdk checks them (presence and pinned version)
function findUnusablePlugins(): string[] {
    const tools = [...RustSdkGeneratorService.requiredTools, ...GoSdkGeneratorService.requiredTools].filter(
        (tool, index, all) => all.findIndex((other) => other.binary === tool.binary) === index
    );
    try {
        new ProtocService().assertTools(tools);
        return [];
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return message
            .split('\n')
            .filter((line) => line.startsWith('- '))
            .map((line) => line.slice(2));
    }
}

// A tool that is missing, or too old for the generated code, is unusable. An unreadable version counts as usable.
function findUnusableTools(): string[] {
    const compilers: Record<string, { read: () => string | null; minimum: string }> = {
        cargo: { read: () => readBinaryVersion('cargo'), minimum: RUST_SDK_TOOLCHAIN.minRustVersion },
        go: { read: readGoVersion, minimum: GO_SDK_TOOLCHAIN.goVersion }
    };
    const unusable = findUnusablePlugins();
    for (const [tool, check] of Object.entries(compilers)) {
        if (!findBinary(tool)) {
            unusable.push(`${tool} (not on PATH)`);
            continue;
        }
        const actual = check.read();
        if (actual && !isVersionAtLeast(actual, check.minimum)) {
            unusable.push(`${tool} ${actual} (need ${check.minimum} or newer)`);
        }
    }
    return unusable;
}

const unusableTools = findUnusableTools();
const isRequired = process.env.SDK_INTEGRATION_REQUIRED === '1';
// The first cargo check downloads and compiles tonic.
const BUILD_TIMEOUT = 20 * 60_000;

describe('SDK integration toolchain', () => {
    it.runIf(isRequired)('has every required tool on PATH', () => {
        expect(unusableTools).toEqual([]);
    });
});

describe.skipIf(unusableTools.length > 0)('Rust and Go SDK generation', () => {
    let workDir: string;

    beforeAll(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-integration-'));
        // build: true makes generateSdk throw when `cargo check` or `go build ./...` fails.
        generateSdk(
            {
                name: 'sdkName',
                packageName: '@sample/sdk',
                output: path.join(workDir, 'ts'),
                rust: { crateName: 'sample-sdk', output: path.join(workDir, 'rust'), build: true },
                go: { module: 'example.com/sample-sdk-go', output: path.join(workDir, 'go'), build: true }
            },
            ['rust', 'go']
        );
    }, BUILD_TIMEOUT);

    afterAll(() => {
        fs.removeSync(workDir);
    });

    it('produces a Rust crate that compiles', () => {
        for (const file of ['Cargo.toml', 'microservice.proto', 'src/lib.rs', 'src/client.rs', 'src/error.rs']) {
            expect(fs.existsSync(path.join(workDir, 'rust', file))).toBe(true);
        }
        const client = fs.readFileSync(path.join(workDir, 'rust/src/client.rs'), 'utf8');
        expect(client).toContain('pub struct AppMicroserviceClient');
        expect(client).toContain('pub struct SdkFixtureMicroserviceClient');
        // Rust keywords: the wrapper must use the raw identifiers tonic generates
        const tonic = fs
            .readdirSync(path.join(workDir, 'rust/src/generated'))
            .filter((file) => file.endsWith('.tonic.rs'))
            .map((file) => fs.readFileSync(path.join(workDir, 'rust/src/generated', file), 'utf8'))
            .join('\n');
        for (const fnName of ['r#move', 'r#type']) {
            expect(tonic).toContain(`pub async fn ${fnName}(`);
            expect(client).toContain(`pub async fn ${fnName}(`);
        }
        expect(fs.readFileSync(path.join(workDir, 'rust/src/enums.rs'), 'utf8')).toContain('Self_');
    });

    it('produces a Go module that compiles', () => {
        for (const file of ['go.mod', 'microservice.proto', 'client.go', 'errors.go', 'enums.go']) {
            expect(fs.existsSync(path.join(workDir, 'go', file))).toBe(true);
        }
        expect(fs.existsSync(path.join(workDir, 'go/pb/microservice.pb.go'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'go/pb/microservice_grpc.pb.go'))).toBe(true);
        const client = fs.readFileSync(path.join(workDir, 'go/client.go'), 'utf8');
        expect(client).toContain('type AppMicroserviceClient struct');
        expect(client).toContain('type SdkFixtureMicroserviceClient struct');
        // protoc-gen-go upper-cases a letter after a digit; the wrapper must use the same names
        const stubs = fs.readFileSync(path.join(workDir, 'go/pb/microservice.pb.go'), 'utf8');
        expect(stubs).toContain('type I18NTextDto struct');
        expect(client).toContain('*pb.I18NTextDto');
        expect(client).toContain(') Enable2Fa(');
        expect(client).toContain(') B2BCustomers(');
    });

    it('does not write the TypeScript SDK when only rust and go are requested', () => {
        expect(fs.existsSync(path.join(workDir, 'ts'))).toBe(false);
    });
});
