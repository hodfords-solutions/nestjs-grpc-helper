import { Logger } from '@nestjs/common';
import fs from 'fs-extra';
import path from 'node:path';
import { PROTOC_TOOL, RUST_SDK_TOOLCHAIN, SdkToolRequirement } from '../constants/sdk-toolchain.const.js';
import { enumMemberName, toRustIdentifier, toSnakeCase, toUpperCamelCase } from '../helpers/sdk-naming.helper.js';
import { RUST_OWNED_PATHS, stageOwnedPaths } from '../helpers/sdk-output.helper.js';
import { findBinary, isVersionAtLeast, readBinaryVersion, runBinary } from '../helpers/shell.helper.js';
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

const rustNativeTypes = { string: 'String', bool: 'bool', float: 'f32' };
const generatedDir = 'src/generated';
const defaultCrateVersion = '0.1.0';
// The wrapper's constructors, and the methods tonic-build 0.12 defines on its generated client: an rpc with one of
// these names is a duplicate definition (E0592) in tonic's own stub. `clone` is reserved for a different reason: the
// wrapper clones the client per call, and `self.inner.clone()` on an rpc named `clone` would resolve to Clone::clone.
const reservedMethodNames = [
    'connect',
    'new',
    'with_origin',
    'with_interceptor',
    'send_compressed',
    'accept_compressed',
    'max_decoding_message_size',
    'max_encoding_message_size',
    'clone'
];

/** Rust type name of a proto message, as prost generates it. */
function rustTypeName(name: string): string {
    return toRustIdentifier(toUpperCamelCase(name));
}

export class RustSdkGeneratorService extends HbsGeneratorService {
    static readonly requiredTools: SdkToolRequirement[] = [PROTOC_TOOL, ...RUST_SDK_TOOLCHAIN.tools];

    private logger = new Logger(RustSdkGeneratorService.name);
    private outputDir: string;

    constructor(
        private config: SdkBuildConfigType,
        private protocService: ProtocService = new ProtocService()
    ) {
        super();
        this.outputDir = path.resolve(process.cwd(), this.config.rust.output);
    }

    generate(descriptor?: SdkDescriptor): void {
        descriptor ??= new SdkDescriptorService().describe();
        if (!descriptor.services.length) {
            throw new Error('No gRPC microservice with a @GrpcAction method is registered; nothing to generate.');
        }

        this.protocService.assertTools(RustSdkGeneratorService.requiredTools);
        this.writeOwnedPaths(this.renderFiles(descriptor));

        this.format();
        if (this.config.rust.build) {
            this.build();
        }
    }

    private renderFiles(descriptor: SdkDescriptor): Map<string, string> {
        return new Map([
            [
                'Cargo.toml',
                this.compileTemplate('rust/cargo-toml.hbs', {
                    crateName: this.config.rust.crateName,
                    version: this.config.rust.version ?? defaultCrateVersion,
                    rustVersion: RUST_SDK_TOOLCHAIN.minRustVersion,
                    crates: RUST_SDK_TOOLCHAIN.crates
                })
            ],
            [
                'src/client.rs',
                this.compileTemplate('rust/client.hbs', {
                    services: descriptor.services.map((service) => this.buildServiceView(service))
                })
            ],
            ['src/error.rs', this.compileTemplate('rust/error.hbs', {})],
            [
                'src/enums.rs',
                this.compileTemplate('rust/enums.hbs', {
                    enums: descriptor.enums.map((item) => this.buildEnumView(item))
                })
            ]
        ]);
    }

    private writeOwnedPaths(files: Map<string, string>): void {
        stageOwnedPaths(this.outputDir, RUST_OWNED_PATHS, (stagingDir) => {
            new GenerateProtoService(this.config.name, stagingDir).generate();
            fs.ensureDirSync(path.join(stagingDir, generatedDir));
            this.protocService.run(
                ['--proto_path=.', `--prost_out=${generatedDir}`, `--tonic_out=${generatedDir}`, 'microservice.proto'],
                stagingDir
            );
            files.set('src/lib.rs', this.compileTemplate('rust/lib.hbs', this.locateGeneratedFiles(stagingDir)));
            for (const [file, content] of files) {
                fs.outputFileSync(path.join(stagingDir, file), content);
            }
        });
    }

    /**
     * protoc-gen-prost names its file after the proto package and protoc-gen-tonic adds `.tonic.rs`.
     * Depending on the plugin version the prost file may already `include!` the tonic file, so both
     * layouts are detected here instead of being assumed.
     */
    private locateGeneratedFiles(rootDir: string): { protoFile: string; tonicFile: string; includeTonicFile: boolean } {
        const generatedPath = path.join(rootDir, generatedDir);
        const files = fs.readdirSync(generatedPath).filter((file) => file.endsWith('.rs'));
        const tonicFiles = files.filter((file) => file.endsWith('.tonic.rs'));
        const protoFiles = files.filter((file) => !file.endsWith('.tonic.rs'));

        if (protoFiles.length !== 1 || tonicFiles.length !== 1) {
            throw new Error(
                `Expected one prost file and one tonic file in ${generatedDir}, found: ${files.join(', ') || 'none'}.`
            );
        }

        const [protoFile] = protoFiles;
        const [tonicFile] = tonicFiles;
        const protoContent = fs.readFileSync(path.join(generatedPath, protoFile), 'utf8');

        return { protoFile, tonicFile, includeTonicFile: !protoContent.includes(tonicFile) };
    }

    private buildServiceView(service: SdkServiceDescriptor) {
        const typeName = toUpperCamelCase(service.name);
        const description = service.description ? ` ${service.description}` : '';

        return {
            // Also the name of tonic's generated client, which lives in the `moduleName` module
            clientName: `${typeName}Client`,
            moduleName: `${toSnakeCase(service.name)}_client`,
            docLines: `Client of the ${service.name} service.${description}`.split('\n'),
            methods: service.methods.map((method) => this.buildMethodView(service, method))
        };
    }

    private buildMethodView(service: SdkServiceDescriptor, method: SdkMethodDescriptor) {
        const snakeName = toSnakeCase(method.name);
        if (reservedMethodNames.includes(snakeName)) {
            throw new Error(
                `Rust SDK: rpc "${service.name}.${method.name}" maps to the reserved method name "${snakeName}". Rename the rpc.`
            );
        }
        const docLines = (method.description || `Calls the ${method.name} rpc.`).split('\n');
        if (method.metadataKeys.length) {
            docLines.push(`Metadata read by the server: ${method.metadataKeys.join(', ')}.`);
        }

        return {
            // Same as tonic: a keyword such as `move` becomes the raw identifier `r#move`
            fnName: toRustIdentifier(snakeName),
            docLines,
            requestType: method.requestType ? `pb::${rustTypeName(method.requestType)}` : undefined,
            requestArg: method.requestType ? 'request' : '()',
            isStream: method.isStream,
            returnType: this.returnType(method),
            unwrapExpr: this.unwrapExpression(method)
        };
    }

    private returnType(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'empty':
                return '()';
            case 'list':
                return `Vec<pb::${rustTypeName(method.responseType)}>`;
            case 'native':
                return rustNativeTypes[method.responseType];
            case 'nativeList':
                return `Vec<${rustNativeTypes[method.responseType]}>`;
            case 'nullable':
                return `Option<pb::${rustTypeName(method.responseType)}>`;
            default:
                return `pb::${rustTypeName(method.responseType)}`;
        }
    }

    private unwrapExpression(method: SdkMethodDescriptor): string {
        switch (method.responseKind) {
            case 'list':
            case 'nativeList':
                return 'response.items';
            case 'native':
            case 'nullable':
                return 'response.value';
            default:
                return 'response';
        }
    }

    private buildEnumView(item: SdkEnumDescriptor) {
        const isNumber = item.valueType === 'number';

        return {
            rustName: rustTypeName(item.name),
            isNumber,
            // SdkDescriptorService already left out enums with mixed, non-integer or colliding members
            entries: item.entries.map((entry) => ({
                variant: toRustIdentifier(enumMemberName(entry.key)),
                literal: isNumber ? String(entry.value) : JSON.stringify(String(entry.value))
            }))
        };
    }

    private format(): void {
        if (!findBinary('cargo')) {
            this.logger.warn('cargo is not on PATH; the generated Rust files are left unformatted.');
            return;
        }
        try {
            runBinary('cargo', ['fmt'], this.outputDir);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`cargo fmt failed; the generated Rust files are left unformatted: ${reason}`);
        }
    }

    private build(): void {
        if (!findBinary('cargo')) {
            throw new Error('"rust.build" is true but cargo is not on PATH.');
        }
        const { minRustVersion } = RUST_SDK_TOOLCHAIN;
        const version = readBinaryVersion('cargo');
        if (version && !isVersionAtLeast(version, minRustVersion)) {
            throw new Error(
                `"rust.build" needs Rust ${minRustVersion} or newer, found ${version}. Run "rustup update stable".`
            );
        }
        this.logger.log('Building the Rust SDK');
        runBinary('cargo', ['check'], this.outputDir);
    }
}
