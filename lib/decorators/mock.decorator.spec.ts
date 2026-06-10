/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import {
    MockMethod,
    MockNested,
    MockResponseCallback,
    MockResponseMethod,
    MockResponseSample,
    MockSample
} from './mock.decorator';
import { Property } from './property.decorator';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { PropertyType } from '../types/property-option.type';

describe('Mock decorators', () => {
    let savedProperties: Array<[Function, PropertyType[]]>;
    let savedSdkDtos: Function[];

    beforeEach(() => {
        savedProperties = Array.from(propertyStorage.entries());
        savedSdkDtos = Array.from(sdkDtos);
    });

    afterEach(() => {
        propertyStorage.clear();
        for (const [key, value] of savedProperties) {
            propertyStorage.set(key, value);
        }
        sdkDtos.clear();
        for (const dto of savedSdkDtos) {
            sdkDtos.add(dto);
        }
    });

    describe('MockMethod', () => {
        it('stores the faker method with empty args by default', () => {
            class Dto {
                @MockMethod('faker.string.alpha')
                name: string;
            }

            expect(propertyStorage.get(Dto)).toEqual([
                { name: 'name', option: { mock: { method: 'faker.string.alpha', args: [] } } }
            ]);
        });

        it('stores the faker method with the provided args', () => {
            class Dto {
                @MockMethod('faker.number.int', [{ min: 1, max: 100 }])
                total: number;
            }

            expect(propertyStorage.get(Dto)[0].option.mock).toEqual({
                method: 'faker.number.int',
                args: [{ min: 1, max: 100 }]
            });
        });
    });

    describe('MockNested', () => {
        it('defaults the nested max size to 1', () => {
            class Dto {
                @MockNested()
                children: Dto[];
            }

            expect(propertyStorage.get(Dto)[0].option.mock).toEqual({ nestedMaxSize: 1 });
        });

        it('stores a custom nested max size', () => {
            class Dto {
                @MockNested(5)
                children: Dto[];
            }

            expect(propertyStorage.get(Dto)[0].option.mock).toEqual({ nestedMaxSize: 5 });
        });
    });

    describe('MockSample', () => {
        it('stores the sample value', () => {
            class Dto {
                @MockSample('standard')
                userType: string;
            }

            expect(propertyStorage.get(Dto)[0].option.mock).toEqual({ sample: 'standard' });
        });

        it('merges the mock option into an existing Property entry', () => {
            class Dto {
                @Property({ type: String, required: false })
                @MockSample('standard')
                userType: string;
            }

            const properties = propertyStorage.get(Dto);
            expect(properties).toHaveLength(1);
            expect(properties[0].option).toEqual(
                expect.objectContaining({ type: 'string', required: false, mock: { sample: 'standard' } })
            );
        });
    });

    describe('MockResponse decorators', () => {
        it('MockResponseSample defines mock:response metadata on the class constructor', () => {
            class Service {
                @MockResponseSample(true)
                checkActive(): boolean {
                    return false;
                }
            }

            expect(Reflect.getMetadata('mock:response', Service, 'checkActive')).toEqual({ sample: true });
        });

        it('MockResponseMethod defines the faker method with empty args by default', () => {
            class Service {
                @MockResponseMethod('faker.string.alpha')
                getName(): string {
                    return 'test';
                }
            }

            expect(Reflect.getMetadata('mock:response', Service, 'getName')).toEqual({
                method: 'faker.string.alpha',
                args: []
            });
        });

        it('MockResponseMethod stores the provided args', () => {
            class Service {
                @MockResponseMethod('faker.number.int', [{ min: 1, max: 10 }])
                count(): number {
                    return 1;
                }
            }

            expect(Reflect.getMetadata('mock:response', Service, 'count')).toEqual({
                method: 'faker.number.int',
                args: [{ min: 1, max: 10 }]
            });
        });

        it('MockResponseCallback stores the callback function', () => {
            const callback = (param: any, sample: any, model: any) => sample(model);

            class Service {
                @MockResponseCallback(callback)
                getUsers(): any[] {
                    return [];
                }
            }

            expect(Reflect.getMetadata('mock:response', Service, 'getUsers')).toEqual({ callback });
        });

        it('does not touch the property storage', () => {
            const sizeBefore = propertyStorage.size;

            class Service {
                @MockResponseSample('value')
                method(): string {
                    return '';
                }
            }

            expect(Reflect.getMetadata('mock:response', Service, 'method')).toBeDefined();
            expect(propertyStorage.size).toBe(sizeBefore);
        });
    });
});
