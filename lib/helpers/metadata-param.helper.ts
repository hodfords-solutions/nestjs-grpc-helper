import { GRPC_METADATA_PARAMETERS_METADATA_KEY } from '../constants/metadata-key.const';
import { MetadataParameterOptionType } from '../types/metadata-parameter-option.type';
import { moveMetadata } from './flat-param.helper';

export function overrideMetadataMethod(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const params: MetadataParameterOptionType[] =
        Reflect.getMetadata(GRPC_METADATA_PARAMETERS_METADATA_KEY, target, propertyKey) || [];
    descriptor.value = function (...args: any[]) {
        const newArgs = [];
        const metadata = args[args.length - 2];
        for (const param of params) {
            newArgs[param.index] = metadata.get(param.name)[0];
            for (const validate of param.validate || []) {
                if (!validate(newArgs[param.index])) {
                    throw new Error(`Validation failed for metadata parameter ${validate.name} "${param.name}"`);
                }
            }
        }
        for (let i = 0; i < args.length; i++) {
            if (newArgs[i] === undefined) {
                newArgs[i] = args[i];
            } else {
                newArgs.push(args[i]);
            }
        }
        return originalMethod.apply(this, newArgs);
    };
    moveMetadata(originalMethod, descriptor.value);
}
