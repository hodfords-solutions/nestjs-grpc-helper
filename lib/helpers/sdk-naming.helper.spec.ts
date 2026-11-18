/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest';
import {
    enumMemberName,
    splitWords,
    toGoCamelCase,
    toGoPackageName,
    toRustIdentifier,
    toSnakeCase,
    toUpperCamelCase
} from './sdk-naming.helper.js';

describe('sdk-naming.helper', () => {
    it('splits on case boundaries the way prost (heck) does', () => {
        expect(splitWords('findMany')).toEqual(['find', 'Many']);
        expect(splitWords('parseXMLDocument')).toEqual(['parse', 'XML', 'Document']);
        expect(splitWords('getV2User')).toEqual(['get', 'V2', 'User']);
        expect(splitWords('SUPER_ADMIN')).toEqual(['SUPER', 'ADMIN']);
    });

    it('converts rpc and service names to snake_case', () => {
        expect(toSnakeCase('findMany')).toBe('find_many');
        expect(toSnakeCase('getV2User')).toBe('get_v2_user');
        expect(toSnakeCase('AppMicroservice')).toBe('app_microservice');
    });

    it('converts message and variant names to UpperCamelCase', () => {
        expect(toUpperCamelCase('ProtoUserResponseList')).toBe('ProtoUserResponseList');
        expect(toUpperCamelCase('UserDTO')).toBe('UserDto');
        expect(toUpperCamelCase('SUPER_ADMIN')).toBe('SuperAdmin');
        expect(toUpperCamelCase('active')).toBe('Active');
    });

    it('converts names the way protoc-gen-go does', () => {
        expect(toGoCamelCase('findMany')).toBe('FindMany');
        expect(toGoCamelCase('UserDTO')).toBe('UserDTO');
        expect(toGoCamelCase('user_name')).toBe('UserName');
        expect(toGoCamelCase('_foo')).toBe('XFoo');
        expect(toGoCamelCase('_Internal')).toBe('XInternal');
        expect(toGoCamelCase('I18nTextDto')).toBe('I18NTextDto');
        expect(toGoCamelCase('enable2fa')).toBe('Enable2Fa');
        expect(toGoCamelCase('b2bCustomers')).toBe('B2BCustomers');
        expect(toGoCamelCase('oauth2Token')).toBe('Oauth2Token');
        expect(toGoCamelCase('__foo')).toBe('XFoo');
        expect(toGoCamelCase('a_B')).toBe('A_B');
    });

    it('converts dots the way protoc-gen-go does', () => {
        expect(toGoCamelCase('foo.bar')).toBe('FooBar');
        expect(toGoCamelCase('foo.Bar')).toBe('Foo_Bar');
        expect(toGoCamelCase('foo._bar')).toBe('Foo_XBar');
    });

    it('turns Rust keywords into raw identifiers the way prost-build does', () => {
        expect(toRustIdentifier('move')).toBe('r#move');
        expect(toRustIdentifier('match')).toBe('r#match');
        expect(toRustIdentifier('use')).toBe('r#use');
        expect(toRustIdentifier('type')).toBe('r#type');
        expect(toRustIdentifier('try')).toBe('r#try');
        expect(toRustIdentifier('override')).toBe('r#override');
        expect(toRustIdentifier('async')).toBe('r#async');
        expect(toRustIdentifier('dyn')).toBe('r#dyn');
    });

    it('suffixes the Rust keywords that cannot be raw identifiers with an underscore', () => {
        expect(toRustIdentifier('self')).toBe('self_');
        expect(toRustIdentifier('Self')).toBe('Self_');
        expect(toRustIdentifier('super')).toBe('super_');
        expect(toRustIdentifier('extern')).toBe('extern_');
        expect(toRustIdentifier('crate')).toBe('crate_');
        expect(toRustIdentifier('_')).toBe('__');
    });

    it('prefixes a Rust identifier that starts with a digit and keeps other names', () => {
        expect(toRustIdentifier('1st')).toBe('_1st');
        expect(toRustIdentifier('find_many')).toBe('find_many');
        expect(toRustIdentifier('Type')).toBe('Type');
    });

    it('names enum members in UpperCamelCase, prefixing a name that does not start with a letter', () => {
        expect(enumMemberName('SUPER_ADMIN')).toBe('SuperAdmin');
        expect(enumMemberName('1st')).toBe('V1st');
        expect(enumMemberName('-1')).toBe('V1');
        expect(enumMemberName('>=')).toBe('');
    });

    it('derives a Go package name from the module path', () => {
        expect(toGoPackageName('github.com/org/sdk-name-go')).toBe('sdknamego');
        expect(toGoPackageName('example.com/Billing_SDK')).toBe('billing_sdk');
    });

    it('appends "sdk" when the derived Go package name is a Go keyword', () => {
        expect(toGoPackageName('github.com/org/user-sdk/go')).toBe('gosdk');
        expect(toGoPackageName('example.com/type')).toBe('typesdk');
        expect(toGoPackageName('example.com/func')).toBe('funcsdk');
        expect(toGoPackageName('example.com/map')).toBe('mapsdk');
        expect(toGoPackageName('example.com/range')).toBe('rangesdk');
    });

    it('derives the Go package name from the segment before a major-version suffix', () => {
        expect(toGoPackageName('github.com/org/sdk-go/v2')).toBe('sdkgo');
        expect(toGoPackageName('github.com/org/sdk-go/v10')).toBe('sdkgo');
        expect(toGoPackageName('github.com/org/user-sdk/go/v3')).toBe('gosdk');
        expect(toGoPackageName('v2')).toBe('v2');
        expect(toGoPackageName('github.com/org/v2x')).toBe('v2x');
    });

    it('rejects a module path without a usable last segment', () => {
        expect(() => toGoPackageName('example.com/---')).toThrow('Cannot derive a Go package name');
    });
});
