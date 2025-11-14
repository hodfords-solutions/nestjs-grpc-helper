/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { microserviceStorage } from '../storages/microservice.storage';
import { GrpcMethod } from '@nestjs/microservices';
import { overrideMethod } from '../helpers/flat-param.helper';
import {
    DIRECT_PARAMETERS_METADATA_KEY,
    GRPC_DESCRIPTION_METADATA_KEY,
    GRPC_METHOD_METADATA_KEY
} from '../constants/metadata-key.const';

export function RegisterGrpcMicroservice(description?: string): any {
    return (constructor: Function) => {
        microserviceStorage.push(constructor);
        Reflect.defineMetadata(GRPC_DESCRIPTION_METADATA_KEY, description, constructor);
        return constructor;
    };
}

export function GrpcAction(description?: string): any {
    return function (target: Function, propertyKey: string, descriptor: PropertyDescriptor) {
        if (Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, target, propertyKey)) {
            overrideMethod(target, propertyKey, descriptor);
        }
        Reflect.defineMetadata(GRPC_METHOD_METADATA_KEY, true, target, propertyKey);
        Reflect.defineMetadata(GRPC_DESCRIPTION_METADATA_KEY, description, target, propertyKey);
        GrpcMethod(target.constructor.name, propertyKey)(target, propertyKey, descriptor);
    };
}
