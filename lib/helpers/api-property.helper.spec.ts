import { isEnumProperty } from './api-property.helper';

enum ApiFixtureEnum {
    ONE = 'ONE',
    TWO = 'TWO'
}

describe('isEnumProperty', () => {
    it('returns true when both enum and enumName are provided', () => {
        expect(isEnumProperty({ type: 'string', enum: ApiFixtureEnum, enumName: 'ApiFixtureEnum' })).toBe(true);
    });

    it('returns true for array enums with an enum name', () => {
        expect(isEnumProperty({ type: 'string', enum: ['ONE', 'TWO'], enumName: 'ApiFixtureEnum' })).toBe(true);
    });

    it('returns false when enumName is missing', () => {
        expect(isEnumProperty({ type: 'string', enum: ApiFixtureEnum })).toBe(false);
    });

    it('returns false when enum is missing', () => {
        expect(isEnumProperty({ type: 'string', enumName: 'ApiFixtureEnum' })).toBe(false);
    });

    it('returns false for empty enum values', () => {
        expect(isEnumProperty({ type: 'string', enum: {}, enumName: 'ApiFixtureEnum' })).toBe(false);
        expect(isEnumProperty({ type: 'string', enum: [], enumName: 'ApiFixtureEnum' })).toBe(false);
    });

    it('returns false for plain options without enum metadata', () => {
        expect(isEnumProperty({ type: 'string' })).toBe(false);
    });
});
