import { Property } from '../decorators/property.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { ParameterOptionType } from '../types/parameter-option.type';
import { camelCase, upperFirst, omit } from 'lodash';
import { DIRECT_PARAMETERS_METADATA_KEY, GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';

function moveMetadata(origin: any, destination: any) {
    const metadataKeys = Reflect.getMetadataKeys(origin);
    for (const key of metadataKeys) {
        const metadata = Reflect.getMetadata(key, origin);
        Reflect.defineMetadata(key, metadata, destination);
        Reflect.deleteMetadata(key, metadata, origin);
    }
}

export function createParamDto(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const params: ParameterOptionType[] =
        Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, target, propertyKey) || [];
    const dto = class {};
    const className = upperFirst(camelCase(`${target.constructor.name}-${propertyKey}-Params`));
    Object.defineProperty(dto, 'name', { value: className });
    for (const param of params) {
        const decorators = param.decorators || [];
        Property(omit(param, 'index', 'decorators'))(dto.prototype, param.name);
        for (const decorator of decorators) {
            decorator(dto.prototype, param.name);
        }
    }
    return dto;
}

export function checkParamsIsContinuous(params: ParameterOptionType[]) {
    const indexes = params.map((p) => p.index).sort((a, b) => a - b);
    for (let i = 0; i < indexes.length; i++) {
        if (indexes[i] !== i) {
            return false;
        }
    }
    return true;
}

export function overrideMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const dto = createParamDto(target, propertyKey, descriptor);
    const params: ParameterOptionType[] =
        Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, target, propertyKey) || [];

    if (!checkParamsIsContinuous(params)) {
        throw new Error(`Grpc direct parameters must be continuous and start from index 0 in method ${propertyKey}`);
    }
    if (params && Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, target, propertyKey) !== undefined) {
        throw new Error('Cannot use GrpcValue and direct parameters together');
    }

    descriptor.value = function (...args: any[]) {
        const newArgs = [];
        const body = args[0] ?? {};
        for (const param of params) {
            newArgs[param.index] = body[param.name];
        }
        for (let i = 1; i < args.length; i++) {
            newArgs.push(args[i]);
        }
        return originalMethod.apply(this, newArgs);
    };

    const oldParamTypes = Reflect.getMetadata('design:paramtypes', target, propertyKey) || [];
    const newParamTypes = [dto, ...oldParamTypes.slice(params.length)];
    Reflect.defineMetadata('design:paramtypes', newParamTypes, target, propertyKey);
    moveMetadata(originalMethod, descriptor.value);
    GrpcValue()(target, propertyKey, 0);
}
