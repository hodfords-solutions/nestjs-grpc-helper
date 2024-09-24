import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppMicroservice } from './app.microservice';
import { MicroserviceDocumentModule } from '@hodfords/nestjs-grpc-helper';
import path from 'path';
import { CommandModule } from '@hodfords/nestjs-command';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomGrpcClient } from '@hodfords/nestjs-grpc-helper';
import { ResponseModule } from '@hodfords/nestjs-response';

@Module({
    imports: [
        CommandModule,
        ResponseModule.forRoot(),
        MicroserviceDocumentModule.register({
            isEnable: true,
            packageName: 'HERO',
            clientOptions: {
                customClass: CustomGrpcClient,
                options: {
                    url: '0.0.0.0:50051',
                    package: 'HERO',
                    protoPath: path.join(__dirname, '../../proto/microservice.proto')
                }
            }
        }),
        TypeOrmModule.forRoot({
            type: 'sqlite',
            entities: [],
            database: 'test'
        })
    ],
    controllers: [AppController, AppMicroservice],
    providers: [AppService]
})
export class AppModule {}
