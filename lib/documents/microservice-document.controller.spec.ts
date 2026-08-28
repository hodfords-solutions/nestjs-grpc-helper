/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/naming-convention */
jest.mock('@faker-js/faker', () => ({ faker: {} }));
jest.mock('../services/generate-document.service', () => ({
    GenerateDocumentService: jest.fn().mockImplementation((packageName: string) => ({
        generate: () => ({ name: packageName, services: [] })
    }))
}));

import 'reflect-metadata';
import { Metadata } from '@grpc/grpc-js';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { GenerateDocumentService } from '../services/generate-document.service';
import { MicroserviceDocumentController } from './microservice-document.controller';

describe('MicroserviceDocumentController', () => {
    let app: INestApplication;
    let serviceGrpc: { [method: string]: jest.Mock };
    let clientMock: { getService: jest.Mock };

    const documentOptions = {
        isEnable: true,
        packageName: 'sdkName',
        clientOptions: {}
    };

    beforeAll(async () => {
        serviceGrpc = {};
        clientMock = { getService: jest.fn(() => serviceGrpc) };

        const moduleRef = await Test.createTestingModule({
            controllers: [MicroserviceDocumentController],
            providers: [
                { provide: 'DOCUMENT_OPTIONS', useValue: documentOptions },
                { provide: 'HERO_PACKAGE', useValue: clientMock }
            ]
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /microservice-documents/json', () => {
        it('returns the generated document for the configured package', async () => {
            const response = await request(app.getHttpServer()).get('/microservice-documents/json').expect(200);

            expect(response.body).toEqual({ name: 'sdkName', services: [] });
            expect(GenerateDocumentService).toHaveBeenCalledWith('sdkName');
        });
    });

    describe('POST /microservice-documents/test', () => {
        it('calls the requested service method and returns a single result when isFindMany is false', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ id: 1, name: 'john' }));

            const response = await request(app.getHttpServer())
                .post('/microservice-documents/test')
                .send({
                    serviceName: 'AppMicroservice',
                    methodName: 'findOne',
                    data: { name: 'john' },
                    isFindMany: false
                })
                .expect(200);

            expect(response.body).toEqual({ id: 1, name: 'john' });
            expect(clientMock.getService).toHaveBeenCalledWith('AppMicroservice');
            expect(serviceGrpc.findOne).toHaveBeenCalledWith({ name: 'john' }, expect.any(Metadata));
        });

        it('returns the full list when isFindMany is true', async () => {
            serviceGrpc.findMany = jest.fn(() => of({ grpcArray: true, items: [{ id: 1 }, { id: 2 }] }));

            const response = await request(app.getHttpServer())
                .post('/microservice-documents/test')
                .send({
                    serviceName: 'AppMicroservice',
                    methodName: 'findMany',
                    data: {},
                    isFindMany: true
                })
                .expect(200);

            expect(response.body).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('forwards the request metadata to the gRPC call', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ id: 1 }));

            await request(app.getHttpServer())
                .post('/microservice-documents/test')
                .send({
                    serviceName: 'AppMicroservice',
                    methodName: 'findOne',
                    data: {},
                    metadata: { 'workspace-id': 'ws-1', 'request-id': 'req-9' },
                    isFindMany: false
                })
                .expect(200);

            const metadata: Metadata = serviceGrpc.findOne.mock.calls[0][1];
            expect(metadata.get('workspace-id')).toEqual(['ws-1']);
            expect(metadata.get('request-id')).toEqual(['req-9']);
        });
    });
});
