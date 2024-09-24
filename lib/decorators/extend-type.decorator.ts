import { propertyStorage, sdkDtos } from '../storages/property.storage';

const extendClassNames = ['IntersectionTypeClass', 'PickTypeClass', 'OmitTypeClass', 'PartialTypeClass'];

export function ExtendType() {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return function ClassDecorator<T extends { new (...args: any[]): object }>(constructor: T) {
        const parentClass = Object.getPrototypeOf(constructor);
        const properties = propertyStorage.get(parentClass) || [];
        const newProperties = propertyStorage.get(constructor) || [];
        for (const property of properties) {
            if (!newProperties.some((newProperty) => newProperty.name === property.name)) {
                newProperties.push(property);
            }
        }
        propertyStorage.set(constructor, newProperties);
        sdkDtos.add(constructor);
        if (extendClassNames.includes(parentClass.name)) {
            propertyStorage.delete(parentClass);
            sdkDtos.delete(parentClass);
        }

        return constructor;
    };
}
