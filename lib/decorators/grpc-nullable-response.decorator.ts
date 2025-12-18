/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { GRPC_NULLABLE_RESPONSE_METADATA_KEY } from '../constants/metadata-key.const';
import { ClassConstructor } from 'class-transformer';
import { ResponseModel } from '@hodfords/nestjs-response';
import { applyDecorators } from '@nestjs/common';

export function GrpcNullableResponse(
    responseClass: ClassConstructor<object>,
    options?: {
        isArray?: boolean;
        isAllowEmpty?: boolean;
        isGrpcNullable?: boolean;
    }
): MethodDecorator {
    const responseModelOptions = {
        isAllowEmpty: true,
        isGrpcNullable: true,
        ...options
    };

    return applyDecorators(
        ResponseModel(responseClass, responseModelOptions),
        (target: Function, propertyKey: string | symbol) => {
            Reflect.defineMetadata(GRPC_NULLABLE_RESPONSE_METADATA_KEY, responseClass, target, propertyKey);
        }
    );
}
