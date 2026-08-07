/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/naming-convention */
import 'reflect-metadata';
import { Logger } from '@nestjs/common/services/logger.service';
import { GRPC_DEFAULT_URL } from '@nestjs/microservices/constants';
import { InvalidGrpcPackageException } from '@nestjs/microservices/errors/invalid-grpc-package.exception';
import { InvalidGrpcServiceException } from '@nestjs/microservices/errors/invalid-grpc-service.exception';
import { InvalidProtoDefinitionException } from '@nestjs/microservices/errors/invalid-proto-definition.exception';
import { EventEmitter } from 'events';
import path from 'path';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { CustomGrpcClient } from './custom-grpc.client';

const PROTO_PATH = path.join(__dirname, '../../proto/microservice.proto');

let fakePackages: any[] = [];

class TestableGrpcClient extends CustomGrpcClient {
    public createClients(): any[] {
        return fakePackages;
    }
}

type FakeServiceFixture = {
    ctor: any;
    instances: any[];
    unaryCalls: any[];
    streamCalls: any[];
    pendingCancelSpies: jest.Mock[];
};

function createFakeServiceFixture(): FakeServiceFixture {
    const instances: any[] = [];
    const unaryCalls: any[] = [];
    const streamCalls: any[] = [];
    const pendingCancelSpies: jest.Mock[] = [];

    function FakeService(this: any, url: string, credentials: any, channelOptions: any) {
        this.url = url;
        this.credentials = credentials;
        this.channelOptions = channelOptions;
        instances.push(this);
    }

    FakeService.prototype.echo = function (...args: any[]): any {
        const callback = args[args.length - 1];
        unaryCalls.push(args.slice(0, -1));
        callback(null, { echoed: args[0] });
        return { finished: true, cancel: jest.fn() };
    };
    FakeService.prototype.echo.requestStream = false;
    FakeService.prototype.echo.responseStream = false;

    FakeService.prototype.fail = function (...args: any[]): any {
        const callback = args[args.length - 1];
        callback({ message: 'unary failed' });
        return { finished: true, cancel: jest.fn() };
    };
    FakeService.prototype.fail.requestStream = false;
    FakeService.prototype.fail.responseStream = false;

    FakeService.prototype.hang = function (): any {
        const cancel = jest.fn();
        pendingCancelSpies.push(cancel);
        return { finished: false, cancel };
    };
    FakeService.prototype.hang.requestStream = false;
    FakeService.prototype.hang.responseStream = false;

    FakeService.prototype.streamNumbers = function (): any {
        const call: any = new EventEmitter();
        call.finished = false;
        call.cancel = jest.fn();
        streamCalls.push(call);
        return call;
    };
    FakeService.prototype.streamNumbers.requestStream = false;
    FakeService.prototype.streamNumbers.responseStream = true;

    return { ctor: FakeService, instances, unaryCalls, streamCalls, pendingCancelSpies };
}

function createClient(options: any, packages: any[]): TestableGrpcClient {
    fakePackages = packages;
    return new TestableGrpcClient(options);
}

describe('CustomGrpcClient', () => {
    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('proto loading and package lookup', () => {
        it('loads a real proto file and exposes the service methods defined in it', () => {
            const client = new CustomGrpcClient({
                url: 'localhost:50099',
                package: 'sdkName',
                protoPath: PROTO_PATH
            });

            const service: any = client.getService('AppMicroservice');
            expect(typeof service.findOne).toBe('function');
            expect(typeof service.findMany).toBe('function');
            expect(typeof service.getWorkspaceId).toBe('function');
            client.close();
        });

        it('throws InvalidGrpcPackageException for an unknown package name', () => {
            expect(
                () =>
                    new CustomGrpcClient({
                        url: 'localhost:50099',
                        package: 'missingPackage',
                        protoPath: PROTO_PATH
                    })
            ).toThrow(InvalidGrpcPackageException);
        });

        it('throws InvalidProtoDefinitionException when the proto file cannot be loaded', () => {
            expect(
                () =>
                    new CustomGrpcClient({
                        url: 'localhost:50099',
                        package: 'sdkName',
                        protoPath: path.join(__dirname, 'does-not-exist.proto')
                    })
            ).toThrow(InvalidProtoDefinitionException);
        });

        it('lookupPackage traverses dotted package names and returns the root for empty names', () => {
            const client = createClient({}, [{}]);
            const root = { a: { b: { c: 'leaf' } } };

            expect(client.lookupPackage(root, 'a.b')).toEqual({ c: 'leaf' });
            expect(client.lookupPackage(root, '')).toBe(root);
        });
    });

    describe('client creation and caching', () => {
        it('creates the underlying client with the default url and insecure credentials', () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);

            client.getClientByServiceName('EchoService');

            expect(fixture.instances).toHaveLength(1);
            expect(fixture.instances[0].url).toBe(GRPC_DEFAULT_URL);
            expect(fixture.instances[0].credentials.constructor.name).toBe('InsecureChannelCredentialsImpl');
        });

        it('passes through custom credentials and merges all channel options', () => {
            const fixture = createFakeServiceFixture();
            const credentials = { fake: true };
            const client = createClient(
                {
                    url: 'localhost:6000',
                    credentials,
                    channelOptions: { 'grpc.enable_retries': 0 },
                    maxSendMessageLength: 100,
                    maxReceiveMessageLength: 200,
                    maxMetadataSize: 300,
                    keepalive: { keepaliveTimeMs: 1000, keepaliveTimeoutMs: 2000 }
                },
                [{ EchoService: fixture.ctor }]
            );

            client.getClientByServiceName('EchoService');

            const instance = fixture.instances[0];
            expect(instance.url).toBe('localhost:6000');
            expect(instance.credentials).toBe(credentials);
            expect(instance.channelOptions).toEqual({
                'grpc.enable_retries': 0,
                'grpc.max_send_message_length': 100,
                'grpc.max_receive_message_length': 200,
                'grpc.max_metadata_size': 300,
                'grpc.keepalive_time_ms': 1000,
                'grpc.keepalive_timeout_ms': 2000
            });
        });

        it('caches the client per service name', () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);

            const first = client.getClientByServiceName('EchoService');
            const second = client.getClientByServiceName('EchoService');
            client.getService('EchoService');

            expect(first).toBe(second);
            expect(fixture.instances).toHaveLength(1);
        });

        it('throws InvalidGrpcServiceException for an unknown service name', () => {
            const client = createClient({}, [{}]);

            expect(() => client.getService('UnknownService')).toThrow(InvalidGrpcServiceException);
            expect(() => client.createClientByServiceName('UnknownService')).toThrow(InvalidGrpcServiceException);
        });
    });

    describe('getKeepaliveOptions', () => {
        it('returns an empty object when keepalive is not configured', () => {
            const client = createClient({}, [{}]);

            expect(client.getKeepaliveOptions()).toEqual({});
        });

        it('maps known keepalive keys to grpc channel option names and skips unknown keys', () => {
            const client = createClient(
                {
                    keepalive: {
                        keepaliveTimeMs: 10,
                        keepaliveTimeoutMs: 20,
                        keepalivePermitWithoutCalls: 1,
                        http2MaxPingsWithoutData: 2,
                        http2MinTimeBetweenPingsMs: 30,
                        http2MinPingIntervalWithoutDataMs: 40,
                        http2MaxPingStrikes: 3,
                        unknownOption: 99
                    }
                },
                [{}]
            );

            expect(client.getKeepaliveOptions()).toEqual({
                'grpc.keepalive_time_ms': 10,
                'grpc.keepalive_timeout_ms': 20,
                'grpc.keepalive_permit_without_calls': 1,
                'grpc.http2.max_pings_without_data': 2,
                'grpc.http2.min_time_between_pings_ms': 30,
                'grpc.http2.min_ping_interval_without_data_ms': 40,
                'grpc.http2.max_ping_strikes': 3
            });
        });
    });

    describe('unary service methods', () => {
        it('emits the response and completes when the callback succeeds', async () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            const result = await firstValueFrom(service.echo({ id: 1 }));

            expect(result).toEqual({ echoed: { id: 1 } });
            expect(fixture.unaryCalls[0]).toEqual([{ id: 1 }]);
        });

        it('errors the observable when the callback yields an error', async () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            await expect(firstValueFrom(service.fail({}))).rejects.toEqual({ message: 'unary failed' });
        });

        it('cancels the underlying call when unsubscribed before completion', () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            const subscription = service.hang({}).subscribe();
            subscription.unsubscribe();

            expect(fixture.pendingCancelSpies[0]).toHaveBeenCalledTimes(1);
        });
    });

    describe('stream service methods', () => {
        it('emits each data event and completes on end', async () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            const resultPromise = lastValueFrom(service.streamNumbers({}).pipe(toArray()));
            const call = fixture.streamCalls[0];
            call.removeAllListeners = jest.fn(call.removeAllListeners.bind(call));
            call.emit('data', 1);
            call.emit('data', 2);
            call.emit('end');

            await expect(resultPromise).resolves.toEqual([1, 2]);
            expect(call.removeAllListeners).toHaveBeenCalled();
        });

        it('propagates stream errors to the observer', async () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            const resultPromise = firstValueFrom(service.streamNumbers({}));
            fixture.streamCalls[0].emit('error', new Error('stream broke'));

            await expect(resultPromise).rejects.toThrow('stream broke');
        });

        it('cancels an unfinished stream when the subscriber unsubscribes', () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);
            const service: any = client.getService('EchoService');

            const subscription = service.streamNumbers({}).subscribe({ error: () => undefined });
            subscription.unsubscribe();

            expect(fixture.streamCalls[0].cancel).toHaveBeenCalledTimes(1);
        });
    });

    describe('lifecycle and unsupported proxy methods', () => {
        it('close() closes closable package entries and clears the registry', () => {
            const fixture = createFakeServiceFixture();
            const closablePackage: any = { EchoService: fixture.ctor, close: jest.fn() };
            const client = createClient({}, [closablePackage]);

            client.close();

            expect(closablePackage.close).toHaveBeenCalledTimes(1);
            expect(() => client.getService('EchoService')).toThrow(InvalidGrpcServiceException);
        });

        it('unwrap() throws before a client exists and returns the first one afterwards', () => {
            const fixture = createFakeServiceFixture();
            const client = createClient({}, [{ EchoService: fixture.ctor }]);

            expect(() => client.unwrap()).toThrow('No underlying client available.');

            const grpcClient = client.getClientByServiceName('EchoService');
            expect(client.unwrap()).toBe(grpcClient);
        });

        it('connect() and send() are not supported in gRPC mode', async () => {
            const client = createClient({}, [{}]);

            await expect(client.connect()).rejects.toThrow('The "connect()" method is not supported in gRPC mode.');
            expect(() => client.send('pattern', {})).toThrow(
                'Method is not supported in gRPC mode. Use ClientGrpc instead (learn more in the documentation).'
            );
        });
    });
});
