import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
// generateSdk is kept for the commented-out usage example below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { generateProtoService, generateSdk } from '../lib/index.js';
import path from 'path';
import { Transport } from '@nestjs/microservices';
import { GrpcOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// The proto file is generated (and gitignored), so it must be written before the app boots.
generateProtoService('sdkName', path.join(currentDir, '../../proto'));

// generateSdk(require(path.join(currentDir, '../sdk-config.json')));

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.enableCors();

    SwaggerModule.setup(
        'docs',
        app,
        SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('Sample API')
                .setDescription('The API description')
                .setVersion('1.0.0')
                .build()
        )
    );

    app.connectMicroservice<GrpcOptions>({
        transport: Transport.GRPC,
        options: {
            url: '0.0.0.0:50059',
            package: 'sdkName',
            protoPath: path.join(currentDir, '../../proto/microservice.proto')
        }
    });

    await app.startAllMicroservices();
    await app.listen(2013);
    console.log('App start with gRPC microservice on port 50051 and HTTP server on port 2013');
}

bootstrap().then(() => {
    for (const arg of process.argv) {
        if (arg === '--exit') {
            process.exit(0);
        }
    }
});
