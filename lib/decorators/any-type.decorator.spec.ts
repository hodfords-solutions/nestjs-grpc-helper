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
