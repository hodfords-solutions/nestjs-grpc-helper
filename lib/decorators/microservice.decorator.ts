/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { microserviceStorage } from '../storages/microservice.storage';
import { GrpcMethod } from '@nestjs/microservices';
import { overrideMethod } from '../helpers/flat-param.helper';

export function RegisterGrpcMicroservice(description?: string): any {
    return (constructor: Function) => {
        microserviceStorage.push(constructor);
        Reflect.defineMetadata('grpc:description', description, constructor);
        return constructor;
    };
}

export function GrpcAction(description?: string): any {
    return function (target: Function, propertyKey: string, descriptor: PropertyDescriptor) {
        if (Reflect.getMetadata('grpc:has-direct-parameter', target, propertyKey)) {
            overrideMethod(target, propertyKey, descriptor);
        }
        Reflect.defineMetadata('grpc:method', true, target, propertyKey);
        Reflect.defineMetadata('grpc:description', description, target, propertyKey);
        GrpcMethod(target.constructor.name, propertyKey)(target, propertyKey, descriptor);
    };
}
