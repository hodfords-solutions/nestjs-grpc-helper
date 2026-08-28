import { Injectable, Logger } from '@nestjs/common';
import { AppMicroservice, UserTypeEnum } from '../../sdk';

// @GrpcId / @GrpcIds / @GrpcMetadataId parameters are validated as UUIDs on the server.
const userId = '550e8400-e29b-41d4-a716-446655440000';
const relatedIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const anyParam = { name: 'john', data: { source: 'consumer' } };
const nested = { address: '123 Main St', type: UserTypeEnum.STANDARD };

/**
 * Exercises the generated SDK by calling every method on the `sample`
 * microservice over gRPC. Each call is fully type-checked against the DTOs and
 * responses that were generated into the SDK from the server's decorators.
 */
@Injectable()
export class ConsumerRunner {
    private readonly logger = new Logger(ConsumerRunner.name);

    constructor(private readonly appMicroservice: AppMicroservice) {}

    async run(): Promise<void> {
        const sdk = this.appMicroservice;
        const calls: [string, () => Promise<unknown>][] = [
            // Single object / array-of-objects responses.
            ['findOne', () => sdk.findOne({ name: 'john', nestedDto: nested })],
            ['findMany', () => sdk.findMany({ name: 'john', nestedDto: [{ address: '123 Main St' }] })],
            // Methods with no response model (return void).
            ['emptyFunction', () => sdk.emptyFunction({ name: 'john', nestedDto: [{ address: '123 Main St' }] })],
            ['emptyParams', () => sdk.emptyParams()],
            // AnyType passthrough: `data` is serialized as JSON over the wire.
            ['anyDto', () => sdk.anyDto(anyParam)],
            ['getUsersByName', () => sdk.getUsersByName(anyParam)],
            // Native scalar responses.
            ['checkUserActive', () => sdk.checkUserActive(anyParam)],
            ['getUserDisplayName', () => sdk.getUserDisplayName(anyParam)],
            ['countUsers', () => sdk.countUsers(anyParam)],
            ['getUserRating', () => sdk.getUserRating(anyParam)],
            // Native array responses.
            ['getUserTags', () => sdk.getUserTags(anyParam)],
            ['getUserPermissions', () => sdk.getUserPermissions(anyParam)],
            ['getUserRolePriorities', () => sdk.getUserRolePriorities(anyParam)],
            // Individual parameters (not a single DTO body).
            ['getUserWithRelations', () => sdk.getUserWithRelations(userId, relatedIds)],
            ['getUserByType', () => sdk.getUserByType(userId, UserTypeEnum.ADMIN)],
            // Flattened params exposed as individual fields by the SDK.
            ['searchUsersFlattened', () => sdk.searchUsersFlattened('john', { address: '123 Main St' })],
            // Nested DTO params.
            ['resolveAddress', () => sdk.resolveAddress({ address: '123 Main St' })],
            ['findAddressOrNull', () => sdk.findAddressOrNull({ address: '123 Main St' })],
            // Nullable response. Wrapped as { value, grpcNullable }; read `.value`.
            ['findUserByAddress(exists)', () => sdk.findUserByAddress({ address: 'exists' })],
            ['findUserByAddress(missing)', () => sdk.findUserByAddress({ address: 'not-found' })],
            // Pagination + sort params.
            [
                'listUsers',
                () =>
                    sdk.listUsers({ address: '123 Main St' }, { page: 1, perPage: 10 }, {
                        sortField: 'name',
                        sortDirection: 'ASC'
                    } as any)
            ],
            // Reads the `workspace-id` value from gRPC metadata on the server.
            ['getWorkspaceId', () => sdk.getWorkspaceId()]
        ];

        for (const [label, fn] of calls) {
            await this.call(label, fn);
        }
    }

    private async call(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            const result = await fn();
            this.logger.log(`${label} -> ${JSON.stringify(result)}`);
        } catch (error) {
            this.logger.warn(`${label} FAILED -> ${error instanceof Error ? error.message : error}`);
        }
    }
}
