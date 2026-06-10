/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { Property } from '../decorators/property.decorator';
import { getPropertiesOfClass } from '../helpers/property.helper';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { PickResponseType } from './pick-type.helper';

class PickBaseFixture {
    @Property({ type: String, description: 'user name' })
    name: string;

    @Property({ type: Number, required: false })
    age?: number;

    @Property({ type: String, enum: ['ADMIN', 'STANDARD'], enumName: 'PickFixtureEnum' })
    kind: string;
}

describe('PickResponseType', () => {
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

    it('registers only the picked properties on the new class', () => {
        const picked = PickResponseType(PickBaseFixture, ['name', 'age']);

        const names = getPropertiesOfClass(picked).map((property) => property.name);
        expect(names).toEqual(['name', 'age']);
    });

    it('preserves the property options including enum metadata', () => {
        const picked = PickResponseType(PickBaseFixture, ['name', 'kind']);

        const properties = propertyStorage.get(picked);
        expect(properties.find((property) => property.name === 'name').option).toMatchObject({
            type: 'string',
            description: 'user name'
        });
        expect(properties.find((property) => property.name === 'kind').option).toMatchObject({
            enumName: 'PickFixtureEnum'
        });
    });

    it('shares the option object reference with the base class', () => {
        const picked = PickResponseType(PickBaseFixture, ['name']);

        const baseOption = propertyStorage.get(PickBaseFixture).find((property) => property.name === 'name').option;
        const pickedOption = propertyStorage.get(picked).find((property) => property.name === 'name').option;
        expect(pickedOption).toBe(baseOption);
    });

    it('registers the result as an sdk dto', () => {
        const picked = PickResponseType(PickBaseFixture, ['name']);

        expect(sdkDtos.has(picked)).toBe(true);
    });

    it('does not keep the base class properties that were not picked', () => {
        const picked = PickResponseType(PickBaseFixture, ['age']);

        const names = propertyStorage.get(picked).map((property) => property.name);
        expect(names).not.toContain('name');
        expect(names).not.toContain('kind');
    });

    it('creates an empty registration for classes without stored properties', () => {
        class UnregisteredPickFixture {
            name: string;
        }
        const picked = PickResponseType(UnregisteredPickFixture, ['name']);

        expect(propertyStorage.get(picked)).toBeUndefined();
        expect(getPropertiesOfClass(picked)).toEqual([]);
    });
});
