/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
// Register the Native*Value response classes exactly like importing the library index does in production
import '../responses/native.response';
import { ResponseModel } from '@hodfords/nestjs-response';
import * as fs from 'fs-extra';
import * as os from 'os';
import path from 'path';
import { GrpcId, GrpcIds } from '../decorators/grpc-param.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator';
import { Property } from '../decorators/property.decorator';
import { GenerateProtoService } from './generate-proto.service';

enum ProtoStatusEnum {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE'
}

class ProtoNestedDto {
    @Property({ type: String })
    city: string;
}

class ProtoFixtureDto {
    @Property({ type: String, description: 'Name of the user' })
    name: string;

    @Property({ type: Number, format: 'int32' })
    total: number;

    @Property({ type: Number, format: 'float' })
    ratio: number;

    @Property({ type: Boolean, required: false })
    isActive?: boolean;

    @Property({ type: String, isArray: true })
    tags: string[];

    @Property({ type: ProtoNestedDto })
    nested: ProtoNestedDto;

    @Property({ type: String, enum: ProtoStatusEnum, enumName: 'ProtoStatusEnum', required: false })
    status?: ProtoStatusEnum;

    @Property({ type: 'string', format: 'any' })
    data: any;
}

class ProtoFixtureResponse {
    @Property({ type: String })
    id: string;

    @Property({ type: () => ProtoFixtureResponse, required: false })
    parent?: ProtoFixtureResponse;
}

class ProtoUnusedDto {
    @Property({ type: String })
    unusedField: string;
}

@RegisterGrpcMicroservice('Proto fixture microservice')
export class ProtoFixtureMicroservice {
    @GrpcAction('Find one fixture')
    @ResponseModel(ProtoFixtureResponse)
    findOne(@GrpcValue() param: ProtoFixtureDto): ProtoFixtureResponse {
        return param as any;
    }

    @GrpcAction('Find many fixtures')
    @ResponseModel(ProtoFixtureResponse, true)
    findMany(@GrpcValue() param: ProtoFixtureDto): ProtoFixtureResponse[] {
        return [param] as any;
    }

    @GrpcAction('Get a name')
    @ResponseModel(String)
    getName(@GrpcValue() param: ProtoFixtureDto): any {
        return param.name;
    }

    @GrpcAction('Maybe find one')
    @ResponseModel(ProtoFixtureResponse, { isAllowEmpty: true })
    maybeFindOne(@GrpcValue() param: ProtoFixtureDto): any {
        return param as any;
    }

    @GrpcAction('Get by ids')
    @ResponseModel(String)
    getByIds(@GrpcId('userId') userId: string, @GrpcIds('ids') ids: string[]): any {
        return { userId, ids } as any;
    }

    @GrpcAction('No params and no response')
    noopAction(): void {}
}

describe('GenerateProtoService', () => {
    let tempDir: string;
    let protoContent: string;

    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grpc-helper-proto-'));
        new GenerateProtoService('protoFixturePkg', tempDir).generate();
        protoContent = fs.readFileSync(path.join(tempDir, 'microservice.proto'), 'utf8');
    });

    afterAll(() => {
        fs.removeSync(tempDir);
    });

    it('should write a proto3 file with the package definition and empty import', () => {
        expect(protoContent).toContain('syntax = "proto3";');
        expect(protoContent).toContain('import "google/protobuf/empty.proto";');
        expect(protoContent).toContain('package protoFixturePkg;');
    });

    it('should generate a service block with rpc methods for each grpc action', () => {
        expect(protoContent).toContain('service ProtoFixtureMicroservice {');
        expect(protoContent).toContain('rpc findOne (ProtoFixtureDto) returns (ProtoFixtureResponse) {}');
        expect(protoContent).toContain('rpc findMany (ProtoFixtureDto) returns (ProtoProtoFixtureResponseList) {}');
        expect(protoContent).toContain('rpc getName (ProtoFixtureDto) returns (NativeStringValue) {}');
    });

    it('should use google.protobuf.Empty when there is no parameter and no response', () => {
        expect(protoContent).toContain('rpc noopAction (google.protobuf.Empty) returns (google.protobuf.Empty) {}');
    });

    it('should wrap nullable responses with the nullable wrapper message', () => {
        expect(protoContent).toContain(
            'rpc maybeFindOne (ProtoFixtureDto) returns (NullableGrpcClassResponseOfProtoFixtureResponse) {}'
        );
        const normalized = normalize(protoContent);
        expect(normalized).toContain(
            'message NullableGrpcClassResponseOfProtoFixtureResponse { ProtoFixtureResponse value = 1; bool grpcNullable = 2; }'
        );
    });

    it('should generate a params message for direct grpc parameters', () => {
        expect(protoContent).toContain(
            'rpc getByIds (ProtoFixtureMicroserviceGetByIdsParams) returns (NativeStringValue) {}'
        );
        const normalized = normalize(protoContent);
        expect(normalized).toContain(
            'message ProtoFixtureMicroserviceGetByIdsParams { string userId = 1; repeated string ids = 2; }'
        );
    });

    it('should map scalar, array, nested, enum and any properties to proto fields with sequential numbers', () => {
        const normalized = normalize(protoContent);
        expect(normalized).toContain(
            'message ProtoFixtureDto { string name = 1; int32 total = 2; float ratio = 3; bool isActive = 4; ' +
                'repeated string tags = 5; ProtoNestedDto nested = 6; string status = 7; string data = 8; }'
        );
    });

    it('should resolve lazy self references in dto properties', () => {
        const normalized = normalize(protoContent);
        expect(normalized).toContain(
            'message ProtoFixtureResponse { string id = 1; ProtoFixtureResponse parent = 2; }'
        );
    });

    it('should generate nested dto message and the repeated list wrapper for each dto', () => {
        const normalized = normalize(protoContent);
        expect(normalized).toContain('message ProtoNestedDto { string city = 1; }');
        expect(normalized).toContain(
            'message ProtoProtoFixtureResponseList { repeated ProtoFixtureResponse items = 1; bool grpcArray = 2; }'
        );
    });

    it('should generate native value messages and native list messages', () => {
        const normalized = normalize(protoContent);
        expect(normalized).toContain('message NativeStringValue { string value = 1; bool grpcNative = 2; }');
        expect(normalized).toContain('message ProtoStringList { repeated string items = 1; bool grpcArray = 2; }');
        expect(normalized).toContain('message ProtoBooleanList { repeated bool items = 1; bool grpcArray = 2; }');
        expect(normalized).toContain('message ProtoNumberList { repeated float items = 1; bool grpcArray = 2; }');
    });

    it('should not include dtos that are not reachable from any grpc method', () => {
        expect(ProtoUnusedDto.name).toBe('ProtoUnusedDto');
        expect(protoContent).not.toContain('message ProtoUnusedDto');
    });

    describe('generateMicroservice', () => {
        it('should return an empty string for a class without grpc methods', () => {
            class PlainClass {
                doSomething(): void {}
            }
            const service = new GenerateProtoService('pkg', tempDir);
            expect(service.generateMicroservice(PlainClass)).toBe('');
        });
    });

    describe('getProtoType', () => {
        let service: GenerateProtoService;

        beforeAll(() => {
            service = new GenerateProtoService('pkg', tempDir);
        });

        it('should return the class name for function types', () => {
            expect(service.getProtoType({ type: ProtoNestedDto })).toBe('ProtoNestedDto');
        });

        it('should resolve lazy type functions named "type"', () => {
            expect(service.getProtoType({ type: () => ProtoNestedDto })).toBe('ProtoNestedDto');
        });

        it('should map any format to string', () => {
            expect(service.getProtoType({ type: 'string', format: 'any' })).toBe('string');
        });

        it('should use the format for numbers when provided', () => {
            expect(service.getProtoType({ type: 'number', format: 'int32' })).toBe('int32');
            expect(service.getProtoType({ type: 'number', format: 'float' })).toBe('float');
        });

        it('should map boolean to bool', () => {
            expect(service.getProtoType({ type: 'boolean' })).toBe('bool');
        });

        it('should return plain string types as is', () => {
            expect(service.getProtoType({ type: 'string' })).toBe('string');
        });
    });

    describe('generateModel', () => {
        it('should render a message with repeated fields for array properties', () => {
            const service = new GenerateProtoService('pkg', tempDir);
            const content = service.generateModel({ name: 'CustomModel' } as any, [
                { name: 'ids', option: { type: 'string', isArray: true } },
                { name: 'count', option: { type: 'number', format: 'int32' } }
            ]);
            expect(normalize(content)).toContain('message CustomModel { repeated string ids = 1; int32 count = 2; }');
        });
    });
});
