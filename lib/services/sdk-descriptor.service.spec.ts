/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { ResponseModel } from '@hodfords/nestjs-response';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator.js';
import { Property } from '../decorators/property.decorator.js';
import { microserviceStorage } from '../storages/microservice.storage.js';
import { propertyStorage, sdkDtos } from '../storages/property.storage.js';
import { SdkDescriptor, SdkMethodDescriptor } from '../types/sdk-descriptor.type.js';
import { GenerateProtoService } from './generate-proto.service.js';
import { SdkDescriptorService } from './sdk-descriptor.service.js';

describe('SdkDescriptorService', () => {
    let descriptor: SdkDescriptor;
    const method = (name: string): SdkMethodDescriptor =>
        descriptor.services[0].methods.find((candidate) => candidate.name === name);

    beforeAll(() => {
        descriptor = new SdkDescriptorService().describe();
    });

    it('describes the registered service', () => {
        expect(descriptor.services).toHaveLength(1);
        expect(descriptor.services[0].name).toBe('SdkFixtureMicroservice');
        expect(descriptor.services[0].description).toBe('Fixture service covering every response kind');
    });

    it('classifies a single model response', () => {
        expect(method('findOne')).toEqual({
            name: 'findOne',
            description: 'Find one item',
            requestType: 'FixtureQueryDto',
            responseKind: 'single',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'FixtureItemResponse',
            isStream: false,
            metadataKeys: []
        });
    });

    it('classifies a list of models', () => {
        expect(method('findMany')).toMatchObject({
            responseKind: 'list',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'ProtoFixtureItemResponseList'
        });
    });

    it('classifies native responses', () => {
        expect(method('getName')).toMatchObject({
            responseKind: 'native',
            responseType: 'string',
            wireResponseType: 'NativeStringValue'
        });
        expect(method('countItems')).toMatchObject({
            responseKind: 'native',
            responseType: 'float',
            wireResponseType: 'NativeNumberValue'
        });
        expect(method('isActive')).toMatchObject({
            responseKind: 'native',
            responseType: 'bool',
            wireResponseType: 'NativeBooleanValue'
        });
    });

    it('classifies a list of natives', () => {
        expect(method('getTags')).toMatchObject({
            responseKind: 'nativeList',
            responseType: 'string',
            wireResponseType: 'ProtoStringList'
        });
    });

    it('classifies a nullable model', () => {
        expect(method('maybeFindOne')).toMatchObject({
            responseKind: 'nullable',
            responseType: 'FixtureItemResponse',
            wireResponseType: 'NullableGrpcClassResponseOfFixtureItemResponse'
        });
    });

    it('classifies a nullable primitive, wrapped like a nullable model around Native*Value', () => {
        expect(method('maybeGetName')).toMatchObject({
            responseKind: 'nullableNative',
            responseType: 'string',
            wireResponseType: 'NullableGrpcClassResponseOfNativeStringValue'
        });
    });

    it('describes a method without request or response', () => {
        expect(method('ping')).toMatchObject({
            requestType: undefined,
            responseKind: 'empty',
            responseType: undefined,
            wireResponseType: 'google.protobuf.Empty'
        });
    });

    it('flags streaming methods and keeps their response kind', () => {
        expect(method('watchItems')).toMatchObject({ isStream: true, responseKind: 'single' });
        expect(method('findOne').isStream).toBe(false);
    });

    it('uses the auto-generated request message for direct parameters', () => {
        expect(method('getByLevel').requestType).toBe('SdkFixtureMicroserviceGetByLevelParams');
    });

    it('lists metadata keys read by the server', () => {
        expect(method('getWorkspace')).toMatchObject({ requestType: undefined, metadataKeys: ['workspace-id'] });
    });

    it('describes string and numeric enums', () => {
        expect(descriptor.enums).toEqual(
            expect.arrayContaining([
                {
                    name: 'FixtureStatusEnum',
                    valueType: 'string',
                    entries: [
                        { key: 'ACTIVE', value: 'active' },
                        { key: 'SUPER_ADMIN', value: 'super_admin' }
                    ]
                },
                {
                    name: 'FixtureLevelEnum',
                    valueType: 'number',
                    entries: [
                        { key: 'LOW', value: 1 },
                        { key: 'HIGH', value: 2 }
                    ]
                }
            ])
        );
    });

    it('describes an array-form enum with one string entry per value', () => {
        expect(descriptor.enums).toContainEqual({
            name: 'FixtureRoleEnum',
            valueType: 'string',
            entries: [
                { key: 'ADMIN', value: 'ADMIN' },
                { key: 'STANDARD', value: 'STANDARD' },
                { key: '1st', value: '1st' }
            ]
        });
    });

    it('omits an enum without entries', () => {
        expect(descriptor.enums.map((item) => item.name)).not.toContain('FixtureEmptyEnum');
        expect(descriptor.enums.map((item) => item.name).sort()).toEqual([
            'FixtureLevelEnum',
            'FixtureRoleEnum',
            'FixtureScopeEnum',
            'FixtureStatusEnum'
        ]);
    });

    describe('agreement with the generated proto', () => {
        let tempDir: string;
        const rpcs = new Map<string, { request: string; response: string; isStream: boolean }>();

        beforeAll(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-descriptor-'));
            new GenerateProtoService('fixturePkg', tempDir).generate();
            const proto = fs.readFileSync(path.join(tempDir, 'microservice.proto'), 'utf8');

            for (const [, serviceName, body] of proto.matchAll(/service (\w+) \{([\s\S]*?)\n\}/g)) {
                for (const [, rpc, request, stream, response] of body.matchAll(
                    /rpc (\w+) \(([\w.]+)\) returns \((stream )?([\w.]+)\) \{\}/g
                )) {
                    rpcs.set(`${serviceName}.${rpc}`, { request, response, isStream: Boolean(stream) });
                }
            }
        });

        afterAll(() => {
            fs.removeSync(tempDir);
        });

        it('matches every rpc request and response message in microservice.proto', () => {
            const described = new Map<string, { request: string; response: string; isStream: boolean }>();
            for (const service of descriptor.services) {
                for (const item of service.methods) {
                    described.set(`${service.name}.${item.name}`, {
                        request: item.requestType ?? 'google.protobuf.Empty',
                        response: item.wireResponseType,
                        isStream: item.isStream
                    });
                }
            }

            expect(rpcs.size).toBeGreaterThan(0);
            expect(Object.fromEntries(described)).toEqual(Object.fromEntries(rpcs));
        });
    });

    describe('enums that cannot be rendered in the Rust and Go SDKs', () => {
        let warn: ReturnType<typeof vi.spyOn>;
        let result: SdkDescriptor;
        let dto: Function;
        let microservice: Function;
        const enumNames = (): string[] => result.enums.map((item) => item.name);
        const skipWarning = (name: string, reason: string): string =>
            `Enum ${name} is skipped in the Rust and Go SDKs: ${reason}.`;

        enum MixedEnum {
            A = 1,
            B = 'b'
        }

        beforeAll(() => {
            warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

            class InvalidEnumsDto {
                @Property({ type: String, enum: ['>', '<', '>='], enumName: 'OperatorEnum' })
                operator: string;

                @Property({ type: Number, format: 'int32', enum: [-1, 1], enumName: 'SignEnum' })
                sign: number;

                @Property({
                    type: String,
                    enum: { IN_PROGRESS: 'in_progress', InProgress: 'in-progress' },
                    enumName: 'CollidingEnum'
                })
                colliding: string;

                @Property({ type: String, enum: [10, 20, 'all'], enumName: 'MixedArrayEnum' })
                mixedArray: string;

                @Property({ type: String, enum: MixedEnum, enumName: 'MixedEnum' })
                mixed: MixedEnum;

                @Property({ type: Number, format: 'float', enum: [1.5, 2], enumName: 'FractionEnum' })
                fraction: number;

                @Property({ type: Number, format: 'int32', enum: ['a', 'b'], enumName: 'NumberTypedStringEnum' })
                numberTyped: number;

                @Property({ type: Number, format: 'int32', enum: { A: 1, B: 1 }, enumName: 'DuplicateValueEnum' })
                duplicateValue: number;

                @Property({ type: Number, format: 'int64', enum: [1, 2147483648], enumName: 'OutOfRangeEnum' })
                outOfRange: number;
            }
            dto = InvalidEnumsDto;

            // Only DTOs reachable from a registered rpc are described
            @RegisterGrpcMicroservice()
            class InvalidEnumsMicroservice {
                @GrpcAction()
                @ResponseModel(InvalidEnumsDto)
                getInvalidEnums(): any {
                    return {};
                }
            }
            microservice = InvalidEnumsMicroservice;

            result = new SdkDescriptorService().describe();
        });

        afterAll(() => {
            microserviceStorage.splice(microserviceStorage.indexOf(microservice), 1);
            propertyStorage.delete(dto);
            sdkDtos.delete(dto);
            warn.mockRestore();
        });

        it('skips an enum whose member maps to an empty name', () => {
            expect(enumNames()).not.toContain('OperatorEnum');
            expect(warn).toHaveBeenCalledWith(skipWarning('OperatorEnum', 'member ">" maps to an empty name'));
        });

        it('skips an enum whose members map to the same name', () => {
            expect(enumNames()).not.toContain('SignEnum');
            expect(enumNames()).not.toContain('CollidingEnum');
            expect(warn).toHaveBeenCalledWith(skipWarning('SignEnum', 'members "-1" and "1" map to the same name'));
            expect(warn).toHaveBeenCalledWith(
                skipWarning('CollidingEnum', 'members "IN_PROGRESS" and "InProgress" map to the same name')
            );
        });

        it('skips an enum that mixes string and number values', () => {
            expect(enumNames()).not.toContain('MixedArrayEnum');
            expect(enumNames()).not.toContain('MixedEnum');
            expect(warn).toHaveBeenCalledWith(skipWarning('MixedArrayEnum', 'it mixes string and number values'));
            expect(warn).toHaveBeenCalledWith(skipWarning('MixedEnum', 'it mixes string and number values'));
        });

        it('skips a numeric enum with a non-integer value', () => {
            expect(enumNames()).not.toContain('FractionEnum');
            expect(warn).toHaveBeenCalledWith(
                skipWarning('FractionEnum', 'value 1.5 of member "1.5" is not an integer')
            );
        });

        it('skips an enum declared as a number whose values are not numbers', () => {
            expect(enumNames()).not.toContain('NumberTypedStringEnum');
            expect(warn).toHaveBeenCalledWith(
                skipWarning('NumberTypedStringEnum', 'it is declared as a number but has non-numeric values')
            );
        });

        it('skips an enum whose members share a value', () => {
            expect(enumNames()).not.toContain('DuplicateValueEnum');
            expect(warn).toHaveBeenCalledWith(
                skipWarning('DuplicateValueEnum', 'members "A" and "B" have the same value')
            );
        });

        it('skips a numeric enum with a value outside the int32 range', () => {
            expect(enumNames()).not.toContain('OutOfRangeEnum');
            expect(warn).toHaveBeenCalledWith(
                skipWarning('OutOfRangeEnum', 'value 2147483648 of member "2147483648" does not fit in an int32')
            );
        });

        it('warns once per skipped enum and keeps the valid enums', () => {
            expect(warn).toHaveBeenCalledTimes(9);
            expect(enumNames()).toEqual(expect.arrayContaining(['FixtureStatusEnum', 'FixtureLevelEnum']));
            expect(result.enums.find((item) => item.name === 'FixtureStatusEnum')).toEqual(
                descriptor.enums.find((item) => item.name === 'FixtureStatusEnum')
            );
        });
    });
});
