import { camelCase, upperFirst } from 'lodash';

export class ModuleTemplateService {
    constructor(
        private packageName: string,
        private fileName: string
    ) {}

    template(services: string[]) {
        const moduleName = upperFirst(camelCase(this.packageName));
        return `
        import { DynamicModule, Module, Global } from '@nestjs/common';
        import { ClientsModule } from '@nestjs/microservices';
        import path from 'path';
        import { MicroserviceModuleOptionType } from './types/microservice-option.type';
        import { ${services.join(',')} } from './services/${this.fileName}.service';
        import { CustomGrpcClient } from '@hodfords/nestjs-grpc-helper';
        import * as grpc from '@grpc/grpc-js';

        @Global()
        @Module({})
        export class ${moduleName}Module {
            static register(options: MicroserviceModuleOptionType): DynamicModule {
                return {
                    module: ${moduleName}Module,
                    providers: [
                        ${services.join(',')},
                        {
                            provide: '${this.packageName}_OPTIONS',
                            useValue: options
                        }
                    ],
                    exports: [${services.join(',')}],
                    imports: [
                        ClientsModule.register([
                            {
                                name: '${this.packageName}_PACKAGE',
                                customClass: CustomGrpcClient,
                                options: {
                                    url: options.url,
                                    package: '${this.packageName}',
                                    protoPath: path.join(__dirname, 'microservice.proto'),
                                    credentials: options.ssl ? grpc.credentials.createSsl() : undefined,
                                    maxReceiveMessageLength: options.maxReceiveMessageLength ?? 4 * 1024 * 1024,
                                    loader: {
                                        arrays: options.shouldLoadEmptyArray ?? false
                                    }
                                }
                            }
                        ])
                    ]
                };
            }
        }
        `;
    }
}
