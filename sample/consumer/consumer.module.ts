import { Module } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { SdkNameModule } from '../../sdk';
import { ConsumerRunner } from './consumer.runner';

/**
 * A consumer application that imports the generated SDK (`sdk/`) and uses it to
 * make type-safe gRPC calls against the `sample` server.
 *
 * `SdkNameModule.register()` wires up the gRPC client (package `sdkName`,
 * `sdk/microservice.proto`) and exposes the generated `AppMicroservice` client,
 * which the `ConsumerRunner` injects and calls.
 */
@Module({
    imports: [
        SdkNameModule.register({
            url: 'localhost:50059',
            timeout: 5000,
            // Attach gRPC metadata to every request (e.g. for methods that read
            // a `workspace-id` header via @GrpcMetadataId on the server). The
            // server validates it as a UUID.
            requestInitializer: (metadata: Metadata) =>
                metadata.add('workspace-id', '550e8400-e29b-41d4-a716-446655440000')
        })
    ],
    providers: [ConsumerRunner]
})
export class ConsumerModule {}
