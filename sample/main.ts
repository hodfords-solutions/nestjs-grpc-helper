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
            protoPath: path.join(__dirname, '../../proto/microservice.proto')
        }
    });

    await app.startAllMicroservices();
    await app.listen(3000);
}

bootstrap().then();
