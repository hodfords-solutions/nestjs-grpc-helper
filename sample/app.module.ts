import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppMicroservice } from './app.microservice.js';
import { MicroserviceDocumentModule } from '../lib/index.js';
import path from 'path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
import { CommandModule } from '@hodfords/nestjs-command';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomGrpcClient } from '../lib/index.js';
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
                    protoPath: path.join(currentDir, '../../proto/microservice.proto')
                }
            }
        }),
        TypeOrmModule.forRoot({
            type: 'better-sqlite3',
            entities: [],
            database: 'test'
        })
    ],
    controllers: [AppController, AppMicroservice],
    providers: [AppService]
})
export class AppModule {}
