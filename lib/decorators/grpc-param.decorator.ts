import { ParameterOptionType } from '../types/parameter-option.type';
import { IsArray, IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { DIRECT_PARAMETERS_METADATA_KEY, FLATTEN_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const';
import { EnumAllowedTypes } from '@nestjs/swagger/dist/interfaces/schema-object-metadata.interface';

export function SdkFlattenParams(): MethodDecorator {
    return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
        Reflect.defineMetadata(FLATTEN_PARAMETERS_METADATA_KEY, true, target, propertyKey);
    };
}

export function GrpcParam(option: ParameterOptionType): ParameterDecorator {
    return function (target: object, propertyKey: string | symbol, parameterIndex: number) {
        const params: ParameterOptionType[] =
            Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, target, propertyKey) || [];
        option.index = parameterIndex;
        if (option.type == String || option.type == Number) {
            option.type = option.type.name.toLowerCase();
        }
        if (option.type == Boolean) {
            option.type = 'boolean';
        }
        params.push(option);
        Reflect.defineMetadata(
            DIRECT_PARAMETERS_METADATA_KEY,
            params.sort((paramA, paramB) => paramA.index! - paramB.index!),
            target,
            propertyKey
        );
    };
}

export function GrpcId(name: string): ParameterDecorator {
    return GrpcParam({
        name,
        type: String,
        required: true,
        decorators: [IsNotEmpty(), IsUUID()]
    });
}

export function GrpcIds(name: string): ParameterDecorator {
    return GrpcParam({
        name,
        type: String,
        required: true,
        isArray: true,
        decorators: [IsNotEmpty(), IsUUID('all', { each: true })]
    });
}

type EnumParamOptionType = { enumName: string; enum: EnumAllowedTypes } & ParameterOptionType;

function getEnumType(enumObj: EnumAllowedTypes): string {
    let type: string;
    for (const key of Object.keys(enumObj)) {
        const enumType = typeof enumObj[key];
        if (type && type !== enumType) {
            throw new Error('Mixed enum types are not supported in GrpcEnum decorator');
        }
        type = enumType;
    }

    if (!type) {
        throw new Error('Unable to determine enum type in GrpcEnum decorator');
    }
    return type;
}

export function GrpcEnum(option: EnumParamOptionType): ParameterDecorator {
    return GrpcParam({
        type: getEnumType(option.enum),
        ...option,
        required: true,
        decorators: [IsNotEmpty(), IsEnum(option.enum)]
    });
}

export function GrpcEnums(option: EnumParamOptionType): ParameterDecorator {
    return GrpcParam({
        type: getEnumType(option.enum),
        ...option,
        required: true,
        isArray: true,
        decorators: [IsArray(), IsEnum(option.enum, { each: true })]
    });
}
