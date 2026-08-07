/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { MockMethod, MockNested, MockSample } from '../decorators/mock.decorator';

// @faker-js/faker v10 is ESM-only and cannot be loaded by the CommonJS jest transform,
// so a deterministic seedable stub exposing the faker API used by the fixtures is provided instead.
jest.mock('@faker-js/faker', () => {
    let state = 1;
    const next = (): number => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
    return {
        faker: {
            seed: (value: number): void => {
                state = value;
            },
            person: {
                firstName: (): string => `FirstName-${Math.floor(next() * 100000)}`
            },
            location: {
                streetAddress: (): string => `Street ${Math.floor(next() * 100000)}`
            },
            number: {
                int: (options: { min: number; max: number }): number =>
                    options.min + Math.floor(next() * (options.max - options.min + 1))
            },
            string: {
                uuid: (): string =>
                    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
                        const random = Math.floor(next() * 16);
                        const value = char === 'x' ? random : (random % 4) + 8;
                        return value.toString(16);
                    })
            }
        }
    };
});
import { Property } from '../decorators/property.decorator';
import { sample, sampleMethod } from './mock.helper';

class MockAddressFixture {
    @Property({ type: String })
    @MockMethod('faker.location.streetAddress')
    street: string;
}

class MockUserFixture {
    @Property({ type: String })
    @MockMethod('faker.person.firstName')
    firstName: string;

    @Property({ type: String, enum: ['ADMIN', 'STANDARD'], enumName: 'MockUserTypeEnum' })
    @MockSample('STANDARD')
    type: string;

    @Property({ type: Number, example: 42 })
    age: number;

    @Property({ type: String, required: false })
    plain?: string;

    @Property({ type: MockAddressFixture })
    @MockNested()
    address: MockAddressFixture;

    @Property({ type: () => MockAddressFixture, isArray: true })
    @MockNested(3)
    addresses: MockAddressFixture[];
}

class CircularAFixture {
    @Property({ type: () => CircularBFixture })
    @MockNested()
    b: any;
}

class CircularBFixture {
    @Property({ type: () => CircularAFixture })
    @MockNested()
    a: any;
}

describe('sample', () => {
    beforeEach(() => {
        faker.seed(2024);
    });

    it('generates faker values for mock method properties', () => {
        const data: any = sample(MockUserFixture);

        expect(typeof data.firstName).toBe('string');
        expect(data.firstName.length).toBeGreaterThan(0);
    });

    it('returns the configured sample value as-is', () => {
        const data: any = sample(MockUserFixture);

        expect(data.type).toBe('STANDARD');
    });

    it('falls back to the property example when no mock is configured', () => {
        const data: any = sample(MockUserFixture);

        expect(data.age).toBe(42);
    });

    it('leaves properties without mock or example undefined', () => {
        const data: any = sample(MockUserFixture);

        expect(data).toHaveProperty('plain');
        expect(data.plain).toBeUndefined();
    });

    it('builds nested objects for mock nested properties', () => {
        const data: any = sample(MockUserFixture);

        expect(typeof data.address.street).toBe('string');
    });

    it('builds nested arrays with the configured size, resolving lazy types', () => {
        const data: any = sample(MockUserFixture);

        expect(data.addresses).toHaveLength(3);
        for (const address of data.addresses) {
            expect(typeof address.street).toBe('string');
        }
    });

    it('is deterministic for the same faker seed', () => {
        faker.seed(7);
        const first = sample(MockUserFixture);
        faker.seed(7);
        const second = sample(MockUserFixture);

        expect(second).toEqual(first);
    });

    it('stops at circular references and returns an empty object', () => {
        const data: any = sample(CircularAFixture);

        expect(data).toEqual({ b: { a: {} } });
    });
});

describe('sampleMethod', () => {
    beforeEach(() => {
        faker.seed(2024);
    });

    it('invokes the faker method with the provided arguments', () => {
        const value = sampleMethod({ method: 'faker.number.int', args: [{ min: 1, max: 5 }] });

        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
    });

    it('resolves nested faker paths', () => {
        const value = sampleMethod({ method: 'faker.string.uuid', args: [] });

        expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
});
