import 'reflect-metadata';
import { ResponseMetadata } from '@hodfords/nestjs-response';

// @faker-js/faker v10 is ESM-only and cannot be loaded by the CommonJS jest transform.
// It is pulled in transitively through the library index and is not used by these tests.
jest.mock('@faker-js/faker', () => ({ faker: {} }));

import { GrpcParam, SdkFlattenParams } from '../decorators/grpc-param.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { Property } from '../decorators/property.decorator';
import { getReturnType, resolveMethodParams } from './grpc-method.helper';

class SearchQueryFixtureDto {
    @Property({ type: String })
    keyword: string;

    @Property({ type: Number, required: false })
    page?: number;
}

class UserResultFixtureResponse {
    @Property({ type: String })
    name: string;
}

class ResolveFixtureService {
    @SdkFlattenParams()
    flattened(@GrpcValue() query: SearchQueryFixtureDto): void {
        void query;
    }

    plain(@GrpcValue() query: SearchQueryFixtureDto): void {
        void query;
    }

    direct(@GrpcParam({ name: 'id', type: String, required: true }) id: string): void {
        void id;
    }

    bare(): void {}
}

describe('resolveMethodParams', () => {
    it('returns the grpc value parameter class name', () => {
        const resolved = resolveMethodParams(ResolveFixtureService, 'plain');

        expect(resolved.parameterName).toBe('SearchQueryFixtureDto');
        expect(resolved.directParams).toBeUndefined();
    });

    it('flattens the grpc value dto properties into direct params when requested', () => {
        const resolved = resolveMethodParams(ResolveFixtureService, 'flattened');

        expect(resolved.parameterName).toBe('SearchQueryFixtureDto');
        expect(resolved.directParams).toEqual([
            { name: 'keyword', type: 'string' },
            { name: 'page', type: 'number', required: false }
        ]);
    });

    it('returns the registered direct parameters when present', () => {
        const resolved = resolveMethodParams(ResolveFixtureService, 'direct');

        expect(resolved.parameterName).toBeUndefined();
        expect(resolved.directParams).toHaveLength(1);
        expect(resolved.directParams[0]).toMatchObject({ name: 'id', type: 'string', index: 0, required: true });
    });

    it('returns nothing for methods without grpc parameter metadata', () => {
        const resolved = resolveMethodParams(ResolveFixtureService, 'bare');

        expect(resolved.parameterName).toBeUndefined();
        expect(resolved.directParams).toBeUndefined();
    });
});

describe('getReturnType', () => {
    function buildResponse(responseClass: any, isArray = false): ResponseMetadata {
        return { responseClass, isArray, isAllowEmpty: false };
    }

    it('returns void when no response metadata exists', () => {
        expect(getReturnType(undefined)).toBe('void');
        expect(getReturnType(null)).toBe('void');
    });

    it('returns the class name for object responses', () => {
        expect(getReturnType(buildResponse(UserResultFixtureResponse))).toBe('UserResultFixtureResponse');
    });

    it('appends array brackets for array responses', () => {
        expect(getReturnType(buildResponse(UserResultFixtureResponse, true))).toBe('UserResultFixtureResponse[]');
    });

    it('lowercases primitive response classes', () => {
        expect(getReturnType(buildResponse(String))).toBe('string');
        expect(getReturnType(buildResponse(Number))).toBe('number');
        expect(getReturnType(buildResponse(Boolean))).toBe('boolean');
    });

    it('supports arrays of primitive responses', () => {
        expect(getReturnType(buildResponse(String, true))).toBe('string[]');
    });
});
