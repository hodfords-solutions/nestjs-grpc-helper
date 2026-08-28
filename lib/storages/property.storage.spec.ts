/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import { propertyStorage, sdkDtos, sdkExposedClasses } from './property.storage';
import { Property } from '../decorators/property.decorator';
import { PropertyType } from '../types/property-option.type';

describe('property storages', () => {
    let savedProperties: Array<[Function, PropertyType[]]>;
    let savedSdkDtos: Function[];
    let savedExposedClasses: Function[];

    beforeEach(() => {
        savedProperties = Array.from(propertyStorage.entries());
        savedSdkDtos = Array.from(sdkDtos);
        savedExposedClasses = Array.from(sdkExposedClasses);
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
        sdkExposedClasses.clear();
        for (const exposedClass of savedExposedClasses) {
            sdkExposedClasses.add(exposedClass);
        }
    });

    describe('propertyStorage', () => {
        it('is shared with the Property decorator across modules', () => {
            class Dto {
                @Property({ type: String })
                name: string;
            }

            expect(propertyStorage.get(Dto)).toEqual([
                { name: 'name', option: expect.objectContaining({ type: 'string' }) }
            ]);
        });

        it('is keyed by constructor reference, so same-named classes get separate entries', () => {
            const first = class Duplicated {};
            const second = class Duplicated {};

            Property({ type: String })(first.prototype, 'name');
            Property({ type: Number })(second.prototype, 'name');

            expect(propertyStorage.get(first)[0].option.type).toBe('string');
            expect(propertyStorage.get(second)[0].option.type).toBe('number');
        });

        it('does not implicitly share entries between a parent and its subclass', () => {
            class ParentDto {
                @Property({ type: String })
                name: string;
            }

            class ChildDto extends ParentDto {}

            expect(propertyStorage.has(ParentDto)).toBe(true);
            expect(propertyStorage.has(ChildDto)).toBe(false);
        });
    });

    describe('sdkDtos and sdkExposedClasses', () => {
        it('sdkDtos deduplicates classes registered multiple times', () => {
            class Dto {
                @Property({ type: String })
                name: string;

                @Property({ type: Number })
                age: number;
            }

            expect(Array.from(sdkDtos).filter((dto) => dto === Dto)).toHaveLength(1);
        });

        it('sdkExposedClasses is independent from sdkDtos', () => {
            class ExposedOnly {}

            sdkExposedClasses.add(ExposedOnly);

            expect(sdkExposedClasses.has(ExposedOnly)).toBe(true);
            expect(sdkDtos.has(ExposedOnly)).toBe(false);
        });
    });
});
