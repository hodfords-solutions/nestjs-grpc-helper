import { Type } from '@nestjs/common';
import { PickType } from '@nestjs/swagger';
import { addPropertyToStorage } from '../helpers/property.helper';
import { propertyStorage } from '../storages/property.storage';

export function PickResponseType<T, K extends keyof T>(
    classRef: Type<T>,
    keys: K[]
): Type<Pick<T, (typeof keys)[number]>> {
    const swaggerPickTypes: any = PickType(classRef, keys);

    abstract class PickTypeClass extends swaggerPickTypes {}

    const properties = propertyStorage.get(classRef) || [];
    for (const property of properties) {
        if (keys.includes(property.name as K)) {
            addPropertyToStorage(PickTypeClass, property.name, property.option);
        }
    }

    return PickTypeClass as Type<Pick<T, (typeof keys)[number]>>;
}
