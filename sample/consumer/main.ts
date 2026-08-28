import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConsumerModule } from './consumer.module';
import { ConsumerRunner } from './consumer.runner';

/**
 * Standalone CLI runner that consumes the generated gRPC SDK.
 *
 * Prerequisite: the `sample` gRPC server must be running (e.g. `npm run start:dev`),
 * listening on `0.0.0.0:50059` with package `sdkName`.
 *
 * Run with: `npm run start:consumer`
 */
async function bootstrap(): Promise<void> {
    const logger = new Logger('Consumer');
    const app = await NestFactory.createApplicationContext(ConsumerModule);

    try {
        await app.get(ConsumerRunner).run();
        logger.log('All SDK calls completed successfully');
    } catch (error) {
        logger.error('SDK call failed', error instanceof Error ? error.stack : error);
        process.exitCode = 1;
    } finally {
        await app.close();
    }
}

bootstrap();
