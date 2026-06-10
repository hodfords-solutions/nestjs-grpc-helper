/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { isNotEmpty, isUUID } from 'class-validator';
import { GrpcMetadata, GrpcMetadataId } from '../decorators/grpc-metadata.decorator';
import { overrideMetadataMethod } from './metadata-param.helper';

function createGrpcMetadata(values: Record<string, string>): any {
    return {
        get: (name: string) => [values[name]]
    };
}

describe('overrideMetadataMethod', () => {
    it('injects the metadata value as the decorated parameter', () => {
        class SingleMetadataService {
            handle(userId: string, data: any): any {
                return { userId, data };
            }
        }
        GrpcMetadata({ name: 'userId', type: String })(SingleMetadataService.prototype, 'handle', 0);
        const descriptor = Object.getOwnPropertyDescriptor(SingleMetadataService.prototype, 'handle');
        overrideMetadataMethod(SingleMetadataService.prototype, 'handle', descriptor);
        Object.defineProperty(SingleMetadataService.prototype, 'handle', descriptor);

        const metadata = createGrpcMetadata({ userId: 'user-1' });
        const result = (new SingleMetadataService() as any).handle({ keyword: 'abc' }, metadata, {});

        expect(result).toEqual({ userId: 'user-1', data: { keyword: 'abc' } });
    });

    it('injects multiple metadata parameters in order', () => {
        class MultiMetadataService {
            handle(userId: string, locale: string, data: any): any {
                return { userId, locale, data };
            }
        }
        GrpcMetadata({ name: 'userId', type: String })(MultiMetadataService.prototype, 'handle', 0);
        GrpcMetadata({ name: 'locale', type: String })(MultiMetadataService.prototype, 'handle', 1);
        const descriptor = Object.getOwnPropertyDescriptor(MultiMetadataService.prototype, 'handle');
        overrideMetadataMethod(MultiMetadataService.prototype, 'handle', descriptor);
        Object.defineProperty(MultiMetadataService.prototype, 'handle', descriptor);

        const metadata = createGrpcMetadata({ userId: 'user-1', locale: 'en' });
        const result = (new MultiMetadataService() as any).handle({ page: 1 }, metadata, {});

        expect(result).toEqual({ userId: 'user-1', locale: 'en', data: { page: 1 } });
    });

    it('runs the configured validators and throws on failure', () => {
        class ValidatedMetadataService {
            handle(userId: string, data: any): any {
                return { userId, data };
            }
        }
        GrpcMetadata({ name: 'userId', type: String, validate: [isNotEmpty] })(
            ValidatedMetadataService.prototype,
            'handle',
            0
        );
        const descriptor = Object.getOwnPropertyDescriptor(ValidatedMetadataService.prototype, 'handle');
        overrideMetadataMethod(ValidatedMetadataService.prototype, 'handle', descriptor);
        Object.defineProperty(ValidatedMetadataService.prototype, 'handle', descriptor);

        const metadata = createGrpcMetadata({ userId: '' });
        expect(() => (new ValidatedMetadataService() as any).handle({}, metadata, {})).toThrow(
            'Validation failed for metadata parameter isNotEmpty "userId"'
        );
    });

    it('supports the GrpcMetadataId shortcut with uuid validation', () => {
        class IdMetadataService {
            handle(userId: string, data: any): any {
                return { userId, data };
            }
        }
        GrpcMetadataId('userId')(IdMetadataService.prototype, 'handle', 0);
        const descriptor = Object.getOwnPropertyDescriptor(IdMetadataService.prototype, 'handle');
        overrideMetadataMethod(IdMetadataService.prototype, 'handle', descriptor);
        Object.defineProperty(IdMetadataService.prototype, 'handle', descriptor);

        const validId = 'b7e7a2f0-4f6e-4a9c-9a64-1c1f7a1b2c3d';
        expect(isUUID(validId)).toBe(true);

        const validMetadata = createGrpcMetadata({ userId: validId });
        const result = (new IdMetadataService() as any).handle({}, validMetadata, {});
        expect(result.userId).toBe(validId);

        const invalidMetadata = createGrpcMetadata({ userId: 'not-a-uuid' });
        expect(() => (new IdMetadataService() as any).handle({}, invalidMetadata, {})).toThrow(/Validation failed/);
    });

    it('passes arguments through unchanged when no metadata parameters are declared', () => {
        class PassThroughService {
            handle(data: any, metadata: any): any {
                return { data, metadata };
            }
        }
        const descriptor = Object.getOwnPropertyDescriptor(PassThroughService.prototype, 'handle');
        overrideMetadataMethod(PassThroughService.prototype, 'handle', descriptor);
        Object.defineProperty(PassThroughService.prototype, 'handle', descriptor);

        const metadata = createGrpcMetadata({});
        const result = new PassThroughService().handle({ keyword: 'abc' }, metadata);

        expect(result).toEqual({ data: { keyword: 'abc' }, metadata });
    });
});
