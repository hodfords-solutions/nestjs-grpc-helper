/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import { ExtendType } from './extend-type.decorator';
import { Property } from './property.decorator';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { PropertyType } from '../types/property-option.type';

describe('ExtendType', () => {
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

    it('copies the parent class properties onto the child class', () => {
        class ParentDto {
            @Property({ type: String })
            name: string;

            @Property({ type: Number })
            age: number;
        }

        @ExtendType()
        class ChildDto extends ParentDto {}

        expect(propertyStorage.get(ChildDto).map((property) => property.name)).toEqual(['name', 'age']);
    });

    it('keeps the child own properties and only adds missing parent properties', () => {
        class ParentDto {
            @Property({ type: String })
            name: string;

            @Property({ type: Number })
            age: number;
        }

        @ExtendType()
        class ChildDto extends ParentDto {
            @Property({ type: 'bool' as any })
            name: any;
        }

        const properties = propertyStorage.get(ChildDto);
        expect(properties.map((property) => property.name)).toEqual(['name', 'age']);
        expect(properties[0].option.type).toBe('bool');
    });

    it('registers the child class in sdkDtos', () => {
        class ParentDto {
            @Property({ type: String })
            name: string;
        }

        @ExtendType()
        class ChildDto extends ParentDto {}

        expect(sdkDtos.has(ChildDto)).toBe(true);
    });

    it('keeps regular parent classes in the storages', () => {
        class ParentDto {
            @Property({ type: String })
            name: string;
        }

        @ExtendType()
        class ChildDto extends ParentDto {}

        expect(propertyStorage.has(ParentDto)).toBe(true);
        expect(sdkDtos.has(ParentDto)).toBe(true);
        expect(propertyStorage.has(ChildDto)).toBe(true);
    });

    it.each(['IntersectionTypeClass', 'PickTypeClass', 'OmitTypeClass', 'PartialTypeClass'])(
        'removes intermediate %s parents from the storages',
        (parentName) => {
            const intermediateClass = class {};
            Object.defineProperty(intermediateClass, 'name', { value: parentName });
            Property({ type: String })(intermediateClass.prototype, 'name');
            expect(propertyStorage.has(intermediateClass)).toBe(true);
            expect(sdkDtos.has(intermediateClass)).toBe(true);

            class ChildDto extends intermediateClass {}
            ExtendType()(ChildDto);

            expect(propertyStorage.has(intermediateClass)).toBe(false);
            expect(sdkDtos.has(intermediateClass)).toBe(false);
            expect(propertyStorage.get(ChildDto).map((property) => property.name)).toEqual(['name']);
            expect(sdkDtos.has(ChildDto)).toBe(true);
        }
    );

    it('produces an empty property list when neither class has properties', () => {
        class ParentDto {}

        @ExtendType()
        class ChildDto extends ParentDto {}

        expect(propertyStorage.get(ChildDto)).toEqual([]);
        expect(sdkDtos.has(ChildDto)).toBe(true);
    });

    it('returns the original constructor', () => {
        class ParentDto {}

        class ChildDto extends ParentDto {}

        expect(ExtendType()(ChildDto)).toBe(ChildDto);
    });
});
