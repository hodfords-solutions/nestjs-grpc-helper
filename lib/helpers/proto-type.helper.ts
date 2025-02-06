import { isFunction, isString } from '@nestjs/common/utils/shared.utils';
import { isEnumProperty } from './api-property.helper';
import { PropertyOptionType } from '@hodfords/nestjs-grpc-helper';

export function convertProtoTypeToSwagger(option: PropertyOptionType): PropertyOptionType['type'] | string {
    if (isFunction(option.type)) {
        return option.type;
    }
    return convertProtoTypeToTypescript(option, false);
}

export function convertProtoTypeToTypescript(option: PropertyOptionType, isGenerate?: boolean): string {
    let type = option.type;
    if (isFunction(type)) {
        if (type.name === 'type' && isGenerate) {
            return (option.type as any)().name;
        }
        return type.name;
    }

    if (isEnumProperty(option)) {
        return option.enumName;
    }

    if (isString(option.type)) {
        const numberTypes = ['int32', 'fixed32', 'uint32', 'int64', 'fixed64', 'uint64', 'float', 'double'];
        if (numberTypes.includes(option.format)) {
            type = 'number';
        }

        if (option.type == 'bool') {
            type = 'boolean';
        }
    }

    return type.toString();
}
