/* eslint-disable max-lines-per-function */
jest.mock('@hodfords/nestjs-cls-translation', () => ({
    trans: jest.fn((key: string) => key)
}));

import 'reflect-metadata';
import { Metadata, status } from '@grpc/grpc-js';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common/services/logger.service';
import { ClientGrpc } from '@nestjs/microservices';
import { Transform } from 'class-transformer';
import { NEVER, of, throwError } from 'rxjs';
import { GrpcHelper } from './grpc.helper';

class UserModel {
    @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value), { groups: ['__getData'] })
    name: string;
}

class ParamModel {
    @Transform(({ value }) => `sent:${value}`, { groups: ['__sendData'] })
    name: string;
}

describe('GrpcHelper', () => {
    let serviceGrpc: { [method: string]: jest.Mock };
    let client: ClientGrpc;

    const createHelper = (options: any = { timeout: 1000 }): GrpcHelper<UserModel> =>
        GrpcHelper.with(client, UserModel, options);

    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        serviceGrpc = {};
        client = { getService: jest.fn(() => serviceGrpc) } as any;
    });

    describe('fluent api', () => {
        it('resolves the gRPC service by name through the client and chains', () => {
            const helper = createHelper();
            const result = helper.service('UserService').method('findOne').data({ name: 'john' });

            expect(result).toBe(helper);
            expect(client.getService).toHaveBeenCalledWith('UserService');
        });

        it('runs the requestInitializer against the metadata on creation', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ name: 'john' }));
            const helper = GrpcHelper.with(client, UserModel, {
                timeout: 1000,
                requestInitializer: (metadata) => metadata.set('x-request-id', 'abc-123')
            });

            await helper.service('UserService').method('findOne').data({ name: 'john' }).getOne();

            const metadata: Metadata = serviceGrpc.findOne.mock.calls[0][1];
            expect(metadata).toBeInstanceOf(Metadata);
            expect(metadata.get('x-request-id')).toEqual(['abc-123']);
        });

        it('passes the raw payload when no parameter model is given', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ name: 'john' }));
            const payload = { name: 'john' };

            await createHelper().service('UserService').method('findOne').data(payload).getOne();

            expect(serviceGrpc.findOne).toHaveBeenCalledWith(payload, expect.any(Metadata));
        });

        it('clones the payload and applies __sendData transforms when a parameter model is given', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ name: 'john' }));
            const original = { name: 'john' };

            await createHelper().service('UserService').method('findOne').data(original, ParamModel).getOne();

            const sentPayload = serviceGrpc.findOne.mock.calls[0][0];
            expect(sentPayload).toEqual({ name: 'sent:john' });
            expect(original).toEqual({ name: 'john' });
        });
    });

    describe('getMany / getOne', () => {
        it('wraps a single object response into an array and applies __getData transforms', async () => {
            serviceGrpc.findOne = jest.fn(() => of({ name: 'john' }));

            const result = await createHelper().service('UserService').method('findOne').data({}).getMany();

            expect(result).toEqual([{ name: 'JOHN' }]);
        });

        it('applies per-item __getData transforms to array responses', async () => {
            serviceGrpc.findMany = jest.fn(() => of([{ name: 'john' }, { name: 'jane' }]));

            const result = await createHelper().service('UserService').method('findMany').data({}).getMany();

            expect(result).toEqual([{ name: 'JOHN' }, { name: 'JANE' }]);
        });

        it('unwraps grpcArray responses into their transformed items', async () => {
            serviceGrpc.findMany = jest.fn(() => of({ grpcArray: true, items: [{ name: 'john' }] }));

            const result = await createHelper().service('UserService').method('findMany').data({}).getMany();

            expect(result).toEqual([{ name: 'JOHN' }]);
        });

        it('falls back to an empty array when a grpcArray response has no items', async () => {
            serviceGrpc.findMany = jest.fn(() => of({ grpcArray: true }));

            const result = await createHelper().service('UserService').method('findMany').data({}).getMany();

            expect(result).toEqual([]);
        });

        it('unwraps grpcNative responses to their scalar value', async () => {
            serviceGrpc.getName = jest.fn(() => of({ grpcNative: true, value: 'display-name' }));

            const result = await createHelper().service('UserService').method('getName').data({}).getMany();

            expect(result).toEqual(['display-name']);
        });

        it('keeps falsy native values', async () => {
            serviceGrpc.isActive = jest.fn(() => of({ grpcNative: true, value: false }));

            const result = await createHelper().service('UserService').method('isActive').data({}).getMany();

            expect(result).toEqual([false]);
        });

        it('unwraps grpcNullable responses to their transformed value', async () => {
            serviceGrpc.findOrNull = jest.fn(() => of({ grpcNullable: true, value: { name: 'john' } }));

            const result = await createHelper().service('UserService').method('findOrNull').data({}).getMany();

            expect(result).toEqual([{ name: 'JOHN' }]);
        });

        it('returns [null] for empty grpcNullable responses', async () => {
            serviceGrpc.findOrNull = jest.fn(() => of({ grpcNullable: true }));

            const result = await createHelper().service('UserService').method('findOrNull').data({}).getMany();

            expect(result).toEqual([null]);
        });

        it('getOne returns the first element of getMany', async () => {
            serviceGrpc.findMany = jest.fn(() => of([{ name: 'john' }, { name: 'jane' }]));

            const result = await createHelper().service('UserService').method('findMany').data({}).getOne();

            expect(result).toEqual({ name: 'JOHN' });
        });
    });

    describe('error handling', () => {
        it('maps a timeout to a 500 HttpException with a translated message', async () => {
            serviceGrpc.findOne = jest.fn(() => NEVER);
            const helper = createHelper({ timeout: 20 }).service('UserService').method('findOne').data({});

            await expect(helper.getOne()).rejects.toMatchObject({
                message: 'error.an_error_occurred',
                status: HttpStatus.INTERNAL_SERVER_ERROR
            });
        });

        it('maps ABORTED errors to an HttpException built from the serialized details', async () => {
            const details = JSON.stringify({
                message: 'Validation failed',
                code: HttpStatus.UNPROCESSABLE_ENTITY,
                errors: [{ field: 'name', message: 'required' }]
            });
            serviceGrpc.findOne = jest.fn(() => throwError(() => ({ code: status.ABORTED, details })));
            const helper = createHelper().service('UserService').method('findOne').data({});

            let caught: any;
            try {
                await helper.getOne();
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(HttpException);
            expect(caught.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
            expect(caught.message).toBe('Validation failed');
            expect(caught.response).toEqual([{ field: 'name', message: 'required' }]);
        });

        it('maps other coded gRPC errors to a generic 500 HttpException', async () => {
            serviceGrpc.findOne = jest.fn(() =>
                throwError(() => ({ code: status.INTERNAL, details: 'internal failure' }))
            );
            const helper = createHelper().service('UserService').method('findOne').data({});

            await expect(helper.getOne()).rejects.toMatchObject({
                message: 'error.an_error_occurred',
                status: HttpStatus.INTERNAL_SERVER_ERROR
            });
        });

        it('rethrows errors without a gRPC code unchanged', async () => {
            const error = new Error('boom');
            serviceGrpc.findOne = jest.fn(() => throwError(() => error));
            const helper = createHelper().service('UserService').method('findOne').data({});

            await expect(helper.getOne()).rejects.toBe(error);
        });
    });
});
