import { isEmpty } from 'lodash';
import { PropertyOptionType } from '@hodfords/nestjs-grpc-helper';

export function isEnumProperty(options: PropertyOptionType): boolean {
    return !isEmpty(options.enum) && !isEmpty(options.enumName);
}
