import { Transform } from 'class-transformer';
import { isString } from '@nestjs/common/utils/shared.utils';

export function AnyType() {
    return Transform((object) => {
        if (object.options.groups?.includes('__sendData')) {
            return JSON.stringify(object.value);
        }
        if (isString(object.value)) {
            return JSON.parse(object.value);
        }
        return object.value;
    });
}
