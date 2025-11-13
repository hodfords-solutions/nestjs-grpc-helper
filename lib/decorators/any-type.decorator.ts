import { Transform } from 'class-transformer';

export function AnyType({ isDto }: { isDto?: boolean } = {}) {
    return Transform((object) => {
        if (isDto && typeof object.value === 'string') {
            return JSON.parse(object.value);
        }

        if (object.options.groups?.includes('__sendData')) {
            return JSON.stringify(object.value);
        }
        if (object.options.groups?.includes('__getData')) {
            return JSON.parse(object.value);
        }

        return object.value;
    });
}
