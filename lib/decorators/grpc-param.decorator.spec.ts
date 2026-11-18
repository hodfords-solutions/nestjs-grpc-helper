/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import {
    GrpcEnum,
    GrpcEnums,
    GrpcId,
    GrpcIds,
    GrpcPagination,
    GrpcParam,
    GrpcSort,
    SdkFlattenParams
} from './grpc-param.decorator.js';
import { DIRECT_PARAMETERS_METADATA_KEY, FLATTEN_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const.js';
import { ParameterOptionType } from '../types/parameter-option.type.js';
import { PropertyOptionType } from '../types/property-option.type.js';
import { propertyStorage } from '../storages/property.storage.js';
import { GenerateProtoService } from '../services/generate-proto.service.js';
import { GrpcAction } from './microservice.decorator.js';
import os from 'node:os';
import { PaginationDto } from '../dto/pagination.dto.js';
import { SortDto } from '../dto/sort.dto.js';

enum StringEnum {
    STANDARD = 'standard',
    PREMIUM = 'premium'
}

enum NumericEnum {
    ONE = 1,
    TWO = 2
}

function getParams(target: object, propertyKey: string): ParameterOptionType[] {
    return Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, target, propertyKey);
}

describe('GrpcParam', () => {
    it('records the parameter name, index and options', () => {
        class Service {
            find(@GrpcParam({ name: 'keyword', type: 'string', required: false }) keyword: string): string {
                return keyword;
            }
        }

        expect(getParams(Service.prototype, 'find')).toEqual([
            { name: 'keyword', type: 'string', required: false, index: 0 }
        ]);
    });

    it('converts String, Number and Boolean constructors to primitive type names', () => {
        class Service {
            find(
                @GrpcParam({ name: 'name', type: String }) name: string,
                @GrpcParam({ name: 'age', type: Number }) age: number,
                @GrpcParam({ name: 'active', type: Boolean }) active: boolean
            ): void {
                void name;
                void age;
                void active;
            }
        }

        const params = getParams(Service.prototype, 'find');
        expect(params.map(({ name, type, index }) => ({ name, type, index }))).toEqual([
            { name: 'name', type: 'string', index: 0 },
            { name: 'age', type: 'number', index: 1 },
            { name: 'active', type: 'boolean', index: 2 }
        ]);
    });

    it('sorts the recorded parameters by index even though decorators apply in reverse', () => {
        class Service {
            find(
                @GrpcParam({ name: 'first', type: 'string' }) first: string,
                @GrpcParam({ name: 'second', type: 'string' }) second: string
            ): void {
                void first;
                void second;
            }
        }

        expect(getParams(Service.prototype, 'find').map((param) => param.name)).toEqual(['first', 'second']);
    });
});

describe('GrpcId', () => {
    it('records a required string parameter with two validation decorators', () => {
        class Service {
            getUser(@GrpcId('userId') userId: string): string {
                return userId;
            }
        }

        const [param] = getParams(Service.prototype, 'getUser');
        expect(param).toEqual(expect.objectContaining({ name: 'userId', type: 'string', required: true, index: 0 }));
        expect(param.isArray).toBeUndefined();
        expect(param.decorators).toHaveLength(2);
        param.decorators.forEach((decorator) => expect(typeof decorator).toBe('function'));
    });
});

describe('GrpcIds', () => {
    it('records a required string array parameter', () => {
        class Service {
            getUsers(@GrpcIds('userIds') userIds: string[]): string[] {
                return userIds;
            }
        }

        const [param] = getParams(Service.prototype, 'getUsers');
        expect(param).toEqual(
            expect.objectContaining({ name: 'userIds', type: 'string', required: true, isArray: true, index: 0 })
        );
        expect(param.decorators).toHaveLength(2);
    });
});

describe('GrpcEnum', () => {
    it('derives the type from a string enum', () => {
        class Service {
            getByType(
                @GrpcEnum({ name: 'userType', enum: StringEnum, enumName: 'StringEnum' }) userType: StringEnum
            ): StringEnum {
                return userType;
            }
        }

        const [param] = getParams(Service.prototype, 'getByType');
        expect(param).toEqual(
            expect.objectContaining({
                name: 'userType',
                type: 'string',
                enumName: 'StringEnum',
                enum: StringEnum,
                required: true,
                index: 0
            })
        );
        expect(param.decorators).toHaveLength(2);
    });

    it('derives type "number" for numeric enums, ignoring their reverse mappings', () => {
        class Service {
            getByLevel(@GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum' }) level: number): void {
                void level;
            }
        }

        const [param] = getParams(Service.prototype, 'getByLevel');
        expect(param).toEqual(
            expect.objectContaining({
                name: 'level',
                type: 'number',
                enumName: 'NumericEnum',
                enum: NumericEnum,
                required: true,
                index: 0
            })
        );
    });

    it('throws when the enum has no members', () => {
        expect(() => GrpcEnum({ name: 'value', enum: {}, enumName: 'EmptyEnum' })).toThrow(
            'Unable to determine enum type in GrpcEnum decorator'
        );
    });
});

describe('GrpcEnum format', () => {
    // The int32 default is applied by @Property, which @GrpcAction calls for every parameter of the params DTO
    function paramsDtoOption(target: Function, propertyKey: string, name: string): PropertyOptionType {
        const [paramsDto] = Reflect.getMetadata('design:paramtypes', target.prototype, propertyKey);
        return propertyStorage.get(paramsDto).find((property) => property.name === name).option;
    }

    it('defaults numeric enums to format "int32" so the proto type is valid', () => {
        class Service {
            @GrpcAction()
            getByLevel(@GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum' }) level: number): void {
                void level;
            }
        }

        const option = paramsDtoOption(Service, 'getByLevel', 'level');
        expect(option).toMatchObject({ type: 'number', format: 'int32' });
        expect(new GenerateProtoService('pkg', os.tmpdir()).getProtoType(option)).toBe('int32');
    });

    it('defaults numeric enum arrays to format "int32"', () => {
        class Service {
            @GrpcAction()
            getByLevels(
                @GrpcEnums({ name: 'levels', enum: NumericEnum, enumName: 'NumericEnum' }) levels: number[]
            ): void {
                void levels;
            }
        }

        expect(paramsDtoOption(Service, 'getByLevels', 'levels')).toMatchObject({
            type: 'number',
            format: 'int32',
            isArray: true
        });
    });

    it('keeps an explicit format on numeric enums', () => {
        class Service {
            @GrpcAction()
            getByLevel(
                @GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum', format: 'int64' }) level: number
            ): void {
                void level;
            }
        }

        expect(paramsDtoOption(Service, 'getByLevel', 'level').format).toBe('int64');
    });

    it('does not add a format to string enums', () => {
        class Service {
            @GrpcAction()
            getByType(
                @GrpcEnum({ name: 'userType', enum: StringEnum, enumName: 'StringEnum' }) userType: string
            ): void {
                void userType;
            }
        }

        expect(paramsDtoOption(Service, 'getByType', 'userType').format).toBeUndefined();
    });

    it('leaves the format to @Property instead of adding it to the parameter options', () => {
        class Service {
            getByLevel(@GrpcEnum({ name: 'level', enum: NumericEnum, enumName: 'NumericEnum' }) level: number): void {
                void level;
            }
        }

        const [param] = getParams(Service.prototype, 'getByLevel');
        expect(param.type).toBe('number');
        expect(param.format).toBeUndefined();
    });
});

describe('GrpcEnums', () => {
    it('records a required enum array parameter', () => {
        class Service {
            getByTypes(
                @GrpcEnums({ name: 'userTypes', enum: StringEnum, enumName: 'StringEnum' }) userTypes: StringEnum[]
            ): StringEnum[] {
                return userTypes;
            }
        }

        const [param] = getParams(Service.prototype, 'getByTypes');
        expect(param).toEqual(
            expect.objectContaining({ name: 'userTypes', type: 'string', required: true, isArray: true, index: 0 })
        );
        expect(param.decorators).toHaveLength(2);
    });
});

describe('GrpcPagination', () => {
    it('records a required "pagination" parameter typed as PaginationDto', () => {
        class Service {
            list(@GrpcPagination() pagination: PaginationDto): PaginationDto {
                return pagination;
            }
        }

        const [param] = getParams(Service.prototype, 'list');
        expect(param).toEqual(
            expect.objectContaining({ name: 'pagination', type: PaginationDto, required: true, index: 0 })
        );
        expect(param.decorators).toHaveLength(2);
    });
});

describe('GrpcSort', () => {
    it('records an optional "sortParam" parameter typed as SortDto', () => {
        class Service {
            list(@GrpcSort() sortParam: SortDto): SortDto {
                return sortParam;
            }
        }

        const [param] = getParams(Service.prototype, 'list');
        expect(param).toEqual(expect.objectContaining({ name: 'sortParam', type: SortDto, required: false, index: 0 }));
        expect(param.decorators).toHaveLength(2);
    });
});

describe('SdkFlattenParams', () => {
    it('flags the method with the flatten parameters metadata', () => {
        class Service {
            @SdkFlattenParams()
            search(): void {}

            plain(): void {}
        }

        expect(Reflect.getMetadata(FLATTEN_PARAMETERS_METADATA_KEY, Service.prototype, 'search')).toBe(true);
        expect(Reflect.getMetadata(FLATTEN_PARAMETERS_METADATA_KEY, Service.prototype, 'plain')).toBeUndefined();
    });
});
