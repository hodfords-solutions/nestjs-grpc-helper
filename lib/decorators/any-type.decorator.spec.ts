/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { AnyType } from './any-type.decorator';
import { instanceToPlain, plainToInstance } from 'class-transformer';

class AnyPayload {
    @AnyType()
    data: any;
}

class DtoPayload {
    @AnyType({ isDto: true })
    data: any;
}

describe('AnyType', () => {
    it('serializes the value to a JSON string for the __sendData group', () => {
        const payload = new AnyPayload();
        payload.data = { nested: { value: 1 }, list: [1, 2] };

        const plain = instanceToPlain(payload, { groups: ['__sendData'] });
        expect(plain.data).toBe(JSON.stringify({ nested: { value: 1 }, list: [1, 2] }));
    });

    it('parses the JSON string for the __getData group', () => {
        const instance = plainToInstance(AnyPayload, { data: '{"nested":{"value":1}}' }, { groups: ['__getData'] });

        expect(instance.data).toEqual({ nested: { value: 1 } });
    });

    it('returns the value untouched when no transformation group is active', () => {
        const payload = new AnyPayload();
        payload.data = { keep: 'me' };

        const plain = instanceToPlain(payload);
        expect(plain.data).toEqual({ keep: 'me' });
    });

    it('returns the value untouched for unrelated groups', () => {
        const payload = new AnyPayload();
        payload.data = { keep: 'me' };

        const plain = instanceToPlain(payload, { groups: ['other'] });
        expect(plain.data).toEqual({ keep: 'me' });
    });

    describe('single-pass __getData + __sendData', () => {
        it('parses a JSON string value and then re-stringifies it so an already-encoded payload normalizes to a stable wire form', () => {
            const instance = plainToInstance(
                AnyPayload,
                { data: '[{"a":1}]' },
                { groups: ['__getData', '__sendData'] }
            );

            expect(instance.data).toBe('[{"a":1}]');
        });

        it('leaves a plain object/array unchanged on __getData (non-string passes through) and stringifies it via __sendData', () => {
            const instance = plainToInstance(
                AnyPayload,
                { data: [{ a: 1 }, { a: 2 }] },
                { groups: ['__getData', '__sendData'] }
            );

            expect(typeof instance.data).toBe('string');
            expect(JSON.parse(instance.data)).toEqual([{ a: 1 }, { a: 2 }]);
        });
    });

    describe('null / undefined guard on __sendData', () => {
        it('keeps null as null so a pre-validate transform pass does not break @ValidateNested + @IsOptional', () => {
            // Regression: turning null into the string "null" made @IsOptional stop
            // skipping (because "null" is truthy) and @ValidateNested then failed to
            // iterate it.
            const instance = plainToInstance(AnyPayload, { data: null }, { groups: ['__getData', '__sendData'] });

            expect(instance.data).toBeNull();
        });

        it('keeps undefined as undefined for the same reason', () => {
            const instance = plainToInstance(AnyPayload, { data: undefined }, { groups: ['__getData', '__sendData'] });

            expect(instance.data).toBeUndefined();
        });

        it('still skips null when only __sendData is active (SDK client outgoing path)', () => {
            const payload = new AnyPayload();
            payload.data = null;

            const plain = instanceToPlain(payload, { groups: ['__sendData'] });
            expect(plain.data).toBeNull();
        });
    });

    describe('with isDto', () => {
        it('parses string values even without a transformation group', () => {
            const instance = plainToInstance(DtoPayload, { data: '{"a":1}' });
            expect(instance.data).toEqual({ a: 1 });
        });

        it('keeps non-string values untouched when no group is active', () => {
            const instance = plainToInstance(DtoPayload, { data: 42 });
            expect(instance.data).toBe(42);
        });

        it('still stringifies non-string values for the __sendData group', () => {
            const payload = new DtoPayload();
            payload.data = { a: 1 };

            const plain = instanceToPlain(payload, { groups: ['__sendData'] });
            expect(plain.data).toBe('{"a":1}');
        });
    });
});
