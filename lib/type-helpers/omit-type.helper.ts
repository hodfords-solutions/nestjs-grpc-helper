import { Type } from '@nestjs/common';
import { OmitType } from '@nestjs/swagger';
import { propertyStorage } from '../storages/property.storage';
import { addPropertyToStorage } from '@hodfords/nestjs-grpc-helper';

export function OmitResponseType<T, K extends keyof T>(
    classRef: Type<T>,
    keys: readonly K[]
): Type<Omit<T, (typeof keys)[number]>> {
    const swaggerOmitTypes: any = OmitType(classRef, keys);

    abstract class OmitTypeClass extends swaggerOmitTypes {}
    const properties = propertyStorage.get(classRef);
    for (const property of properties) {
        if (!keys.includes(property.name as K)) {
            addPropertyToStorage(OmitTypeClass, property.name, { ...property.option });
        }
    }
    return OmitTypeClass as Type<Omit<T, (typeof keys)[number]>>;
}
