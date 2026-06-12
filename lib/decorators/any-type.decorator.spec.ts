import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { AnyType } from './any-type.decorator';

class Response {
    @AnyType()
    value: any;
}

class ResponseWithDtoFlag {
    @AnyType({ isDto: true })
    payload: any;
}

function transform<T extends object>(cls: new () => T, plain: object, groups?: string[]): T {
    return plainToInstance(cls, plain, { groups });
}

describe('@AnyType — single-pass `__getData` + `__sendData`', () => {
    it('parses then stringifies a JSON string value so an already-encoded payload normalizes to a stable wire form', () => {
        const result = transform(Response, { value: '[{"a":1}]' }, ['__getData', '__sendData']);

        expect(result.value).toBe('[{"a":1}]');
    });

    it('passes a plain object/array through `__getData` (no-op for non-string) and stringifies it via `__sendData`', () => {
        const result = transform(Response, { value: [{ a: 1 }, { a: 2 }] }, ['__getData', '__sendData']);

        expect(typeof result.value).toBe('string');
        expect(JSON.parse(result.value)).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it('skips `null` so a pre-validate transform pass does not break `@ValidateNested` + `@IsOptional`', () => {
        // Regression: turning `null` into the string `"null"` made `@IsOptional` stop
        // skipping (because `"null"` is truthy) and `@ValidateNested` then failed to
        // iterate it.
        const result = transform(Response, { value: null }, ['__getData', '__sendData']);

        expect(result.value).toBeNull();
    });

    it('skips `undefined` for the same reason', () => {
        const result = transform(Response, { value: undefined }, ['__getData', '__sendData']);

        expect(result.value).toBeUndefined();
    });

    it('stringifies primitives (numbers, booleans, strings) so they all round-trip as wire-encoded JSON', () => {
        expect(transform(Response, { value: 0 }, ['__getData', '__sendData']).value).toBe('0');
        expect(transform(Response, { value: false }, ['__getData', '__sendData']).value).toBe('false');
        // A plain string round-trips through `__getData` first (JSON.parse fails →
        // raw string) then through `__sendData` (stringify → `'"hello"'`).
        expect(transform(Response, { value: 'hello' }, ['__getData', '__sendData']).value).toBe('"hello"');
    });
});

describe('@AnyType — `__getData` only (incoming wire / pre-validate)', () => {
    it('parses a JSON string into the materialized object so `@ValidateNested` can iterate it', () => {
        const result = transform(Response, { value: '[{"a":1}]' }, ['__getData']);

        expect(result.value).toEqual([{ a: 1 }]);
    });

    it('passes non-string values through unchanged', () => {
        const result = transform(Response, { value: [{ a: 1 }] }, ['__getData']);

        expect(result.value).toEqual([{ a: 1 }]);
    });

    it('returns the raw string when JSON.parse fails so non-JSON payloads do not crash the interceptor', () => {
        const result = transform(Response, { value: 'not json' }, ['__getData']);

        expect(result.value).toBe('not json');
    });
});

describe('@AnyType — `__sendData` only (SDK client outgoing path)', () => {
    it('JSON.stringifies array/object values for the proto `string` field', () => {
        const result = transform(Response, { value: [{ a: 1 }] }, ['__sendData']);

        expect(result.value).toBe('[{"a":1}]');
    });

    it('skips null/undefined so the SDK client also preserves nullish round-trip', () => {
        expect(transform(Response, { value: null }, ['__sendData']).value).toBeNull();
        expect(transform(Response, { value: undefined }, ['__sendData']).value).toBeUndefined();
    });
});

describe('@AnyType — `isDto: true` mode', () => {
    it('JSON.parses an incoming string regardless of group, so DTO consumers receive the materialized object', () => {
        const result = transform(ResponseWithDtoFlag, { payload: '{"foo":1}' });

        expect(result.payload).toEqual({ foo: 1 });
    });

    it('still JSON.stringifies on the outgoing `__sendData` path', () => {
        const result = transform(ResponseWithDtoFlag, { payload: { foo: 1 } }, ['__sendData']);

        expect(result.payload).toBe('{"foo":1}');
    });
});

describe('@AnyType — default (no group)', () => {
    it('returns the value unchanged on HTTP paths where no group is supplied', () => {
        const result = transform(Response, { value: [{ a: 1 }] });

        expect(result.value).toEqual([{ a: 1 }]);
    });
});
