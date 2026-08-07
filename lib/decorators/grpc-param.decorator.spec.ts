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
} from './grpc-param.decorator';
import { DIRECT_PARAMETERS_METADATA_KEY, FLATTEN_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const';
import { ParameterOptionType } from '../types/parameter-option.type';
import { PaginationDto } from '../dto/pagination.dto';
import { SortDto } from '../dto/sort.dto';

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
