import { Body } from '@nestjs/common';

export function GrpcValue(): ParameterDecorator {
    return function (target: Object, propertyKey: string | symbol, parameterIndex: number) {
        Reflect.defineMetadata('grpc:parameter-index', parameterIndex, target, propertyKey);
        Body()(target, propertyKey, parameterIndex);
    };
}
