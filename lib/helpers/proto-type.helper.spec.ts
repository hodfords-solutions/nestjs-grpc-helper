import { convertProtoTypeToSwagger, convertProtoTypeToTypescript } from './proto-type.helper';

enum ProtoFixtureEnum {
    FIRST = 'FIRST',
    SECOND = 'SECOND'
}

class ProtoNestedFixture {}

describe('convertProtoTypeToTypescript', () => {
    it('returns the class name for class types', () => {
        expect(convertProtoTypeToTypescript({ type: ProtoNestedFixture })).toBe('ProtoNestedFixture');
    });

    it('returns the lazy resolver name when not generating', () => {
        expect(convertProtoTypeToTypescript({ type: () => ProtoNestedFixture })).toBe('type');
    });

    it('resolves lazy types to the target class name when generating', () => {
        expect(convertProtoTypeToTypescript({ type: () => ProtoNestedFixture }, true)).toBe('ProtoNestedFixture');
    });

    it('returns the enum name for enum properties', () => {
        const option: any = { type: 'string', enum: ProtoFixtureEnum, enumName: 'ProtoFixtureEnum' };
        expect(convertProtoTypeToTypescript(option)).toBe('ProtoFixtureEnum');
    });

    it('ignores enum metadata when the enum name is missing', () => {
        expect(convertProtoTypeToTypescript({ type: 'string', enum: ProtoFixtureEnum } as any)).toBe('string');
    });

    it('converts the proto bool type to boolean', () => {
        expect(convertProtoTypeToTypescript({ type: 'bool' } as any)).toBe('boolean');
    });

    it('keeps other proto scalar types as-is', () => {
        expect(convertProtoTypeToTypescript({ type: 'string' })).toBe('string');
        expect(convertProtoTypeToTypescript({ type: 'uint32' } as any)).toBe('uint32');
        expect(convertProtoTypeToTypescript({ type: 'number' })).toBe('number');
    });
});

describe('convertProtoTypeToSwagger', () => {
    it('returns class types unchanged', () => {
        expect(convertProtoTypeToSwagger({ type: ProtoNestedFixture })).toBe(ProtoNestedFixture);
    });

    it('returns lazy type functions unchanged', () => {
        const lazyType = () => ProtoNestedFixture;
        expect(convertProtoTypeToSwagger({ type: lazyType })).toBe(lazyType);
    });

    it('converts the proto bool type to boolean', () => {
        expect(convertProtoTypeToSwagger({ type: 'bool' } as any)).toBe('boolean');
    });

    it('returns the enum name for enum properties', () => {
        const option: any = { type: 'string', enum: ProtoFixtureEnum, enumName: 'ProtoFixtureEnum' };
        expect(convertProtoTypeToSwagger(option)).toBe('ProtoFixtureEnum');
    });

    it('returns scalar proto types as strings', () => {
        expect(convertProtoTypeToSwagger({ type: 'string' })).toBe('string');
    });
});
