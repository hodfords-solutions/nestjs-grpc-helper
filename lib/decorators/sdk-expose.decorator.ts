import { sdkExposedClasses } from '../storages/property.storage.js';

export function SdkExpose() {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return function ClassDecorator<T extends { new (...args: any[]): object }>(constructor: T) {
        sdkExposedClasses.add(constructor);
        return constructor;
    };
}
