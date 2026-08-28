/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { GrpcMetadata, GrpcMetadataId } from './grpc-metadata.decorator';
import { GRPC_METADATA_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const';
import { MetadataParameterOptionType } from '../types/metadata-parameter-option.type';
import { isNotEmpty, isUUID } from 'class-validator';

function getParams(target: object, propertyKey: string): MetadataParameterOptionType[] {
    return Reflect.getMetadata(GRPC_METADATA_PARAMETERS_METADATA_KEY, target, propertyKey);
}

describe('GrpcMetadata', () => {
    it('records the metadata parameter name and index', () => {
        class Service {
            find(@GrpcMetadata({ name: 'tenant-id', type: 'string' }) tenantId: string): string {
                return tenantId;
            }
        }

        expect(getParams(Service.prototype, 'find')).toEqual([{ name: 'tenant-id', type: 'string', index: 0 }]);
    });

    it('converts String, Number and Boolean constructors to primitive type names', () => {
        class Service {
            find(
                @GrpcMetadata({ name: 'name', type: String }) name: string,
                @GrpcMetadata({ name: 'count', type: Number }) count: number,
                @GrpcMetadata({ name: 'active', type: Boolean }) active: boolean
            ): void {
                void name;
                void count;
                void active;
            }
        }

        expect(getParams(Service.prototype, 'find')).toEqual([
            { name: 'name', type: 'string', index: 0 },
            { name: 'count', type: 'number', index: 1 },
            { name: 'active', type: 'boolean', index: 2 }
        ]);
    });

    it('sorts the recorded parameters by index', () => {
        class Service {
            find(
                @GrpcMetadata({ name: 'first', type: 'string' }) first: string,
                @GrpcMetadata({ name: 'second', type: 'string' }) second: string
            ): void {
                void first;
                void second;
            }
        }

        expect(getParams(Service.prototype, 'find').map((param) => param.index)).toEqual([0, 1]);
    });

    it('does not mix metadata parameters between methods', () => {
        class Service {
            first(@GrpcMetadata({ name: 'a', type: 'string' }) a: string): string {
                return a;
            }

            second(@GrpcMetadata({ name: 'b', type: 'string' }) b: string): string {
                return b;
            }
        }

        expect(getParams(Service.prototype, 'first')).toHaveLength(1);
        expect(getParams(Service.prototype, 'first')[0].name).toBe('a');
        expect(getParams(Service.prototype, 'second')[0].name).toBe('b');
    });
});

describe('GrpcMetadataId', () => {
    it('records a string parameter validated by isNotEmpty and isUUID', () => {
        class Service {
            getWorkspace(@GrpcMetadataId('workspace-id') workspaceId: string): string {
                return workspaceId;
            }
        }

        const [param] = getParams(Service.prototype, 'getWorkspace');
        expect(param.name).toBe('workspace-id');
        expect(param.type).toBe('string');
        expect(param.index).toBe(0);
        expect(param.validate).toEqual([isNotEmpty, isUUID]);
    });
});
