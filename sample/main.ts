import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { generateProtoService, generateSdk } from '../lib/index.js';
import path from 'path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
import { Transport } from '@nestjs/microservices';
import { GrpcOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

generateProtoService('HERO', path.join(currentDir, '../../proto'));
generateSdk(JSON.parse(readFileSync(path.join(currentDir, '../sdk-config.json'), 'utf8')));

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
            url: '0.0.0.0:50051',
            package: 'HERO',
            protoPath: path.join(currentDir, '../../proto/microservice.proto')
        }
    });

    await app.startAllMicroservices();
    await app.listen(2013);
}

bootstrap().then();
