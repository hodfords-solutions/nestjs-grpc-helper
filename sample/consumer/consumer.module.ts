import { Module } from '@nestjs/common';
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
            timeout: 5000
        })
    ],
    providers: [ConsumerRunner]
})
export class ConsumerModule {}
