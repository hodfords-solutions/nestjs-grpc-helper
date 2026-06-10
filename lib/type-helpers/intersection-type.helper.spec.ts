/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { Property } from '../decorators/property.decorator';

// @faker-js/faker v10 is ESM-only and cannot be loaded by the CommonJS jest transform.
// It is pulled in transitively through the library index and is not used by these tests.
jest.mock('@faker-js/faker', () => ({ faker: {} }));

import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { IntersectionResponseType } from './intersection-type.helper';

class IntersectionNameFixture {
    @Property({ type: String, required: true, description: 'first definition' })
    name: string;
}

class IntersectionDetailFixture {
    @Property({ type: String, required: false })
    name: string;

    @Property({ type: Number })
    age: number;
}

class IntersectionExtraFixture {
    @Property({ type: 'bool' } as any)
    active: boolean;
}

describe('IntersectionResponseType', () => {
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

    it('combines the properties of every input class', () => {
        const intersection = IntersectionResponseType(IntersectionDetailFixture, IntersectionExtraFixture);

        const names = propertyStorage.get(intersection).map((property) => property.name);
        expect(names).toEqual(['name', 'age', 'active']);
    });

    it('merges overlapping property names into a single entry, later classes win', () => {
        const intersection = IntersectionResponseType(IntersectionNameFixture, IntersectionDetailFixture);

        const properties = propertyStorage.get(intersection);
        const nameProperties = properties.filter((property) => property.name === 'name');
        expect(nameProperties).toHaveLength(1);
        expect(nameProperties[0].option).toEqual({
            type: 'string',
            required: false,
            description: 'first definition'
        });
    });

    it('does not mutate the option of the first class when merging duplicates', () => {
        IntersectionResponseType(IntersectionNameFixture, IntersectionDetailFixture);

        const baseOption = propertyStorage
            .get(IntersectionNameFixture)
            .find((property) => property.name === 'name').option;
        expect(baseOption.required).toBe(true);
    });

    it('supports more than two classes', () => {
        const intersection = IntersectionResponseType(
            IntersectionNameFixture,
            IntersectionDetailFixture,
            IntersectionExtraFixture
        );

        const names = propertyStorage.get(intersection).map((property) => property.name);
        expect(names).toEqual(['name', 'age', 'active']);
    });

    it('registers the result as an sdk dto', () => {
        const intersection = IntersectionResponseType(IntersectionDetailFixture, IntersectionExtraFixture);

        expect(sdkDtos.has(intersection)).toBe(true);
    });
});
