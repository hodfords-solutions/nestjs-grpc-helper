import { Type } from '@nestjs/common';
import { OmitType, PartialType } from '@nestjs/swagger';
import { propertyStorage } from '../storages/property.storage';
import { addPropertyToStorage } from '@hodfords/nestjs-grpc-helper';

export function PartialResponseType<T>(classRef: Type<T>): Type<Partial<T>> {
    const swaggerPartialType: any = PartialType(classRef);

    abstract class PartialTypeClass extends swaggerPartialType {}

    let properties = propertyStorage.get(classRef);
    for (const property of properties) {
        addPropertyToStorage(PartialTypeClass, property.name, { ...property.option, required: false });
    }

    return PartialTypeClass as Type<Partial<T>>;
}
