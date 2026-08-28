import 'reflect-metadata';
import { getPropertiesOfClass } from '../helpers/property.helper';
import { sdkDtos } from '../storages/property.storage';
import { NativeBooleanValue, NativeNumberValue, NativeResponseValue, NativeStringValue } from './native.response';

describe('native responses', () => {
    it('defaults grpcNative to true on every native value instance', () => {
        expect(new NativeResponseValue().grpcNative).toBe(true);
        expect(new NativeBooleanValue().grpcNative).toBe(true);
        expect(new NativeStringValue().grpcNative).toBe(true);
        expect(new NativeNumberValue().grpcNative).toBe(true);
    });

    it('registers the grpcNative marker property as boolean in the property storage', () => {
        const properties = getPropertiesOfClass(NativeResponseValue);

        expect(properties).toHaveLength(1);
        expect(properties[0].name).toBe('grpcNative');
        expect(properties[0].option).toMatchObject({ type: 'boolean' });
    });

    it.each([
        [NativeBooleanValue, { type: 'boolean' }],
        [NativeStringValue, { type: 'string' }],
        [NativeNumberValue, { type: 'number', format: 'float' }]
    ])('registers the value property of %p with the proto-compatible type', (responseClass, expectedOption) => {
        const properties = getPropertiesOfClass(responseClass);
        const value = properties.find((property) => property.name === 'value');

        expect(value.option).toMatchObject(expectedOption);
    });

    it('inherits the grpcNative property metadata in every subclass', () => {
        for (const responseClass of [NativeBooleanValue, NativeStringValue, NativeNumberValue]) {
            const properties = getPropertiesOfClass(responseClass);
            const names = properties.map((property) => property.name).sort();

            expect(names).toEqual(['grpcNative', 'value']);
        }
    });

    it('adds all native value classes to the sdk dto storage', () => {
        expect(sdkDtos.has(NativeResponseValue)).toBe(true);
        expect(sdkDtos.has(NativeBooleanValue)).toBe(true);
        expect(sdkDtos.has(NativeStringValue)).toBe(true);
        expect(sdkDtos.has(NativeNumberValue)).toBe(true);
    });
});
