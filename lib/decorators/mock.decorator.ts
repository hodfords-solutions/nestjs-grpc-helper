import { MockMethodType } from '../types/mock-option.type.js';
import { addPropertyToStorage } from '../helpers/property.helper.js';

export function MockMethod(method: MockMethodType, args?: any[]): PropertyDecorator {
    return function (target: object, propertyName: string | symbol): void {
        addPropertyToStorage(target.constructor, propertyName as string, {
            mock: {
                method,
                args: args || []
            }
        });
    };
}

export function MockNested(maxSize: number = 1): PropertyDecorator {
    return function (target: object, propertyName: string | symbol): void {
        addPropertyToStorage(target.constructor, propertyName as string, {
            mock: {
                nestedMaxSize: maxSize
            }
        });
    };
}

export function MockSample(sample: any): PropertyDecorator {
    return function (target: object, propertyName: string | symbol): void {
        addPropertyToStorage(target.constructor, propertyName as string, {
            mock: { sample }
        });
    };
}

export function MockResponseSample(sample: any): MethodDecorator {
    return function (target: object, propertyKey: string | symbol): void {
        Reflect.defineMetadata(
            'mock:response',
            {
                sample
            },
            target.constructor,
            propertyKey
        );
    };
}

export function MockResponseMethod(method: MockMethodType, args?: any[]): MethodDecorator {
    return function (target: object, propertyKey: string | symbol): void {
        Reflect.defineMetadata(
            'mock:response',
            {
                method,
                args: args || []
            },
            target.constructor,
            propertyKey
        );
    };
}

export function MockResponseCallback(callback: (...args: any[]) => any): MethodDecorator {
    return function (target: object, propertyKey: string | symbol): void {
        Reflect.defineMetadata(
            'mock:response',
            {
                callback
            },
            target.constructor,
            propertyKey
        );
    };
}
