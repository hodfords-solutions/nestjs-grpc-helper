/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest';
import { resolveWireResponse } from './wire-response.helper.js';

class ItemFixture {}

function response(responseClass: any, flags: { isArray?: boolean; isAllowEmpty?: boolean } = {}) {
    return { responseClass, isArray: false, isAllowEmpty: false, ...flags };
}

describe('resolveWireResponse', () => {
    it('returns the empty message when the method declares no response', () => {
        expect(resolveWireResponse(undefined)).toEqual({
            responseKind: 'empty',
            wireResponseType: 'google.protobuf.Empty'
        });
    });

    it('returns the model itself for a single model', () => {
        expect(resolveWireResponse(response(ItemFixture))).toEqual({
            responseKind: 'single',
            wireResponseType: 'ItemFixture'
        });
    });

    it('wraps a primitive in its native value message', () => {
        expect(resolveWireResponse(response(String))).toEqual({
            responseKind: 'native',
            wireResponseType: 'NativeStringValue'
        });
    });

    it('uses the list message for arrays of models and of primitives', () => {
        expect(resolveWireResponse(response(ItemFixture, { isArray: true }))).toEqual({
            responseKind: 'list',
            wireResponseType: 'ProtoItemFixtureList'
        });
        expect(resolveWireResponse(response(Number, { isArray: true }))).toEqual({
            responseKind: 'nativeList',
            wireResponseType: 'ProtoNumberList'
        });
    });

    it('wraps a nullable model and names the message inside the envelope', () => {
        expect(resolveWireResponse(response(ItemFixture, { isAllowEmpty: true }))).toEqual({
            responseKind: 'nullable',
            wireResponseType: 'NullableGrpcClassResponseOfItemFixture',
            nullableInner: 'ItemFixture'
        });
    });

    it('wraps a nullable primitive around its native value message', () => {
        expect(resolveWireResponse(response(Boolean, { isAllowEmpty: true }))).toEqual({
            responseKind: 'nullableNative',
            wireResponseType: 'NullableGrpcClassResponseOfNativeBooleanValue',
            nullableInner: 'NativeBooleanValue'
        });
    });

    it('treats a nullable array as a plain list', () => {
        expect(resolveWireResponse(response(ItemFixture, { isArray: true, isAllowEmpty: true }))).toEqual({
            responseKind: 'list',
            wireResponseType: 'ProtoItemFixtureList'
        });
    });
});
