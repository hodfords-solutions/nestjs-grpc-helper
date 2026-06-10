/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import { microserviceStorage } from './microservice.storage';
import { RegisterGrpcMicroservice } from '../decorators/microservice.decorator';

describe('microserviceStorage', () => {
    let savedMicroservices: Function[];

    beforeEach(() => {
        savedMicroservices = [...microserviceStorage];
    });

    afterEach(() => {
        microserviceStorage.length = 0;
        microserviceStorage.push(...savedMicroservices);
    });

    it('is a module level singleton shared with the RegisterGrpcMicroservice decorator', () => {
        const sizeBefore = microserviceStorage.length;

        @RegisterGrpcMicroservice()
        class SharedMicroservice {}

        expect(microserviceStorage).toHaveLength(sizeBefore + 1);
        expect(microserviceStorage[microserviceStorage.length - 1]).toBe(SharedMicroservice);
    });

    it('stores constructors by reference, keeping same-named classes distinct', () => {
        const first = class Duplicated {};
        const second = class Duplicated {};

        microserviceStorage.push(first, second);

        expect(microserviceStorage).toContain(first);
        expect(microserviceStorage).toContain(second);
        expect(microserviceStorage.indexOf(first)).not.toBe(microserviceStorage.indexOf(second));
    });

    it('keeps duplicate registrations, one entry per decorator application', () => {
        const sizeBefore = microserviceStorage.length;

        class TwiceRegistered {}

        RegisterGrpcMicroservice()(TwiceRegistered);
        RegisterGrpcMicroservice()(TwiceRegistered);

        expect(microserviceStorage).toHaveLength(sizeBefore + 2);
    });
});
