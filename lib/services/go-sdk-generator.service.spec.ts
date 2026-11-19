/* eslint-disable max-lines-per-function */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { GoSdkGeneratorService } from './go-sdk-generator.service.js';
import { findBinary, runBinary } from '../helpers/shell.helper.js';

// No gofmt / go in unit tests: formatting is skipped when the binary is not found.
vi.mock('../helpers/shell.helper.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../helpers/shell.helper.js')>()),
    findBinary: vi.fn(),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

describe('GoSdkGeneratorService', () => {
    let workDir: string;
    let outputDir: string;
    let config: SdkBuildConfigType;
    let protoc: { assertTools: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    const read = (file: string): string => fs.readFileSync(path.join(outputDir, file), 'utf8');

    let warn: ReturnType<typeof vi.spyOn>;
    const body = (signature: string): string => {
        const client = read('client.go');
        const start = client.indexOf(signature);
        expect(start).toBeGreaterThan(-1);
        const end = client.indexOf('\n}\n', start);
        return client.slice(start, end);
    };

    beforeEach(() => {
        vi.mocked(findBinary).mockReset().mockReturnValue(null);
        vi.mocked(runBinary).mockReset();
        warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-sdk-'));
        outputDir = path.join(workDir, 'sdk-go');
        config = {
            name: 'fixturePkg',
            packageName: '@scope/sdk',
            output: path.join(workDir, 'sdk'),
            go: { module: 'github.com/acme/fixture-sdk-go', output: outputDir }
        };
        protoc = {
            assertTools: vi.fn(),
            run: vi.fn((args: string[], cwd: string) => {
                fs.outputFileSync(path.join(cwd, 'pb/microservice.pb.go'), 'package pb\n');
                fs.outputFileSync(path.join(cwd, 'pb/microservice_grpc.pb.go'), 'package pb\n');
            })
        };
    });

    afterEach(() => {
        warn.mockRestore();
        fs.removeSync(workDir);
    });

    it('checks the pinned Go tools before writing anything', () => {
        protoc.assertTools.mockImplementation(() => {
            throw new Error('Missing or unsupported SDK build tools');
        });

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).toThrow(
            'Missing or unsupported SDK build tools'
        );
        expect(protoc.assertTools.mock.calls[0][0].map((tool) => tool.binary)).toEqual([
            'protoc',
            'protoc-gen-go',
            'protoc-gen-go-grpc'
        ]);
        expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('runs protoc so stubs land in pb/ under the module path', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(protoc.run).toHaveBeenCalledWith(
            [
                '--proto_path=.',
                '--go_out=.',
                '--go_opt=Mmicroservice.proto=github.com/acme/fixture-sdk-go/pb',
                '--go_opt=module=github.com/acme/fixture-sdk-go',
                '--go-grpc_out=.',
                '--go-grpc_opt=Mmicroservice.proto=github.com/acme/fixture-sdk-go/pb',
                '--go-grpc_opt=module=github.com/acme/fixture-sdk-go',
                'microservice.proto'
            ],
            expect.any(String)
        );
        expect(fs.existsSync(path.join(outputDir, 'microservice.proto'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'pb/microservice.pb.go'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'pb/microservice_grpc.pb.go'))).toBe(true);
    });

    it('writes go.mod with the module path and pinned dependencies', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const goMod = read('go.mod');
        expect(goMod).toContain('module github.com/acme/fixture-sdk-go');
        expect(goMod).toContain('go 1.23');
        expect(goMod).toContain('google.golang.org/grpc v1.71.0');
        expect(goMod).toContain('google.golang.org/protobuf v1.36.6');
    });

    it('writes one client per service in the package named after the module', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain('package fixturesdkgo');
        expect(client).toContain('"github.com/acme/fixture-sdk-go/pb"');
        expect(client).toContain('type SdkFixtureMicroserviceClient struct');
        expect(client).toContain(
            'func NewSdkFixtureMicroserviceClient(conn grpc.ClientConnInterface, opts ...Option) *SdkFixtureMicroserviceClient'
        );
    });

    it('unwraps each response kind into its Go type', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain(
            'FindOne(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain(
            'FindMany(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) ([]*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain(
            'GetName(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (string, error)'
        );
        expect(client).toContain(
            'CountItems(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (float32, error)'
        );
        expect(client).toContain(
            'IsActive(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (bool, error)'
        );
        expect(client).toContain(
            'GetTags(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) ([]string, error)'
        );
        expect(client).toContain(
            'MaybeFindOne(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*pb.FixtureItemResponse, error)'
        );
        expect(client).toContain(
            'MaybeGetName(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*string, error)'
        );
        expect(client).toContain('return optional(res.GetValue() != nil, res.GetValue().GetValue()), nil');
        expect(client).toContain('Ping(ctx context.Context, opts ...Option) error');
        expect(client).toContain('return res.GetItems(), nil');
        expect(client).toContain('return res.GetValue(), nil');
        expect(client).toContain('c.client.Ping(ctx, &emptypb.Empty{})');
    });

    it('names methods and messages exactly like protoc-gen-go', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain(
            'Move(ctx context.Context, req *pb.I18NTextDto, opts ...Option) (*pb.I18NTextDto, error)'
        );
        expect(client).toContain('Enable2Fa(ctx context.Context, opts ...Option) error');
        expect(client).toContain(
            'B2BCustomers(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) ([]*pb.I18NTextDto, error)'
        );
        expect(client).toContain('c.client.B2BCustomers(ctx, req)');
    });

    it('returns a typed stream for streaming methods', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(read('client.go')).toContain(
            'WatchItems(ctx context.Context, req *pb.FixtureQueryDto, opts ...Option) (*Stream[*pb.FixtureItemResponse], error)'
        );
    });

    it('documents the description and the metadata keys of a method', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const client = read('client.go');
        expect(client).toContain('// GetWorkspace Get the workspace of the caller');
        expect(client).toContain('// Metadata read by the server: workspace-id.');
    });

    it('writes typed constants for string and numeric enums', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const enums = read('enums.go');
        expect(enums).toContain('type FixtureStatusEnum string');
        expect(enums).toContain('FixtureStatusEnumSuperAdmin FixtureStatusEnum = "super_admin"');
        expect(enums).toContain('type FixtureLevelEnum int32');
        expect(enums).toContain('FixtureLevelEnumHigh FixtureLevelEnum = 2');
    });

    it('writes an array-form enum with constants named after its values', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const enums = read('enums.go');
        expect(enums).toContain('type FixtureRoleEnum string');
        expect(enums).toContain('FixtureRoleEnumAdmin FixtureRoleEnum = "ADMIN"');
        expect(enums).toContain('FixtureRoleEnumStandard FixtureRoleEnum = "STANDARD"');
        expect(enums).toContain('FixtureRoleEnumV1st FixtureRoleEnum = "1st"');
        expect(enums).not.toContain('FixtureEmptyEnum');
    });

    it('maps ABORTED status messages to *Error', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const errors = read('errors.go');
        expect(errors).toContain('package fixturesdkgo');
        expect(errors).toContain('codes.Aborted');
        expect(errors).toContain('st.Message()');
    });

    it('keeps files it does not own when regenerating', () => {
        fs.outputFileSync(path.join(outputDir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(outputDir, 'go.sum'), 'sum');
        fs.outputFileSync(path.join(outputDir, 'pb/stale.pb.go'), 'stale');

        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(fs.existsSync(path.join(outputDir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'go.sum'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'pb/stale.pb.go'))).toBe(false);
    });

    it('fails when build is requested but go is not installed', () => {
        config.go.build = true;

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).toThrow(
            '"go.build" is true but go is not on PATH'
        );
    });

    it('wraps unary calls with the default timeout and always cancels', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const unary = body('func (c *SdkFixtureMicroserviceClient) FindOne(');
        expect(unary).toContain('ctx, cancel := prepare(ctx, c.defaults.with(opts))\n\tdefer cancel()');
        expect(unary).not.toContain('withoutTimeout');
        expect(unary).toContain('wrapError(err)');
    });

    it('opens streams without the default timeout and cancels when opening fails', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const stream = body('func (c *SdkFixtureMicroserviceClient) WatchItems(');
        expect(stream).toContain('prepare(ctx, c.defaults.withoutTimeout().with(opts))');
        expect(stream).toMatch(/if err != nil \{\n\t\tcancel\(\)\n\t\treturn nil, wrapError\(err\)/);
        expect(stream).not.toContain('defer cancel()');
        expect(stream).toContain('wrapStreamError(err)');
    });

    it('cancels a stream on Recv errors and keeps io.EOF unwrapped', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const recv = body('func (s *Stream[T]) Recv()');
        expect(recv).toMatch(/if err != nil \{\n\t\ts\.cancel\(\)/);
        const wrapStream = body('func wrapStreamError(');
        expect(wrapStream).toContain('errors.Is(err, io.EOF)');
        expect(wrapStream).toContain('return io.EOF');
        expect(wrapStream).toContain('return wrapError(err)');
    });

    it('lets later metadata replace earlier values of the same key', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        const withMetadata = body('func WithMetadata(');
        expect(withMetadata).toContain('strings.ToLower(key)');
        expect(withMetadata).not.toContain('metadata.Join');
        expect(body('func prepare(')).not.toContain('metadata.Join(existing');
    });

    it('warns when gofmt is missing', () => {
        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('gofmt is not on PATH'));
        expect(findBinary).toHaveBeenCalledWith('gofmt');
    });

    it('formats with gofmt in the output directory when gofmt is available', () => {
        vi.mocked(findBinary).mockReturnValue('/bin/gofmt');

        new GoSdkGeneratorService(config, protoc as any).generate();

        expect(runBinary).toHaveBeenCalledWith('gofmt', ['-w', 'client.go', 'errors.go', 'enums.go'], outputDir);
    });

    it('warns with the error and keeps the generated files when gofmt fails', () => {
        vi.mocked(findBinary).mockReturnValue('/bin/gofmt');
        vi.mocked(runBinary).mockImplementation(() => {
            throw new Error('gofmt exploded');
        });

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).not.toThrow();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('gofmt exploded'));
        expect(fs.existsSync(path.join(outputDir, 'client.go'))).toBe(true);
    });

    const goCalls = (): string[][] =>
        vi
            .mocked(runBinary)
            .mock.calls.filter(([binary]) => binary === 'go')
            .map(([, args]) => args);

    const generateWithGoVersion = (output: string, build = false): void => {
        config.go.build = build;
        vi.mocked(findBinary).mockImplementation((binary) => (binary === 'go' ? '/bin/go' : null));
        vi.mocked(runBinary).mockImplementation((binary, args) =>
            binary === 'go' && args[0] === 'version' ? output : ''
        );
        new GoSdkGeneratorService(config, protoc as any).generate();
    };
    const buildWithGoVersion = (output: string): void => generateWithGoVersion(output, true);

    it('runs go mod tidy without building when build is not requested', () => {
        generateWithGoVersion('go version go1.23.4 darwin/arm64\n');

        expect(goCalls()).toEqual([['version'], ['mod', 'tidy']]);
        expect(runBinary).toHaveBeenCalledWith('go', ['mod', 'tidy'], outputDir);
    });

    it('warns that the module needs go mod tidy when go is missing', () => {
        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).not.toThrow();

        expect(goCalls()).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('go is not on PATH'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('go mod tidy'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Go 1.23 or newer'));
    });

    it('warns instead of tidying when Go is too old and build is not requested', () => {
        expect(() => generateWithGoVersion('go version go1.20.2 darwin/amd64\n')).not.toThrow();

        expect(goCalls()).toEqual([['version']]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('found Go 1.20.2'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('go mod tidy'));
    });

    const failTidy = (): void => {
        vi.mocked(runBinary).mockImplementation((binary, args) => {
            if (binary === 'go' && args[0] === 'version') {
                return 'go version go1.23.4 darwin/arm64\n';
            }
            if (binary === 'go' && args[0] === 'mod') {
                throw new Error('go mod tidy failed: no network');
            }
            return '';
        });
    };

    it('warns with the error when go mod tidy fails and build is not requested', () => {
        vi.mocked(findBinary).mockImplementation((binary) => (binary === 'go' ? '/bin/go' : null));
        failTidy();

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).not.toThrow();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no network'));
        expect(fs.existsSync(path.join(outputDir, 'client.go'))).toBe(true);
    });

    it('fails when go mod tidy fails and build is requested', () => {
        config.go.build = true;
        vi.mocked(findBinary).mockImplementation((binary) => (binary === 'go' ? '/bin/go' : null));
        failTidy();

        expect(() => new GoSdkGeneratorService(config, protoc as any).generate()).toThrow('no network');
        expect(goCalls()).not.toContainEqual(['build', './...']);
    });

    it('runs go mod tidy once, then go build, when Go is new enough', () => {
        buildWithGoVersion('go version go1.23.4 darwin/arm64\n');

        expect(runBinary).toHaveBeenCalledWith('go', ['version'], outputDir);
        expect(runBinary).toHaveBeenCalledWith('go', ['mod', 'tidy'], outputDir);
        expect(runBinary).toHaveBeenCalledWith('go', ['build', './...'], outputDir);
        expect(goCalls()).toEqual([['version'], ['mod', 'tidy'], ['build', './...']]);
    });

    it('fails before tidy and build when Go is older than the generated go.mod', () => {
        expect(() => buildWithGoVersion('go version go1.20.2 darwin/amd64\n')).toThrow(
            '"go.build" needs Go 1.23 or newer, found 1.20.2.'
        );
        expect(runBinary).not.toHaveBeenCalledWith('go', ['mod', 'tidy'], outputDir);
        expect(runBinary).not.toHaveBeenCalledWith('go', ['build', './...'], outputDir);
    });

    it('builds when the go version output cannot be parsed', () => {
        buildWithGoVersion('something unexpected');

        expect(runBinary).toHaveBeenCalledWith('go', ['mod', 'tidy'], outputDir);
        expect(runBinary).toHaveBeenCalledWith('go', ['build', './...'], outputDir);
    });
});
