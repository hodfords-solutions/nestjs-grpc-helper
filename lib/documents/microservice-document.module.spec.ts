jest.mock('@faker-js/faker', () => ({ faker: {} }));

import 'reflect-metadata';
import { DynamicModule } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import path from 'path';
import { GenerateSdkCommand } from '../commands/generate-sdk.command';
import { UpdateAiSkillCommand } from '../commands/update-ai-skill.command';
import { DocumentModuleOptionType } from '../types/document-module-option.type';
import { MicroserviceDocumentController } from './microservice-document.controller';
import { MicroserviceDocumentModule } from './microservice-document.module';

const createOptions = (overrides: Partial<DocumentModuleOptionType> = {}): DocumentModuleOptionType => ({
    isEnable: true,
    packageName: 'sdkName',
    waitingTime: 1,
    clientOptions: {
        transport: Transport.GRPC,
        options: {
            package: 'sdkName',
            protoPath: path.join(__dirname, '../../proto/microservice.proto'),
            url: 'localhost:50099'
        }
    },
    ...overrides
});

const getServeStaticOptions = (module: DynamicModule): any => {
    const serveStaticModule: any = module.imports[1];
    const provider = serveStaticModule.providers.find(
        (moduleProvider: any) => moduleProvider.provide === 'SERVE_STATIC_MODULE_OPTIONS'
    );
    return provider.useValue[0];
};

describe('MicroserviceDocumentModule', () => {
    it('returns a bare module when the documentation is disabled', async () => {
        const module = await MicroserviceDocumentModule.register(createOptions({ isEnable: false }));

        expect(module).toEqual({ module: MicroserviceDocumentModule });
    });

    it('registers the controller, providers and imports when enabled', async () => {
        const options = createOptions();
        const module = await MicroserviceDocumentModule.register(options);

        expect(module.module).toBe(MicroserviceDocumentModule);
        expect(module.controllers).toEqual([MicroserviceDocumentController]);
        expect(module.providers).toEqual([
            { provide: 'DOCUMENT_OPTIONS', useValue: options },
            GenerateSdkCommand,
            UpdateAiSkillCommand
        ]);
        expect(module.imports).toHaveLength(2);
    });

    it('registers the gRPC client under the HERO_PACKAGE token', async () => {
        const module = await MicroserviceDocumentModule.register(createOptions());
        const clientsModule: any = module.imports[0];
        const clientProvider = clientsModule.providers.find((provider: any) => provider.provide === 'HERO_PACKAGE');

        expect(clientProvider).toBeDefined();
        expect(typeof clientProvider.useValue.getService).toBe('function');
    });

    it('serves the documentation ui under /microservice-documents by default', async () => {
        const module = await MicroserviceDocumentModule.register(createOptions());

        expect(getServeStaticOptions(module)).toMatchObject({
            serveRoot: '/microservice-documents',
            renderPath: '/{*splat}'
        });
    });

    it('prepends the configured prefix to the serve root', async () => {
        const module = await MicroserviceDocumentModule.register(createOptions({ prefix: 'api' }));

        expect(getServeStaticOptions(module).serveRoot).toBe('/api/microservice-documents');
    });
});
