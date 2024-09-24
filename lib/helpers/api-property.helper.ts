import { ApiPropertyOptions } from '@nestjs/swagger';
import { isEmpty } from 'lodash';

export function isEnumProperty(options: ApiPropertyOptions): boolean {
    return !isEmpty(options.enum) && !isEmpty(options.enumName);
}
