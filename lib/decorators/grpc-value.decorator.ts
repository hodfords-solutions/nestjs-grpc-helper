export function GrpcValue(): ParameterDecorator {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        Reflect.defineMetadata('grpc:parameter-index', parameterIndex, target, propertyKey);
        // Body()(target, propertyKey, parameterIndex); // Not work with metadata
    };
}
