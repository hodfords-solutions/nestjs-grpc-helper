/* eslint-disable max-lines-per-function */
import 'reflect-metadata';

// @faker-js/faker ships ESM only and cannot be parsed by this jest setup; it is irrelevant for generation
jest.mock('@faker-js/faker', () => ({ faker: {} }));

// Register the Native*Value response classes exactly like importing the library index does in production
import '../responses/native.response';
import { ResponseModel } from '@hodfords/nestjs-response';
import * as fs from 'fs-extra';
import * as os from 'os';
import path from 'path';
import { GrpcId } from '../decorators/grpc-param.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator';
import { MockResponseSample } from '../decorators/mock.decorator';
import { Property } from '../decorators/property.decorator';
import { SdkExpose } from '../decorators/sdk-expose.decorator';
import { GenerateMicroserviceService } from './generate-microservice.service';

enum SdkStatusEnum {
    ACTIVE = 'ACTIVE',
    DISABLED = 'DISABLED'
}

class SdkNestedDto {
    @Property({ type: String })
    city: string;
}

class SdkParamDto {
    @Property({ type: String, description: 'Keyword to search' })
    keyword: string;

    @Property({ type: SdkNestedDto, required: false })
    nested?: SdkNestedDto;

    @Property({ type: String, enum: SdkStatusEnum, enumName: 'SdkStatusEnum', required: false })
    status?: SdkStatusEnum;

    @Property({ type: Boolean, required: false })
    flag?: boolean;
}

class SdkUserResponse {
    @Property({ type: String })
    id: string;

    @Property({ type: String, isArray: true, required: false })
    tags?: string[];
}

@SdkExpose()
export class SdkExposedDto {
    @Property({ type: String })
    note: string;
}

export class SdkUnusedDto {
    @Property({ type: String })
    hidden: string;
}

@RegisterGrpcMicroservice('Sdk fixture microservice')
export class SdkFixtureMicroservice {
    @GrpcAction('Find one user')
    @ResponseModel(SdkUserResponse)
    findOne(@GrpcValue() param: SdkParamDto): SdkUserResponse {
        return param as any;
    }

    @GrpcAction('Find many users')
    @ResponseModel(SdkUserResponse, true)
    @MockResponseSample([{ id: 'mocked' }])
    findMany(@GrpcValue() param: SdkParamDto): SdkUserResponse[] {
        return [param] as any;
    }

    @GrpcAction('Get user name by id')
    @ResponseModel(String)
    getNameById(@GrpcId('userId') userId: string): any {
        return userId;
    }

    @GrpcAction('Do something without input or output')
    noopAction(): void {}
}

describe('GenerateMicroserviceService', () => {
    let outputDir: string;
    let serviceContent: string;

    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
    const config = (output: string): any => ({
        name: 'fixtureSdk',
        packageName: '@test/fixture-sdk',
        output,
        addAllowDecorator: true
    });

    beforeAll(() => {
        outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grpc-helper-sdk-'));
        new GenerateMicroserviceService(config(outputDir)).generate();
        serviceContent = fs.readFileSync(path.join(outputDir, 'services/fixture-sdk.service.ts'), 'utf8');
    });

    afterAll(() => {
        fs.removeSync(outputDir);
    });

    it('should generate the full sdk package file tree', () => {
        const expectedFiles = [
            'index.ts',
            'package.json',
            'microservice.proto',
            'fixture-sdk.module.ts',
            'fixture-sdk.mock.module.ts',
            'services/fixture-sdk.service.ts',
            'helpers/grpc.helper.ts',
            'types/microservice-option.type.ts',
            'SKILL.md',
            'skill.json'
        ];
        for (const file of expectedFiles) {
            expect(fs.existsSync(path.join(outputDir, file))).toBe(true);
        }
    });

    it('should generate the index file re-exporting the kebab-cased module files', () => {
        const indexContent = fs.readFileSync(path.join(outputDir, 'index.ts'), 'utf8');
        expect(indexContent).toContain("export * from './helpers/grpc.helper'");
        expect(indexContent).toContain("export * from './fixture-sdk.module'");
        expect(indexContent).toContain("export * from './fixture-sdk.mock.module'");
        expect(indexContent).toContain("export * from './services/fixture-sdk.service';");
        expect(indexContent).toContain("export * from './types/microservice-option.type';");
    });

    it('should generate the proto definition alongside the sdk', () => {
        const protoContent = fs.readFileSync(path.join(outputDir, 'microservice.proto'), 'utf8');
        expect(protoContent).toContain('package fixtureSdk;');
        expect(protoContent).toContain('service SdkFixtureMicroservice {');
        expect(protoContent).toContain('rpc findOne (SdkParamDto) returns (SdkUserResponse) {}');
    });

    describe('generated service file', () => {
        it('should generate an injectable service class per microservice', () => {
            expect(serviceContent).toContain('@Injectable()');
            expect(serviceContent).toContain('export class SdkFixtureMicroservice {');
            expect(serviceContent).toContain("@Inject('fixtureSdk_PACKAGE') private client: ClientGrpc");
        });

        it('should generate typed methods calling the grpc helper', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain('async findOne(param: SdkParamDto): Promise<SdkUserResponse> {');
            expect(normalized).toContain('return await GrpcHelper.with(this.client, SdkUserResponse, this.options)');
            expect(normalized).toContain(".service('SdkFixtureMicroservice')");
            expect(normalized).toContain(".method('findOne')");
            expect(normalized).toContain('.data(param, SdkParamDto)');
            expect(normalized).toContain('.getOne() as any;');
        });

        it('should generate array methods with getMany', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain('async findMany(param: SdkParamDto): Promise<SdkUserResponse[]> {');
            expect(normalized).toContain('.getMany() as any;');
        });

        it('should flatten direct grpc params into the method signature', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain('async getNameById( userId: string ): Promise<string> {');
            expect(normalized).toContain('const param = { userId, };');
            expect(normalized).toContain('.data(param, SdkFixtureMicroserviceGetNameByIdParams)');
        });

        it('should generate void methods without parameters', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain('async noopAction(): Promise<void> {');
        });

        it('should generate a mock service class with sample based bodies', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain('export class MockSdkFixtureMicroservice {');
            expect(normalized).toContain('return sample(SdkUserResponse) as any;');
            expect(normalized).toContain('return [{"id":"mocked"}] as any;');
        });

        it('should generate model classes for used and sdk-exposed dtos only', () => {
            expect(serviceContent).toContain('export class SdkParamDto {');
            expect(serviceContent).toContain('export class SdkNestedDto {');
            expect(serviceContent).toContain('export class SdkUserResponse {');
            expect(serviceContent).toContain('export class SdkExposedDto {');
            expect(serviceContent).not.toContain('export class SdkUnusedDto');
        });

        it('should generate model properties with decorators and typescript types', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain(
                '@Property({"type":"string","description":"Keyword to search","isAutoGenerated":true})'
            );
            expect(normalized).toContain('@Allow()');
            expect(normalized).toContain('keyword: string');
            expect(normalized).toContain('@Type(() => SdkNestedDto)');
            expect(normalized).toContain('nested?: ReturnType<() => SdkNestedDto >');
            expect(normalized).toContain('status?: SdkStatusEnum');
            expect(normalized).toContain('tags?: string []');
        });

        it('should generate enum blocks once per enum', () => {
            const normalized = normalize(serviceContent);
            expect(normalized).toContain("export enum SdkStatusEnum { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED', }");
            expect(serviceContent.match(/export enum SdkStatusEnum/g)).toHaveLength(1);
        });
    });

    describe('generated modules', () => {
        it('should generate the dynamic module with package scoped tokens', () => {
            const moduleContent = fs.readFileSync(path.join(outputDir, 'fixture-sdk.module.ts'), 'utf8');
            expect(moduleContent).toContain('export class FixtureSdkModule {');
            expect(moduleContent).toContain("name: 'fixtureSdk_PACKAGE'");
            expect(moduleContent).toContain("provide: 'fixtureSdk_OPTIONS'");
            expect(moduleContent).toContain("import { SdkFixtureMicroservice } from './services/fixture-sdk.service';");
        });

        it('should generate the mock module providing mock implementations', () => {
            const mockModuleContent = fs.readFileSync(path.join(outputDir, 'fixture-sdk.mock.module.ts'), 'utf8');
            const normalized = normalize(mockModuleContent);
            expect(normalized).toContain('export class MockFixtureSdkModule {');
            expect(normalized).toContain('{ provide: SdkFixtureMicroservice, useClass: MockSdkFixtureMicroservice }');
        });
    });

    describe('generated package.json', () => {
        it('should write the package file with the configured package name', () => {
            const sdkPackage = fs.readJsonSync(path.join(outputDir, 'package.json'));
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const hostPackage = require(path.join(process.cwd(), 'package.json'));

            expect(sdkPackage.name).toBe('@test/fixture-sdk');
            expect(sdkPackage.version).toBe(hostPackage.version);
            expect(sdkPackage.scripts).toEqual({ build: 'tsc' });
            expect(sdkPackage.peerDependencies['@nestjs/common']).toBe('*');
            expect(sdkPackage.peerDependencies['class-validator']).toBe('*');
        });

        it('should omit class-validator and the build script depending on the config', () => {
            const service = new GenerateMicroserviceService({
                name: 'fixtureSdk',
                output: outputDir,
                build: true,
                addAllowDecorator: false
            } as any);
            const packageContent = service.getPackageJsonContent();

            expect(packageContent.scripts).toEqual({});
            expect(packageContent.peerDependencies['class-validator']).toBeUndefined();
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const hostPackage = require(path.join(process.cwd(), 'package.json'));
            expect(packageContent.name).toBe(hostPackage.name);
        });
    });

    describe('copied sdk stub', () => {
        it('should copy the runtime grpc helper into the sdk', () => {
            const helperContent = fs.readFileSync(path.join(outputDir, 'helpers/grpc.helper.ts'), 'utf8');
            expect(helperContent).toContain('export class GrpcHelper');
        });
    });
});
