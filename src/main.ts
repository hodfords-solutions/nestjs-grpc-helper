import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { generateProtoService, generateSdk } from '@hodfords/nestjs-grpc-helper';
import path from 'path';
import { Transport } from '@nestjs/microservices';
import { GrpcOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

generateProtoService('HERO', path.join(__dirname, '../../proto'));
generateSdk('HERO', path.join(__dirname, '../../sdk'));

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.connectMicroservice<GrpcOptions>({
        transport: Transport.GRPC,
        options: {
            url: '0.0.0.0:1234',
            package: 'HERO',
            protoPath: path.join(__dirname, '../../proto/microservice.proto')
        }
    });
    app.enableCors();
    const config = new DocumentBuilder()
        .setTitle('Cats example')
        .setDescription('The cats API description')
        .setVersion('1.0')
        .addTag('cats')
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    await app.startAllMicroservices();
    await app.listen(2013);
}

bootstrap().then();
