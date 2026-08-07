/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { RESPONSE_METADATA_KEY } from '@hodfords/nestjs-response';
import { GRPC_METHOD_METADATA_KEY, GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';
import { Property } from '../decorators/property.decorator';
import { SdkExpose } from '../decorators/sdk-expose.decorator';
import { NativeBooleanValue } from '../responses/native.response';
import { microserviceStorage } from '../storages/microservice.storage';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import {
    addPropertyToStorage,
    collectMethodUsedClasses,
    extractProperties,
    getClassHasProperties,
    getPropertiesOfClass,
    traverseSDKProperties
} from './property.helper';

enum UserTypeFixtureEnum {
    ADMIN = 'ADMIN',
    STANDARD = 'STANDARD'
}

class NestedAddressFixture {
    @Property({ type: String })
    street: string;
}

class LazyTagFixture {
    @Property({ type: String })
    label: string;
}

class UserFixtureResponse {
    @Property({ type: String, description: 'user name' })
    name: string;

    @Property({ type: String, required: false, enum: UserTypeFixtureEnum, enumName: 'UserTypeFixtureEnum' })
    type?: UserTypeFixtureEnum;

    @Property({ type: NestedAddressFixture })
    address: NestedAddressFixture;

    @Property({ type: () => LazyTagFixture, isArray: true })
    tags: LazyTagFixture[];
}

class QueryFixtureDto {
    @Property({ type: 'string' })
    keyword: string;
}

class BaseFixture {
    @Property({ type: String })
    id: string;

    @Property({ type: String, description: 'base name' })
    name: string;
}

class ChildFixture extends BaseFixture {
    @Property({ type: String, description: 'child name' })
    name: string;

    @Property({ type: 'bool' } as any)
    active: boolean;
}

class PlainChildFixture extends BaseFixture {}

@SdkExpose()
class ExposedFixture {
    @Property({ type: String })
    note: string;
}

type MethodFixture = {
    name: string;
    paramType?: Function;
    responseClass?: Function;
    isGrpcMethod?: boolean;
};

function createMicroservice(methods: MethodFixture[]): Function {
    class TestMicroservice {}
    for (const method of methods) {
        const handler = function (): void {};
        Object.defineProperty(TestMicroservice.prototype, method.name, {
            value: handler,
            configurable: true,
            writable: true
        });
        if (method.isGrpcMethod !== false) {
            Reflect.defineMetadata(GRPC_METHOD_METADATA_KEY, true, TestMicroservice.prototype, method.name);
        }
        if (method.paramType) {
            Reflect.defineMetadata('design:paramtypes', [method.paramType], TestMicroservice.prototype, method.name);
            Reflect.defineMetadata(GRPC_PARAM_INDEX_METADATA_KEY, 0, TestMicroservice.prototype, method.name);
        }
        if (method.responseClass) {
            Reflect.defineMetadata(
                RESPONSE_METADATA_KEY,
                { responseClass: method.responseClass, isArray: false, isAllowEmpty: false },
                handler
            );
        }
    }
    microserviceStorage.push(TestMicroservice);
    return TestMicroservice;
}

function makeNamedClass(name: string, props: Record<string, any>): Function {
    const namedClass = class {};
    Object.defineProperty(namedClass, 'name', { value: name });
    for (const [propertyName, option] of Object.entries(props)) {
        addPropertyToStorage(namedClass, propertyName, option);
    }
    return namedClass;
}

describe('property.helper', () => {
    let propertyKeysSnapshot: Set<Function>;
    let sdkDtosSnapshot: Set<Function>;
    let microserviceCountSnapshot: number;

    beforeEach(() => {
        propertyKeysSnapshot = new Set(propertyStorage.keys());
        sdkDtosSnapshot = new Set(sdkDtos);
        microserviceCountSnapshot = microserviceStorage.length;
    });

    afterEach(() => {
        for (const key of Array.from(propertyStorage.keys())) {
            if (!propertyKeysSnapshot.has(key)) {
                propertyStorage.delete(key);
            }
        }
        for (const dto of Array.from(sdkDtos)) {
            if (!sdkDtosSnapshot.has(dto)) {
                sdkDtos.delete(dto);
            }
        }
        microserviceStorage.length = microserviceCountSnapshot;
    });

    describe('addPropertyToStorage', () => {
        it('creates a storage entry for a new class', () => {
            class FreshFixture {}
            addPropertyToStorage(FreshFixture, 'field', { type: 'string' });

            expect(propertyStorage.get(FreshFixture)).toEqual([{ name: 'field', option: { type: 'string' } }]);
        });

        it('appends additional properties to an existing entry', () => {
            class TwoFieldFixture {}
            addPropertyToStorage(TwoFieldFixture, 'first', { type: 'string' });
            addPropertyToStorage(TwoFieldFixture, 'second', { type: 'uint32' } as any);

            expect(propertyStorage.get(TwoFieldFixture).map((property) => property.name)).toEqual(['first', 'second']);
        });

        it('merges options when the same property is registered twice', () => {
            class MergedFixture {}
            addPropertyToStorage(MergedFixture, 'field', { type: 'string' });
            addPropertyToStorage(MergedFixture, 'field', { required: false, description: 'merged' });

            const properties = propertyStorage.get(MergedFixture);
            expect(properties).toHaveLength(1);
            expect(properties[0].option).toEqual({ type: 'string', required: false, description: 'merged' });
        });

        it('registers the class as an sdk dto when not auto generated', () => {
            class SdkDtoFixture {}
            addPropertyToStorage(SdkDtoFixture, 'field', { type: 'string' });

            expect(sdkDtos.has(SdkDtoFixture)).toBe(true);
        });

        it('does not register auto generated classes as sdk dtos', () => {
            class AutoGeneratedFixture {}
            addPropertyToStorage(AutoGeneratedFixture, 'field', { type: 'string', isAutoGenerated: true });

            expect(sdkDtos.has(AutoGeneratedFixture)).toBe(false);
        });
    });

    describe('getClassHasProperties', () => {
        it('returns the classes registered in the property storage', () => {
            expect(Array.from(getClassHasProperties())).toContain(UserFixtureResponse);
        });
    });

    describe('getPropertiesOfClass', () => {
        it('returns the decorated properties with converted types', () => {
            const properties = getPropertiesOfClass(QueryFixtureDto);

            expect(properties).toHaveLength(1);
            expect(properties[0].name).toBe('keyword');
            expect(properties[0].option.type).toBe('string');
        });

        it('converts constructor types to lowercase names through the Property decorator', () => {
            const properties = getPropertiesOfClass(NestedAddressFixture);

            expect(properties[0].option.type).toBe('string');
        });

        it('returns an empty array for classes without registered properties', () => {
            class UnregisteredFixture {}
            expect(getPropertiesOfClass(UnregisteredFixture)).toEqual([]);
        });

        it('collects inherited properties and lets the child override the parent', () => {
            const properties = getPropertiesOfClass(ChildFixture);
            const names = properties.map((property) => property.name);

            expect(names).toEqual(['name', 'active', 'id']);
            const nameProperty = properties.find((property) => property.name === 'name');
            expect(nameProperty.option.description).toBe('child name');
        });

        it('returns an empty array for subclasses without their own properties', () => {
            // Current behavior: traversal bails out early when the child class has no own entry,
            // inherited properties are only reachable through the @ExtendType decorator.
            expect(getPropertiesOfClass(PlainChildFixture)).toEqual([]);
        });
    });

    describe('collectMethodUsedClasses', () => {
        it('collects grpc value parameter types and response classes', () => {
            createMicroservice([{ name: 'findUser', paramType: QueryFixtureDto, responseClass: UserFixtureResponse }]);

            const usedClasses = collectMethodUsedClasses();
            expect(usedClasses.has(QueryFixtureDto)).toBe(true);
            expect(usedClasses.has(UserFixtureResponse)).toBe(true);
        });

        it('maps primitive response classes to their native value wrappers', () => {
            createMicroservice([{ name: 'check', paramType: QueryFixtureDto, responseClass: Boolean }]);

            const usedClasses = collectMethodUsedClasses();
            expect(usedClasses.has(NativeBooleanValue)).toBe(true);
            expect(usedClasses.has(Boolean as any)).toBe(false);
        });

        it('ignores methods without grpc method metadata', () => {
            class IgnoredParamFixture {}
            createMicroservice([{ name: 'internal', paramType: IgnoredParamFixture, isGrpcMethod: false }]);

            expect(collectMethodUsedClasses().has(IgnoredParamFixture)).toBe(false);
        });

        it('collects only the response when no grpc value parameter exists', () => {
            createMicroservice([{ name: 'list', responseClass: UserFixtureResponse }]);

            const usedClasses = collectMethodUsedClasses();
            expect(usedClasses.has(UserFixtureResponse)).toBe(true);
        });
    });

    describe('traverseSDKProperties', () => {
        it('includes nested and lazy property types, dependencies first', () => {
            createMicroservice([{ name: 'findUser', paramType: QueryFixtureDto, responseClass: UserFixtureResponse }]);

            const dtos = traverseSDKProperties();
            expect(dtos).toContain(UserFixtureResponse);
            expect(dtos).toContain(NestedAddressFixture);
            expect(dtos).toContain(LazyTagFixture);
            expect(dtos.indexOf(NestedAddressFixture)).toBeLessThan(dtos.indexOf(UserFixtureResponse));
            expect(dtos.indexOf(LazyTagFixture)).toBeLessThan(dtos.indexOf(UserFixtureResponse));
        });

        it('filters out used classes without registered properties', () => {
            class UndecoratedParamFixture {}
            createMicroservice([{ name: 'noop', paramType: UndecoratedParamFixture }]);

            expect(traverseSDKProperties()).not.toContain(UndecoratedParamFixture);
        });

        it('includes sdk exposed classes only when requested', () => {
            createMicroservice([{ name: 'findUser', paramType: QueryFixtureDto }]);

            expect(traverseSDKProperties()).not.toContain(ExposedFixture);
            expect(traverseSDKProperties({ includeSdkExposed: true })).toContain(ExposedFixture);
        });
    });

    describe('extractProperties', () => {
        it('maps traversed classes by name with their properties', () => {
            createMicroservice([{ name: 'findUser', paramType: QueryFixtureDto, responseClass: UserFixtureResponse }]);

            const extracted = extractProperties();
            expect(extracted.UserFixtureResponse.map((property: any) => property.name)).toEqual([
                'name',
                'type',
                'address',
                'tags'
            ]);
            expect(extracted.QueryFixtureDto).toHaveLength(1);
            expect(extracted.NestedAddressFixture).toBeDefined();
        });

        it('merges classes that share the same name, the earliest registration wins overrides', () => {
            const firstDuplicate = makeNamedClass('DuplicateFixture', {
                name: { type: 'string', description: 'first' },
                age: { type: 'uint32' }
            });
            const secondDuplicate = makeNamedClass('DuplicateFixture', {
                name: { type: 'string', description: 'second' },
                email: { type: 'string' }
            });
            createMicroservice([
                { name: 'first', paramType: firstDuplicate },
                { name: 'second', paramType: secondDuplicate }
            ]);

            const extracted = extractProperties();
            const merged = extracted.DuplicateFixture;
            expect(merged.map((property: any) => property.name).sort()).toEqual(['age', 'email', 'name']);
            const nameProperty = merged.find((property: any) => property.name === 'name');
            expect(nameProperty.option.description).toBe('first');
        });
    });
});
