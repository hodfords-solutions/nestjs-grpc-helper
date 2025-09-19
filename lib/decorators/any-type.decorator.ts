import { Transform } from 'class-transformer';

export function AnyType() {
    return Transform((object) => {
        if (object.options.groups?.includes('__sendData')) {
            return JSON.stringify(object.value);
        }
        if (object.options.groups?.includes('__getData')) {
            return JSON.parse(object.value);
        }

        return object.value;
    });
}
