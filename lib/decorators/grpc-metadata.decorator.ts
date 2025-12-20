import { ParameterOptionType } from '../types/parameter-option.type';
import { GRPC_METADATA_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const';
import { MetadataParameterOptionType } from '../types/metadata-parameter-option.type';
import { isNotEmpty, isUUID } from 'class-validator';

export function GrpcMetadata(option: MetadataParameterOptionType): ParameterDecorator {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        const params: ParameterOptionType[] =
            Reflect.getMetadata(GRPC_METADATA_PARAMETERS_METADATA_KEY, target, propertyKey) || [];
        option.index = parameterIndex;
        if (option.type == String || option.type == Number) {
            option.type = option.type.name.toLowerCase();
        }
        if (option.type == Boolean) {
            option.type = 'boolean';
        }
        params.push(option);
        Reflect.defineMetadata(
            GRPC_METADATA_PARAMETERS_METADATA_KEY,
            params.sort((paramA, paramB) => paramA.index! - paramB.index!),
            target,
            propertyKey
        );
    };
}

export function GrpcMetadataId(name: string): ParameterDecorator {
    return GrpcMetadata({
        name,
        type: String,
        validate: [isNotEmpty, isUUID]
    });
}
