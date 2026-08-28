import { DynamicModule, Module } from '@nestjs/common';
import { MicroserviceDocumentController } from './microservice-document.controller.js';
import { DocumentModuleOptionType } from '../types/document-module-option.type.js';
import { ClientsModule } from '@nestjs/microservices';
import { ServeStaticModule } from '@nestjs/serve-static';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { GenerateSdkCommand } from '../commands/generate-sdk.command.js';
import { GenerateProtoCommand } from '../commands/generate-proto.command.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

@Module({})
export class MicroserviceDocumentModule {
    static async register(options: DocumentModuleOptionType): Promise<DynamicModule> {
        if (!options.isEnable) {
            return {
                module: MicroserviceDocumentModule
            };
        }

        let serveRoot = `/microservice-documents`;
        if (options.prefix) {
            serveRoot = `/${options.prefix}${serveRoot}`;
        }

        // Delay for waiting generate document
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    module: MicroserviceDocumentModule,
                    providers: [
                        {
                            provide: 'DOCUMENT_OPTIONS',
                            useValue: options
                        },
                        GenerateSdkCommand,
                        GenerateProtoCommand
                    ],
                    controllers: [MicroserviceDocumentController],
                    imports: [
                        ClientsModule.register([{ name: 'HERO_PACKAGE', ...options.clientOptions }]),
                        ServeStaticModule.forRoot({
                            rootPath: path.resolve(currentDir, `../frontend`),
                            renderPath: '/{*splat}',
                            serveRoot: serveRoot
                        })
                    ]
                });
            }, options.waitingTime || 200);
        });
    }
}
