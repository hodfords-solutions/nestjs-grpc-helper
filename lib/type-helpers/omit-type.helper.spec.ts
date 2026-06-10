/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { Property } from '../decorators/property.decorator';

// @faker-js/faker v10 is ESM-only and cannot be loaded by the CommonJS jest transform.
// It is pulled in transitively through the library index and is not used by these tests.
jest.mock('@faker-js/faker', () => ({ faker: {} }));

import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { OmitResponseType } from './omit-type.helper';

class OmitBaseFixture {
    @Property({ type: String, description: 'user name' })
    name: string;

    @Property({ type: Number, required: false })
    age?: number;

    @Property({ type: 'bool' } as any)
    active: boolean;
}

describe('OmitResponseType', () => {
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

    it('registers all properties except the omitted ones', () => {
        const omitted = OmitResponseType(OmitBaseFixture, ['age']);

        const names = propertyStorage.get(omitted).map((property) => property.name);
        expect(names).toEqual(['name', 'active']);
    });

    it('supports omitting multiple keys', () => {
        const omitted = OmitResponseType(OmitBaseFixture, ['name', 'active']);

        const names = propertyStorage.get(omitted).map((property) => property.name);
        expect(names).toEqual(['age']);
    });

    it('copies the property options instead of sharing references', () => {
        const omitted = OmitResponseType(OmitBaseFixture, ['age']);

        const baseOption = propertyStorage.get(OmitBaseFixture).find((property) => property.name === 'name').option;
        const omittedOption = propertyStorage.get(omitted).find((property) => property.name === 'name').option;
        expect(omittedOption).toEqual(baseOption);
        expect(omittedOption).not.toBe(baseOption);
    });

    it('registers the result as an sdk dto', () => {
        const omitted = OmitResponseType(OmitBaseFixture, ['age']);

        expect(sdkDtos.has(omitted)).toBe(true);
    });

    it('returns a class with no registered properties for classes without stored properties', () => {
        class UnregisteredOmitFixture {
            name: string;
        }

        const omitted = OmitResponseType(UnregisteredOmitFixture, ['name']);

        expect(propertyStorage.get(omitted)).toBeUndefined();
    });
});
