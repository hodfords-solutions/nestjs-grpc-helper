/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { findBinary, runBinary } from '../helpers/shell.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { GoSdkGeneratorService } from './go-sdk-generator.service.js';
import { RustSdkGeneratorService } from './rust-sdk-generator.service.js';

// No cargo / gofmt / go in unit tests: formatting and tidy are skipped when the binary is not found.
vi.mock('../helpers/shell.helper.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../helpers/shell.helper.js')>()),
    findBinary: vi.fn(),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

type Generator = { generate(): void };
type Case = {
    language: string;
    create: (config: SdkBuildConfigType, protoc: any) => Generator;
    configure: (config: SdkBuildConfigType, outputDir: string) => void;
    stubs: string[];
    requiredTools: { binary: string }[];
    tools: string[];
    existing: [string, string][];
};

const cases: Case[] = [
    {
        language: 'Rust',
        create: (config, protoc) => new RustSdkGeneratorService(config, protoc),
        configure: (config, outputDir) => (config.rust = { crateName: 'fixture-sdk', output: outputDir }),
        stubs: ['src/generated/fixturePkg.rs', 'src/generated/fixturePkg.tonic.rs'],
        requiredTools: RustSdkGeneratorService.requiredTools,
        tools: ['protoc', 'protoc-gen-prost', 'protoc-gen-tonic'],
        existing: [
            ['Cargo.toml', 'old cargo'],
            ['microservice.proto', 'old proto'],
            ['src/lib.rs', 'old lib'],
            ['src/generated/fixturePkg.rs', 'old prost'],
            ['Cargo.lock', 'lock']
        ]
    },
    {
        language: 'Go',
        create: (config, protoc) => new GoSdkGeneratorService(config, protoc),
        configure: (config, outputDir) => (config.go = { module: 'github.com/acme/fixture-sdk-go', output: outputDir }),
        stubs: ['pb/microservice.pb.go', 'pb/microservice_grpc.pb.go'],
        requiredTools: GoSdkGeneratorService.requiredTools,
        tools: ['protoc', 'protoc-gen-go', 'protoc-gen-go-grpc'],
        existing: [
            ['go.mod', 'old go.mod'],
            ['microservice.proto', 'old proto'],
            ['pb/microservice.pb.go', 'old stub'],
            ['client.go', 'old client'],
            ['enums.go', 'old enums'],
            ['go.sum', 'sum']
        ]
    }
];

describe.each(cases)('$language SDK generator staging', (testCase) => {
    let workDir: string;
    let outputDir: string;
    let config: SdkBuildConfigType;
    let protoc: { assertTools: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };
    let warn: ReturnType<typeof vi.spyOn>;
    const generate = (): void => testCase.create(config, protoc).generate();

    beforeEach(() => {
        vi.mocked(findBinary).mockReset().mockReturnValue(null);
        vi.mocked(runBinary).mockReset();
        warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-staging-'));
        outputDir = path.join(workDir, 'output');
        config = { name: 'fixturePkg', packageName: '@scope/sdk', output: path.join(workDir, 'sdk') };
        testCase.configure(config, outputDir);
        protoc = {
            assertTools: vi.fn(),
            run: vi.fn((args: string[], cwd: string) => {
                for (const stub of testCase.stubs) {
                    fs.outputFileSync(path.join(cwd, stub), '// stub\n');
                }
            })
        };
        for (const [file, content] of testCase.existing) {
            fs.outputFileSync(path.join(outputDir, file), content);
        }
    });

    afterEach(() => {
        warn.mockRestore();
        fs.removeSync(workDir);
    });

    const expectOutputUntouched = (): void => {
        for (const [file, content] of testCase.existing) {
            expect(fs.readFileSync(path.join(outputDir, file), 'utf8')).toBe(content);
        }
        expect(fs.readdirSync(workDir)).toEqual(['output']);
    };

    it('exposes the tools it checks', () => {
        expect(testCase.requiredTools.map((tool) => tool.binary)).toEqual(testCase.tools);
    });

    it('runs protoc in a staging directory next to the output and removes it afterwards', () => {
        generate();

        const [[, stagingDir]] = protoc.run.mock.calls;
        expect(stagingDir).not.toBe(outputDir);
        expect(path.dirname(stagingDir)).toBe(path.dirname(outputDir));
        expect(fs.existsSync(stagingDir)).toBe(false);
        expect(fs.readdirSync(workDir)).toEqual(['output']);
        for (const stub of testCase.stubs) {
            expect(fs.existsSync(path.join(outputDir, stub))).toBe(true);
        }
    });

    it('leaves an existing output untouched when protoc fails', () => {
        protoc.run.mockImplementation(() => {
            throw new Error('protoc failed');
        });

        expect(generate).toThrow('protoc failed');
        expectOutputUntouched();
    });

    it('leaves an existing output untouched when proto generation fails', () => {
        const generateProto = vi.spyOn(GenerateProtoService.prototype, 'generate').mockImplementation(() => {
            throw new Error('X.total has type "number" without a "format"');
        });

        try {
            expect(generate).toThrow('without a "format"');
            expect(protoc.run).not.toHaveBeenCalled();
            expectOutputUntouched();
        } finally {
            generateProto.mockRestore();
        }
    });
});
