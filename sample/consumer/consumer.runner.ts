import { Injectable, Logger } from '@nestjs/common';
import { AppMicroservice, UserTypeEnum } from '../../sdk';
import { exists } from 'node:fs';

/**
 * Exercises the generated SDK by calling the `sample` microservice over gRPC.
 * Every call is fully type-checked against the DTOs and responses that were
 * generated into the SDK from the server's decorators.
 */
@Injectable()
export class ConsumerRunner {
    private readonly logger = new Logger(ConsumerRunner.name);

    constructor(private readonly appMicroservice: AppMicroservice) {}

    private async call(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            const result = await fn();
            this.logger.log(`${label} -> ${JSON.stringify(result)}`);
        } catch (error) {
            this.logger.warn(`${label} FAILED -> ${error instanceof Error ? error.message : error}`);
        }
    }

    async run(): Promise<void> {
        // Single object response (UserPaginationResponse).
        await this.call('findOne', () =>
            this.appMicroservice.findOne({
                name: 'john',
                nestedDto: { address: '123 Main St', type: UserTypeEnum.STANDARD }
            })
        );

        // Array-of-objects response (UserResponse[]). Note the nested array DTO.
        await this.call('findMany', () =>
            this.appMicroservice.findMany({ name: 'john', nestedDto: [{ address: '123 Main St' }] })
        );

        // AnyType passthrough: `data` is serialized as JSON over the wire.
        await this.call('anyDto', () => this.appMicroservice.anyDto({ name: 'john', data: { source: 'consumer' } }));

        // Nullable response. The payload is wrapped as { value, grpcNullable };
        // read `.value` for the resolved UserResponse (undefined when not found).
        await this.call('findUserByAddress(exists)', () =>
            this.appMicroservice.findUserByAddress({ address: 'exists' })
        );
        await this.call('findUserByAddress(missing)', () =>
            this.appMicroservice.findUserByAddress({ address: 'not-found' })
        );

        await this.call('getUserDisplayName', () =>
            this.appMicroservice.getUserDisplayName({ name: 'john', data: { source: 'consumer' } })
        );
    }
}
