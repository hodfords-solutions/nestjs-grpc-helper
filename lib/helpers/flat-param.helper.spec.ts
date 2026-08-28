/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { DIRECT_PARAMETERS_METADATA_KEY, GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';
import { GrpcParam } from '../decorators/grpc-param.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { Property } from '../decorators/property.decorator';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { ParameterOptionType } from '../types/parameter-option.type';
import { checkParamsIsContinuous, createParamDto, moveMetadata, overrideMethod } from './flat-param.helper';

class BodyFixtureDto {
    @Property({ type: String })
    address: string;
}

describe('flat-param.helper', () => {
    let propertyKeysSnapshot: Set<Function>;
    let sdkDtosSnapshot: Set<Function>;

    beforeEach(() => {
        propertyKeysSnapshot = new Set(propertyStorage.keys());
        sdkDtosSnapshot = new Set(sdkDtos);
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
    });

    describe('checkParamsIsContinuous', () => {
        it('returns true for indexes starting from zero without gaps', () => {
            expect(checkParamsIsContinuous([{ index: 0 }, { index: 1 }, { index: 2 }] as ParameterOptionType[])).toBe(
                true
            );
        });

        it('returns true for unsorted but continuous indexes', () => {
            expect(checkParamsIsContinuous([{ index: 2 }, { index: 0 }, { index: 1 }] as ParameterOptionType[])).toBe(
                true
            );
        });

        it('returns true for an empty parameter list', () => {
            expect(checkParamsIsContinuous([])).toBe(true);
        });

        it('returns false when indexes do not start at zero', () => {
            expect(checkParamsIsContinuous([{ index: 1 }, { index: 2 }] as ParameterOptionType[])).toBe(false);
        });

        it('returns false when indexes contain gaps', () => {
            expect(checkParamsIsContinuous([{ index: 0 }, { index: 2 }] as ParameterOptionType[])).toBe(false);
        });
    });

    describe('moveMetadata', () => {
        it('copies all metadata keys to the destination', () => {
            const origin = function (): void {};
            const destination = function (): void {};
            Reflect.defineMetadata('test:first', { value: 1 }, origin);
            Reflect.defineMetadata('test:second', { value: 2 }, origin);

            moveMetadata(origin, destination);

            expect(Reflect.getMetadata('test:first', destination)).toEqual({ value: 1 });
            expect(Reflect.getMetadata('test:second', destination)).toEqual({ value: 2 });
        });

        it('removes the metadata from the origin', () => {
            const origin = function (): void {};
            const destination = function (): void {};
            Reflect.defineMetadata('test:key', { value: 1 }, origin);

            moveMetadata(origin, destination);

            expect(Reflect.getMetadata('test:key', origin)).toBeUndefined();
        });
    });

    describe('createParamDto', () => {
        class CreateDtoService {
            search(keyword: string, page: number): any {
                return { keyword, page };
            }
        }
        GrpcParam({ name: 'keyword', type: String, required: true })(CreateDtoService.prototype, 'search', 0);
        GrpcParam({ name: 'page', type: Number, required: false })(CreateDtoService.prototype, 'search', 1);

        it('creates a dto class named after the service and method', () => {
            const descriptor = Object.getOwnPropertyDescriptor(CreateDtoService.prototype, 'search');
            const dto = createParamDto(CreateDtoService.prototype, 'search', descriptor);

            expect(dto.name).toBe('CreateDtoServiceSearchParams');
        });

        it('registers the parameters as properties of the generated dto', () => {
            const descriptor = Object.getOwnPropertyDescriptor(CreateDtoService.prototype, 'search');
            const dto = createParamDto(CreateDtoService.prototype, 'search', descriptor);

            const properties = propertyStorage.get(dto);
            expect(properties.map((property) => property.name)).toEqual(['keyword', 'page']);
            expect(properties[0].option).toMatchObject({ type: 'string', required: true });
            expect(properties[1].option).toMatchObject({ type: 'number', required: false });
        });
    });

    describe('overrideMethod', () => {
        function createDirectService(): any {
            class DirectFlatService {
                findOne(id: string, name: string, extra?: any): any {
                    return { id, name, extra };
                }
            }
            GrpcParam({ name: 'id', type: String, required: true })(DirectFlatService.prototype, 'findOne', 0);
            GrpcParam({ name: 'name', type: String, required: false })(DirectFlatService.prototype, 'findOne', 1);
            const descriptor = Object.getOwnPropertyDescriptor(DirectFlatService.prototype, 'findOne');
            overrideMethod(DirectFlatService.prototype, 'findOne', descriptor);
            Object.defineProperty(DirectFlatService.prototype, 'findOne', descriptor);
            return DirectFlatService;
        }

        it('maps body fields to the original positional arguments', () => {
            const serviceClass = createDirectService();
            const result = new serviceClass().findOne({ id: 'user-1', name: 'john' });

            expect(result).toEqual({ id: 'user-1', name: 'john', extra: undefined });
        });

        it('appends trailing arguments such as the grpc metadata', () => {
            const serviceClass = createDirectService();
            const metadata = { token: 'abc' };
            const result = new serviceClass().findOne({ id: 'user-1', name: 'john' }, metadata);

            expect(result.extra).toBe(metadata);
        });

        it('defaults to an empty body when called without arguments', () => {
            const serviceClass = createDirectService();
            const result = new serviceClass().findOne();

            expect(result).toEqual({ id: undefined, name: undefined, extra: undefined });
        });

        it('replaces the parameter types with the generated dto and marks it as the grpc value', () => {
            const serviceClass = createDirectService();
            const paramTypes = Reflect.getMetadata('design:paramtypes', serviceClass.prototype, 'findOne');

            expect(paramTypes[0].name).toBe('DirectFlatServiceFindOneParams');
            expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, serviceClass.prototype, 'findOne')).toBe(0);
        });

        it('throws when the direct parameters are not continuous from index zero', () => {
            class BrokenFlatService {
                find(first: string, second: string): any {
                    return { first, second };
                }
            }
            GrpcParam({ name: 'second', type: String })(BrokenFlatService.prototype, 'find', 1);
            const descriptor = Object.getOwnPropertyDescriptor(BrokenFlatService.prototype, 'find');

            expect(() => overrideMethod(BrokenFlatService.prototype, 'find', descriptor)).toThrow(
                'Grpc direct parameters must be continuous and start from index 0 in method find'
            );
        });

        it('treats a grpc value parameter as a body field when mixed with direct parameters', () => {
            class MixedFlatService {
                update(
                    @GrpcParam({ name: 'id', type: String, required: true }) id: string,
                    @GrpcValue() body: BodyFixtureDto
                ): any {
                    return { id, body };
                }
            }
            const descriptor = Object.getOwnPropertyDescriptor(MixedFlatService.prototype, 'update');
            overrideMethod(MixedFlatService.prototype, 'update', descriptor);
            Object.defineProperty(MixedFlatService.prototype, 'update', descriptor);

            const result = (new MixedFlatService() as any).update({ id: 'user-1', body: { address: 'street 1' } });
            expect(result).toEqual({ id: 'user-1', body: { address: 'street 1' } });

            const paramTypes = Reflect.getMetadata('design:paramtypes', MixedFlatService.prototype, 'update');
            const dtoProperties = propertyStorage.get(paramTypes[0]);
            expect(dtoProperties.map((property) => property.name)).toEqual(['id', 'body']);
            expect(
                Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, MixedFlatService.prototype, 'update').map(
                    (param: ParameterOptionType) => param.name
                )
            ).toEqual(['id', 'body']);
        });
    });
});
