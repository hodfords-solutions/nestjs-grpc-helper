import { Logger } from '@nestjs/common';
import fs from 'fs-extra';
import path from 'node:path';
import { GO_SDK_TOOLCHAIN, PROTOC_TOOL, SdkToolRequirement } from '../constants/sdk-toolchain.const.js';
import { enumMemberName, toGoCamelCase, toGoPackageName } from '../helpers/sdk-naming.helper.js';
import { GO_OWNED_PATHS, stageOwnedPaths } from '../helpers/sdk-output.helper.js';
import { findBinary, isVersionAtLeast, runBinary } from '../helpers/shell.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import {
    SdkDescriptor,
    SdkEnumDescriptor,
    SdkMethodDescriptor,
    SdkServiceDescriptor
} from '../types/sdk-descriptor.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { HbsGeneratorService } from './hbs-generator.service.js';
import { ProtocService } from './protoc.service.js';
import { SdkDescriptorService } from './sdk-descriptor.service.js';

const goNativeTypes = { string: 'string', bool: 'bool', float: 'float32' };
const goNativeZeroValues = { string: '""', bool: 'false', float: '0' };

export class GoSdkGeneratorService extends HbsGeneratorService {
    static readonly requiredTools: SdkToolRequirement[] = [PROTOC_TOOL, ...GO_SDK_TOOLCHAIN.tools];

    private logger = new Logger(GoSdkGeneratorService.name);
    private outputDir: string;

    constructor(
        private config: SdkBuildConfigType,
        private protocService: ProtocService = new ProtocService()
    ) {
        super();
        this.outputDir = path.resolve(process.cwd(), this.config.go.output);
    }

    generate(descriptor?: SdkDescriptor): void {
        const { module } = this.config.go;
        const packageName = toGoPackageName(module);
        descriptor ??= new SdkDescriptorService().describe();
        if (!descriptor.services.length) {
            throw new Error('No gRPC microservice with a @GrpcAction method is registered; nothing to generate.');
        }

        this.protocService.assertTools(GoSdkGeneratorService.requiredTools);
        const files = this.renderFiles(descriptor, packageName);
        this.writeOwnedPaths(files);

        this.format([...files.keys()].filter((file) => file.endsWith('.go')));
        this.tidy();
        if (this.config.go.build) {
            this.build();
        }
    }

    private renderFiles(descriptor: SdkDescriptor, packageName: string): Map<string, string> {
        const { module } = this.config.go;
        return new Map([
            [
                'go.mod',
                this.compileTemplate('go/go-mod.hbs', {
                    module,
                    goVersion: GO_SDK_TOOLCHAIN.goVersion,
                    grpcVersion: GO_SDK_TOOLCHAIN.modules.grpc,
                    protobufVersion: GO_SDK_TOOLCHAIN.modules.protobuf
                })
            ],
            [
                'client.go',
                this.compileTemplate('go/client.hbs', {
                    packageName,
                    module,
                    services: descriptor.services.map((service) => this.buildServiceView(service))
                })
            ],
            ['errors.go', this.compileTemplate('go/errors.hbs', { packageName })],
            [
                'enums.go',
                this.compileTemplate('go/enums.hbs', {
                    packageName,
                    enums: descriptor.enums.map((item) => this.buildEnumView(item))
                })
            ]
        ]);
    }

    private writeOwnedPaths(files: Map<string, string>): void {
        const { module } = this.config.go;
        stageOwnedPaths(this.outputDir, GO_OWNED_PATHS, (stagingDir) => {
            new GenerateProtoService(this.config.name, stagingDir).generate();
            this.protocService.run(
                [
                    '--proto_path=.',
                    '--go_out=.',
                    `--go_opt=Mmicroservice.proto=${module}/pb`,
                    `--go_opt=module=${module}`,
                    '--go-grpc_out=.',
                    `--go-grpc_opt=Mmicroservice.proto=${module}/pb`,
                    `--go-grpc_opt=module=${module}`,
                    'microservice.proto'
                ],
                stagingDir
            );
            for (const [file, content] of files) {
                fs.outputFileSync(path.join(stagingDir, file), content);
            }
        });
    }

    private buildServiceView(service: SdkServiceDescriptor) {
        const goName = toGoCamelCase(service.name);
        const clientName = `${goName}Client`;
        const description = service.description ? ` ${service.description}` : '';

        return {
            // Also the name of the client interface protoc-gen-go-grpc generates in the pb package
            clientName,
            docLines: `${clientName} calls the ${service.name} service.${description}`.split('\n'),
            methods: service.methods.map((method) => this.buildMethodView(method))
        };
    }

    private buildMethodView(method: SdkMethodDescriptor) {
        const goName = toGoCamelCase(method.name);
        const isEmpty = method.responseKind === 'empty';
        const returnType = this.returnType(method);
        const docLines = `${goName} ${method.description || `calls the ${method.name} rpc.`}`.split('\n');
        if (method.metadataKeys.length) {
            docLines.push(`Metadata read by the server: ${method.metadataKeys.join(', ')}.`);
        }

        let signatureReturn = isEmpty ? 'error' : `(${returnType}, error)`;
        if (method.isStream) {
            signatureReturn = `(*Stream[${returnType}], error)`;
        }

        return {
            goName,
            docLines,
            requestType: method.requestType ? `*pb.${toGoCamelCase(method.requestType)}` : undefined,
            requestArg: method.requestType ? 'req' : '&emptypb.Empty{}',
            isStream: method.isStream,
            isEmpty,
            returnType,
            signatureReturn,
            zeroValue: this.zeroValue(method),
            unwrapExpr: this.unwrapExpression(method)
        };
    }

    private returnType(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'empty':
                // Only reachable for streams; unary empty responses return `error` alone.
                return '*emptypb.Empty';
            case 'list':
                return `[]*pb.${toGoCamelCase(method.responseType)}`;
            case 'native':
                return goNativeTypes[method.responseType];
            case 'nativeList':
                return `[]${goNativeTypes[method.responseType]}`;
            default:
                return `*pb.${toGoCamelCase(method.responseType)}`;
        }
    }

    private zeroValue(method: SdkMethodDescriptor): string {
        return method.responseKind === 'native' ? goNativeZeroValues[method.responseType] : 'nil';
    }

    private unwrapExpression(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'list':
            case 'nativeList':
                return 'res.GetItems()';
            case 'native':
            case 'nullable':
                return 'res.GetValue()';
            default:
                return 'res';
        }
    }

    private buildEnumView(item: SdkEnumDescriptor) {
        const goName = toGoCamelCase(item.name);

        return {
            name: item.name,
            goName,
            goType: item.valueType === 'number' ? 'int32' : 'string',
            // SdkDescriptorService already left out enums with mixed, non-integer or colliding members
            entries: item.entries.map((entry) => ({
                constName: `${goName}${enumMemberName(entry.key)}`,
                literal: item.valueType === 'number' ? String(entry.value) : JSON.stringify(String(entry.value))
            }))
        };
    }

    private format(goFiles: string[]): void {
        if (!findBinary('gofmt')) {
            this.logger.warn('gofmt is not on PATH; the generated Go files are left unformatted.');
            return;
        }
        try {
            runBinary('gofmt', ['-w', ...goFiles], this.outputDir);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`gofmt failed; the generated Go files are left unformatted: ${reason}`);
        }
    }

    /**
     * go.mod is rewritten on every run with only the direct requirements, so the module needs
     * `go mod tidy` after each run before it builds. Without `go.build` a missing or old Go, or a
     * failing tidy (for example without network), is a warning; with `go.build` it is an error.
     */
    private tidy(): void {
        const required = Boolean(this.config.go.build);
        const { goVersion } = GO_SDK_TOOLCHAIN;
        const manualStep = `run "go mod tidy" with Go ${goVersion} or newer in ${this.outputDir} before building the module.`;

        if (!findBinary('go')) {
            if (required) {
                throw new Error('"go.build" is true but go is not on PATH.');
            }
            this.logger.warn(`go is not on PATH; ${manualStep}`);
            return;
        }

        const version = this.readGoVersion();
        if (version && !isVersionAtLeast(version, goVersion)) {
            if (required) {
                throw new Error(`"go.build" needs Go ${goVersion} or newer, found ${version}.`);
            }
            this.logger.warn(`The generated go.mod needs Go ${goVersion} or newer, found Go ${version}; ${manualStep}`);
            return;
        }

        try {
            runBinary('go', ['mod', 'tidy'], this.outputDir);
        } catch (error) {
            if (required) {
                throw error;
            }
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`go mod tidy failed; ${manualStep} ${reason}`);
        }
    }

    /** Runs after tidy(), which already checked that go is on PATH and new enough. */
    private build(): void {
        this.logger.log('Building the Go SDK');
        runBinary('go', ['build', './...'], this.outputDir);
    }

    private readGoVersion(): string | undefined {
        try {
            return /go(\d+\.\d+(?:\.\d+)?)/.exec(runBinary('go', ['version'], this.outputDir) ?? '')?.[1];
        } catch {
            return undefined;
        }
    }
}
