import lodash from 'lodash';

const { isEmpty } = lodash;
import { PropertyOptionType } from '../types/property-option.type.js';

export function isEnumProperty(options: PropertyOptionType): boolean {
    return !isEmpty(options.enum) && !isEmpty(options.enumName);
}
