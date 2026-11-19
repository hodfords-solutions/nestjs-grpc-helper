/* eslint-disable max-lines-per-function, max-lines */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { findBinary, readBinaryVersion, runBinary } from '../helpers/shell.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator.js';
import { microserviceStorage } from '../storages/microservice.storage.js';
import { RustSdkGeneratorService } from './rust-sdk-generator.service.js';

// No cargo in unit tests: formatting is skipped when the binary is not found.
vi.mock('../helpers/shell.helper.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../helpers/shell.helper.js')>()),
    findBinary: vi.fn(),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

describe('RustSdkGeneratorService', () => {
    let workDir: string;
    let outputDir: string;
    let config: SdkBuildConfigType;
    let prostContent: string;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let protoc: { assertTools: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    const read = (file: string): string => fs.readFileSync(path.join(outputDir, file), 'utf8');
    const methodBody = (client: string, fnName: string): string => {
        const start = client.indexOf(`pub async fn ${fnName}(`);
        expect(start).toBeGreaterThan(-1);
        const end = client.indexOf('\n    }\n', start);
        return client.slice(start, end);
    };

    beforeEach(() => {
        vi.mocked(findBinary).mockReset().mockReturnValue(null);
        vi.mocked(readBinaryVersion).mockReset();
        vi.mocked(runBinary).mockReset();
        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust-sdk-'));
        outputDir = path.join(workDir, 'sdk-rust');
        config = {
            name: 'fixturePkg',
            packageName: '@scope/sdk',
            output: path.join(workDir, 'sdk'),
            rust: { crateName: 'fixture-sdk', output: outputDir }
        };
        prostContent = '// prost\n';
        protoc = {
            assertTools: vi.fn(),
            run: vi.fn((args: string[], cwd: string) => {
                fs.outputFileSync(path.join(cwd, 'src/generated/fixturePkg.rs'), prostContent);
                fs.outputFileSync(path.join(cwd, 'src/generated/fixturePkg.tonic.rs'), '// tonic\n');
            })
        };
    });

    afterEach(() => {
        warnSpy.mockRestore();
        fs.removeSync(workDir);
    });

    it('checks the pinned Rust tools before writing anything', () => {
        protoc.assertTools.mockImplementation(() => {
            throw new Error('Missing or unsupported SDK build tools');
        });

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Missing or unsupported SDK build tools'
        );
        expect(protoc.assertTools.mock.calls[0][0].map((tool) => tool.binary)).toEqual([
            'protoc',
            'protoc-gen-prost',
            'protoc-gen-tonic'
        ]);
        expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('runs protoc with the prost and tonic plugins into src/generated', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(protoc.run).toHaveBeenCalledWith(
            ['--proto_path=.', '--prost_out=src/generated', '--tonic_out=src/generated', 'microservice.proto'],
            expect.any(String)
        );
        expect(fs.existsSync(path.join(outputDir, 'microservice.proto'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'src/generated/fixturePkg.rs'))).toBe(true);
    });

    it('writes Cargo.toml with the crate name, default version and pinned crates', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const cargo = read('Cargo.toml');
        expect(cargo).toContain('name = "fixture-sdk"');
        expect(cargo).toContain('version = "0.1.0"');
        expect(cargo).toContain('prost = "0.13"');
        expect(cargo).toContain('tonic = "0.12"');
    });

    it('uses the configured crate version', () => {
        config.rust.version = '2.3.4';

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(read('Cargo.toml')).toContain('version = "2.3.4"');
    });

    it('includes both generated files when the prost file does not include the tonic file', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const lib = read('src/lib.rs');
        expect(lib).toContain('include!("generated/fixturePkg.rs");');
        expect(lib).toContain('include!("generated/fixturePkg.tonic.rs");');
    });

    it('includes only the prost file when it already includes the tonic file', () => {
        prostContent = '// prost\ninclude!("fixturePkg.tonic.rs");\n';

        new RustSdkGeneratorService(config, protoc as any).generate();

        const lib = read('src/lib.rs');
        expect(lib).toContain('include!("generated/fixturePkg.rs");');
        expect(lib).not.toContain('include!("generated/fixturePkg.tonic.rs");');
    });

    it('silences the non camel case associated type that protoc-gen-tonic emits for streams', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(read('src/lib.rs')).toContain('#[allow(clippy::all, non_camel_case_types)]\npub mod pb {');
    });

    it('fails clearly when protoc did not produce the expected files', () => {
        protoc.run.mockImplementation(() => undefined);

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Expected one prost file and one tonic file in src/generated'
        );
    });

    it('writes one client per service over the tonic client', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain('pub struct SdkFixtureMicroserviceClient {');
        expect(client).toContain('inner: pb::sdk_fixture_microservice_client::SdkFixtureMicroserviceClient<Channel>,');
    });

    it('unwraps each response kind into its Rust type', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain(
            'pub async fn find_one(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<pb::FixtureItemResponse, SdkError>'
        );
        expect(client).toContain('-> Result<Vec<pb::FixtureItemResponse>, SdkError>');
        expect(client).toContain(
            'pub async fn get_name(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<String, SdkError>'
        );
        expect(client).toContain('-> Result<f32, SdkError>');
        expect(client).toContain('-> Result<bool, SdkError>');
        expect(client).toContain('-> Result<Vec<String>, SdkError>');
        expect(client).toContain('-> Result<Option<pb::FixtureItemResponse>, SdkError>');
        expect(client).toContain(
            'pub async fn maybe_get_name(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<Option<String>, SdkError>'
        );
        expect(client).toContain('Ok(response.value.map(|native| native.value))');
        expect(client).toContain('pub max_decoding_message_size: Option<usize>');
        expect(client).toContain('inner = inner.max_decoding_message_size(limit);');
        expect(client).toContain('inner = inner.max_encoding_message_size(limit);');
        expect(client).toContain('pub async fn ping(&self, options: CallOptions) -> Result<(), SdkError>');
        expect(client).toContain('Ok(response.items)');
        expect(client).toContain('Ok(response.value)');
        expect(client).toContain('build_request((), options.timeout.or(self.options.timeout), options.metadata)');
    });

    it('emits rpcs named after Rust keywords as raw identifiers, like tonic does', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain(
            'pub async fn r#move(&self, request: pb::I18nTextDto, options: CallOptions) -> Result<pb::I18nTextDto, SdkError>'
        );
        expect(client).toContain('self.inner.clone().r#move(request)');
        expect(client).toContain('pub async fn r#type(&self, options: CallOptions) -> Result<(), SdkError>');
        expect(client).toContain('self.inner.clone().r#type(request)');
        expect(client).toContain('pub async fn b2b_customers(&self, request: pb::FixtureQueryDto');
    });

    it.each([
        ['connect', 'connect'],
        ['new', 'new'],
        ['withOrigin', 'with_origin'],
        ['withInterceptor', 'with_interceptor'],
        ['sendCompressed', 'send_compressed'],
        ['acceptCompressed', 'accept_compressed'],
        ['maxDecodingMessageSize', 'max_decoding_message_size'],
        ['maxEncodingMessageSize', 'max_encoding_message_size'],
        ['clone', 'clone']
    ])('rejects the rpc %s that maps to the reserved method name %s', (rpcName, rustName) => {
        @RegisterGrpcMicroservice()
        class ReservedNameMicroservice {
            @GrpcAction()
            [rpcName](): void {}
        }

        try {
            expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
                `Rust SDK: rpc "ReservedNameMicroservice.${rpcName}" maps to the reserved method name "${rustName}". Rename the rpc.`
            );
            expect(protoc.run).not.toHaveBeenCalled();
            expect(fs.existsSync(outputDir)).toBe(false);
        } finally {
            microserviceStorage.splice(microserviceStorage.indexOf(ReservedNameMicroservice), 1);
        }
    });

    it('returns a typed stream without the default timeout for streaming methods', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain(
            'pub async fn watch_items(&self, request: pb::FixtureQueryDto, options: CallOptions) -> Result<SdkStream<pb::FixtureItemResponse>, SdkError>'
        );
        expect(client).toContain('build_request(request, options.timeout, options.metadata)');
    });

    it('applies the client default timeout to a unary method body only', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const body = methodBody(read('src/client.rs'), 'find_one');
        expect(body).toContain('build_request(request, options.timeout.or(self.options.timeout), options.metadata)');
        expect(body).toContain('.map_err(SdkError::from_status)');
    });

    it('passes only the call timeout in the streaming method body', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const body = methodBody(read('src/client.rs'), 'watch_items');
        expect(body).toContain('build_request(request, options.timeout, options.metadata)');
        expect(body).not.toContain('self.options.timeout');
        expect(body.match(/SdkError::from_status/g)).toHaveLength(2);
    });

    it('maps errors through SdkError::from_status in every method', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        const names = [...client.matchAll(/pub async fn (\w+)\(&self/g)].map((match) => match[1]);
        expect(names.length).toBeGreaterThan(5);
        for (const name of names) {
            expect(methodBody(client, name)).toContain('SdkError::from_status');
        }
    });

    it('assigns the metadata before setting the timeout in build_request', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        const start = client.indexOf('fn build_request<T>');
        const body = client.slice(start, client.indexOf('\n}\n', start));
        const metadataAt = body.indexOf('*request.metadata_mut() = metadata;');
        const timeoutAt = body.indexOf('request.set_timeout(timeout);');
        expect(metadataAt).toBeGreaterThan(-1);
        expect(timeoutAt).toBeGreaterThan(metadataAt);
    });

    it('documents the description and the metadata keys of a method', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const client = read('src/client.rs');
        expect(client).toContain('/// Get the workspace of the caller');
        expect(client).toContain('/// Metadata read by the server: workspace-id.');
    });

    it('writes string-backed and integer-backed enums', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const enums = read('src/enums.rs');
        expect(enums).toContain('pub enum FixtureStatusEnum {');
        expect(enums).toContain('Self::SuperAdmin => "super_admin",');
        expect(enums).toContain('#[repr(i32)]');
        expect(enums).toContain('High = 2,');
    });

    it('writes an array-form enum with variants named after its values', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const enums = read('src/enums.rs');
        expect(enums).toContain('pub enum FixtureRoleEnum {');
        expect(enums).toContain('Self::Admin => "ADMIN",');
        expect(enums).toContain('Self::Standard => "STANDARD",');
        expect(enums).toContain('Self::V1st => "1st",');
        expect(enums).toContain('"1st" => Some(Self::V1st),');
        expect(enums).not.toContain('FixtureEmptyEnum');
    });

    it('suffixes an enum variant that is a Rust keyword with an underscore', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const enums = read('src/enums.rs');
        expect(enums).toContain('Self::Self_ => "self",');
        expect(enums).toContain('"self" => Some(Self::Self_),');
    });

    it('maps ABORTED status messages to SdkError::Service', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const error = read('src/error.rs');
        expect(error).toContain('tonic::Code::Aborted');
        expect(error).toContain('status.message()');
    });

    it("reports tonic's client-side timeout as DEADLINE_EXCEEDED", () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        const error = read('src/error.rs');
        expect(error).toContain('tonic 0.12');
        expect(error).toMatch(/status\.code\(\) == tonic::Code::Cancelled && status\.message\(\) == "Timeout expired"/);
        expect(error).toContain('SdkError::Status(tonic::Status::deadline_exceeded("Timeout expired"))');
    });

    it('keeps files it does not own when regenerating', () => {
        fs.outputFileSync(path.join(outputDir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(outputDir, 'Cargo.lock'), 'lock');
        fs.outputFileSync(path.join(outputDir, 'src/stale.rs'), 'stale');

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(fs.existsSync(path.join(outputDir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'Cargo.lock'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'src/stale.rs'))).toBe(false);
    });

    it('warns and leaves files unformatted when cargo is missing', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(findBinary).toHaveBeenCalledWith('cargo');
        expect(warnSpy).toHaveBeenCalledWith('cargo is not on PATH; the generated Rust files are left unformatted.');
    });

    it('fails when build is requested but cargo is not installed', () => {
        config.rust.build = true;

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            '"rust.build" is true but cargo is not on PATH'
        );
    });

    it('declares the minimum Rust version in Cargo.toml', () => {
        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(read('Cargo.toml')).toContain('rust-version = "1.85"');
    });

    it('formats with cargo fmt in the output directory when cargo is available', () => {
        vi.mocked(findBinary).mockReturnValue('/bin/cargo');

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(runBinary).toHaveBeenCalledWith('cargo', ['fmt'], outputDir);
        expect(runBinary).not.toHaveBeenCalledWith('cargo', ['check'], outputDir);
    });

    it('warns with the error and keeps the generated files when cargo fmt fails', () => {
        vi.mocked(findBinary).mockReturnValue('/bin/cargo');
        vi.mocked(runBinary).mockImplementation(() => {
            throw new Error('rustfmt is not installed');
        });

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rustfmt is not installed'));
        expect(fs.existsSync(path.join(outputDir, 'src/client.rs'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'Cargo.toml'))).toBe(true);
    });

    it('runs cargo check when build is requested and Rust is new enough', () => {
        config.rust.build = true;
        vi.mocked(findBinary).mockReturnValue('/bin/cargo');
        vi.mocked(readBinaryVersion).mockReturnValue('1.85.0');

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(readBinaryVersion).toHaveBeenCalledWith('cargo');
        expect(runBinary).toHaveBeenCalledWith('cargo', ['check'], outputDir);
    });

    it('fails before cargo check when Rust is older than the minimum', () => {
        config.rust.build = true;
        vi.mocked(findBinary).mockReturnValue('/bin/cargo');
        vi.mocked(readBinaryVersion).mockReturnValue('1.80.0');

        expect(() => new RustSdkGeneratorService(config, protoc as any).generate()).toThrow(
            '"rust.build" needs Rust 1.85 or newer, found 1.80.0. Run "rustup update stable".'
        );
        expect(runBinary).not.toHaveBeenCalledWith('cargo', ['check'], outputDir);
    });

    it('runs cargo check when the cargo version cannot be read', () => {
        config.rust.build = true;
        vi.mocked(findBinary).mockReturnValue('/bin/cargo');
        vi.mocked(readBinaryVersion).mockReturnValue(null);

        new RustSdkGeneratorService(config, protoc as any).generate();

        expect(runBinary).toHaveBeenCalledWith('cargo', ['check'], outputDir);
    });
});
