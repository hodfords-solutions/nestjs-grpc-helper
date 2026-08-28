import { GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';

export function GrpcValue(): ParameterDecorator {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        Reflect.defineMetadata(GRPC_PARAM_INDEX_METADATA_KEY, parameterIndex, target, propertyKey);
        // Body()(target, propertyKey, parameterIndex); // Not work with metadata
    };
}
