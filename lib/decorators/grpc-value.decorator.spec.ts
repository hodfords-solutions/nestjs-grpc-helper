import 'reflect-metadata';
import { GrpcValue } from './grpc-value.decorator';
import { GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';

describe('GrpcValue', () => {
    it('records the parameter index on the method', () => {
        class Service {
            findOne(@GrpcValue() param: object): object {
                return param;
            }
        }

        expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, Service.prototype, 'findOne')).toBe(0);
    });

    it('records the index of a non-first parameter', () => {
        class Service {
            findMany(first: string, @GrpcValue() param: object): object {
                return { first, param };
            }
        }

        expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, Service.prototype, 'findMany')).toBe(1);
    });

    it('keeps the last applied index when called manually multiple times', () => {
        class Service {
            method(a: object, b: object): void {
                void a;
                void b;
            }
        }

        GrpcValue()(Service.prototype, 'method', 1);
        GrpcValue()(Service.prototype, 'method', 0);

        expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, Service.prototype, 'method')).toBe(0);
    });

    it('scopes the metadata per method', () => {
        class Service {
            first(@GrpcValue() param: object): object {
                return param;
            }

            second(): void {}
        }

        expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, Service.prototype, 'first')).toBe(0);
        expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, Service.prototype, 'second')).toBeUndefined();
    });
});
