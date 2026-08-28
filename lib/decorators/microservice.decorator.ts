/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { microserviceStorage } from '../storages/microservice.storage.js';
import { GrpcMethod } from '@nestjs/microservices';

export function RegisterGrpcMicroservice(description?: string): any {
    return (constructor: Function) => {
        microserviceStorage.push(constructor);
        Reflect.defineMetadata('grpc:description', description, constructor);
        return constructor;
    };
}

export function GrpcAction(description?: string): any {
    return function (target: Function, propertyKey: string, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata('grpc:method', true, target, propertyKey);
        Reflect.defineMetadata('grpc:description', description, target, propertyKey);
        GrpcMethod(target.constructor.name, propertyKey)(target, propertyKey, descriptor);
    };
}

/**
 * Marks a microservice method as a gRPC **server-streaming** RPC. Behaves like {@link GrpcAction}
 * (still bound via Nest's `@GrpcMethod` — a response-streaming handler returns an `Observable`),
 * but additionally flags the method so the proto generator emits `returns (stream ...)` and the SDK
 * stub returns an `Observable` instead of a `Promise`.
 */
export function GrpcStreamAction(description?: string): any {
    return function (target: Function, propertyKey: string, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata('grpc:method', true, target, propertyKey);
        Reflect.defineMetadata('grpc:stream', true, target, propertyKey);
        Reflect.defineMetadata('grpc:description', description, target, propertyKey);
        GrpcMethod(target.constructor.name, propertyKey)(target, propertyKey, descriptor);
    };
}
