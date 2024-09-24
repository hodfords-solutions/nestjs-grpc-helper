import { DynamicModule, Module } from '@nestjs/common';
import { MicroserviceDocumentController } from './microservice-document.controller';
import { DocumentModuleOptionType } from '../types/document-module-option.type';
import { ClientsModule } from '@nestjs/microservices';
import { ServeStaticModule } from '@nestjs/serve-static';
import path from 'path';
import { GenerateSdkCommand } from '../commands/generate-sdk.command';

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
                        GenerateSdkCommand
                    ],
                    controllers: [MicroserviceDocumentController],
                    imports: [
                        ClientsModule.register([{ name: 'HERO_PACKAGE', ...options.clientOptions }]),
                        ServeStaticModule.forRoot({
                            rootPath: path.resolve(__dirname, `../frontend`),
                            renderPath: '/*',
                            serveRoot: serveRoot
                        })
                    ]
                });
            }, options.waitingTime || 200);
        });
    }
}
