import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../sample/app.microservice.js';
import './fixtures/sdk-fixture.microservice.js';
import { generateSdk } from '../lib/helpers/generate.helper.js';
import { BUILD_TIMEOUT, findUnusableTools } from './helpers/sdk-toolchain.js';

const unusableTools = findUnusableTools();
const isRequired = process.env.SDK_INTEGRATION_REQUIRED === '1';

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
