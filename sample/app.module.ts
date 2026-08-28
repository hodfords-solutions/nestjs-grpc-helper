import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppMicroservice } from './app.microservice.js';
import { MicroserviceDocumentModule } from '../lib/index.js';
import path from 'path';
import { CommandModule } from '@hodfords/nestjs-command';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomGrpcClient } from '../lib/index.js';
import { ResponseModule } from '@hodfords/nestjs-response';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const commandModule = CommandModule.register(false, false);

@Module({
    imports: [
        commandModule,
        ResponseModule.forRoot(),
        MicroserviceDocumentModule.register({
            isEnable: true,
            packageName: 'sdkName',
            clientOptions: {
                customClass: CustomGrpcClient,
                options: {
                    url: '0.0.0.0:50059',
                    package: 'sdkName',
                    protoPath: path.join(currentDir, '../../proto/microservice.proto')
                }
            }
        }),
        TypeOrmModule.forRoot({
            type: 'better-sqlite3',
            entities: [],
            database: ':memory:'
        })
    ],
    controllers: [AppController, AppMicroservice],
    providers: [AppService]
})
export class AppModule {}
