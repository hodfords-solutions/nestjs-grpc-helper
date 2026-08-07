/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { getPropertiesOfClass } from '@hodfords/nestjs-grpc-helper';
import { ResponseMetadata } from '@hodfords/nestjs-response';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import {
    DIRECT_PARAMETERS_METADATA_KEY,
    FLATTEN_PARAMETERS_METADATA_KEY,
    GRPC_PARAM_INDEX_METADATA_KEY
} from '../constants/metadata-key.const';
import { isPrimitiveType } from './type.helper';

export interface ResolvedMethodParams {
    parameterName?: string;
    directParams?: any[];
}

export function resolveMethodParams(constructor: Function, propertyKey: string): ResolvedMethodParams {
    const params = Reflect.getMetadata('design:paramtypes', constructor.prototype, propertyKey);
    let directParams = Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, constructor.prototype, propertyKey);
    const parameterIndex = Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, constructor.prototype, propertyKey);
    let parameterName;
    if (!isUndefined(parameterIndex)) {
        parameterName = params[parameterIndex].name;
        const isFlattenParam = Boolean(
            Reflect.getMetadata(FLATTEN_PARAMETERS_METADATA_KEY, constructor.prototype, propertyKey)
        );
        if (!directParams && isFlattenParam) {
            directParams = getPropertiesOfClass(params[parameterIndex]).map((property) => ({
                name: property.name,
                ...property.option
            }));
        }
    }
    return { parameterName, directParams };
}

export function getReturnType(response: ResponseMetadata): string {
    if (!response) {
        return 'void';
    }

    let returnType = response?.responseClass?.name;
    if (isPrimitiveType(response.responseClass)) {
        returnType = response.responseClass.name.toLowerCase();
    }
    if (response.isArray) {
        return `${returnType}[]`;
    } else {
        return returnType;
    }
}
