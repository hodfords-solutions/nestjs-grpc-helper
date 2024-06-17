import { propertyStorage, sdkDtos } from '../storages/property.storage';

export function ExtendType() {
    return function ClassDecorator<T extends { new (...args: any[]): {} }>(constructor: T) {
        let properties = propertyStorage.get(Object.getPrototypeOf(constructor));
        propertyStorage.delete(Object.getPrototypeOf(constructor));
        propertyStorage.set(constructor, properties);

        if (sdkDtos.has(Object.getPrototypeOf(constructor))) {
            sdkDtos.delete(Object.getPrototypeOf(constructor));
        }
        sdkDtos.add(constructor);

        return constructor;
    };
}
