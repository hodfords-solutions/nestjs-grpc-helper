/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { Property } from '../decorators/property.decorator';

// @faker-js/faker v10 is ESM-only and cannot be loaded by the CommonJS jest transform.
// It is pulled in transitively through the library index and is not used by these tests.
jest.mock('@faker-js/faker', () => ({ faker: {} }));

import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { PartialResponseType } from './partial-type.helper';

class PartialBaseFixture {
    @Property({ type: String, required: true, description: 'user name' })
    name: string;

    @Property({ type: Number, required: true })
    age: number;

    @Property({ type: String, required: false })
    note?: string;
}

describe('PartialResponseType', () => {
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

    it('keeps every property of the base class', () => {
        const partial = PartialResponseType(PartialBaseFixture);

        const names = propertyStorage.get(partial).map((property) => property.name);
        expect(names).toEqual(['name', 'age', 'note']);
    });

    it('marks every property as optional', () => {
        const partial = PartialResponseType(PartialBaseFixture);

        for (const property of propertyStorage.get(partial)) {
            expect(property.option.required).toBe(false);
        }
    });

    it('preserves the remaining option fields', () => {
        const partial = PartialResponseType(PartialBaseFixture);

        const nameOption = propertyStorage.get(partial).find((property) => property.name === 'name').option;
        expect(nameOption).toMatchObject({ type: 'string', description: 'user name' });
    });

    it('does not mutate the base class options', () => {
        PartialResponseType(PartialBaseFixture);

        const baseNameOption = propertyStorage
            .get(PartialBaseFixture)
            .find((property) => property.name === 'name').option;
        expect(baseNameOption.required).toBe(true);
    });

    it('registers the result as an sdk dto', () => {
        const partial = PartialResponseType(PartialBaseFixture);

        expect(sdkDtos.has(partial)).toBe(true);
    });
});
