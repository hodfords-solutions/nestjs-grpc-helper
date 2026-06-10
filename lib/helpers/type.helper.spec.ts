import { isPrimitiveType } from './type.helper';

describe('isPrimitiveType', () => {
    it('returns true for the String constructor', () => {
        expect(isPrimitiveType(String)).toBe(true);
    });

    it('returns true for the Number constructor', () => {
        expect(isPrimitiveType(Number)).toBe(true);
    });

    it('returns true for the Boolean constructor', () => {
        expect(isPrimitiveType(Boolean)).toBe(true);
    });

    it('returns false for other built-in constructors', () => {
        expect(isPrimitiveType(Date)).toBe(false);
        expect(isPrimitiveType(Object)).toBe(false);
        expect(isPrimitiveType(Array)).toBe(false);
    });

    it('returns false for custom classes', () => {
        class CustomFixture {}
        expect(isPrimitiveType(CustomFixture)).toBe(false);
    });

    it('returns false for string names and nullish values', () => {
        expect(isPrimitiveType('string')).toBe(false);
        expect(isPrimitiveType('boolean')).toBe(false);
        expect(isPrimitiveType(undefined)).toBe(false);
        expect(isPrimitiveType(null)).toBe(false);
    });
});
