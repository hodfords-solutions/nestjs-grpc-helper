import { MockMethodType } from '../types/mock-option.type';
import { addPropertyToStorage } from '../helpers/property.helper';

export function MockMethod(method: MockMethodType, args?: any[]): PropertyDecorator {
    return function (target: object, propertyName: string): void {
        addPropertyToStorage(target.constructor, propertyName, {
            mock: {
                method,
                args: args || []
            }
        });
    };
}

export function MockNested(maxSize: number = 1): PropertyDecorator {
    return function (target: object, propertyName: string): void {
        addPropertyToStorage(target.constructor, propertyName, {
            mock: {
                nestedMaxSize: maxSize
            }
        });
    };
}

export function MockSample(sample: any): PropertyDecorator {
    return function (target: object, propertyName: string): void {
        addPropertyToStorage(target.constructor, propertyName, {
            mock: { sample }
        });
    };
}

export function MockResponseSample(sample: any): MethodDecorator {
    return function (target: object, propertyKey: string): void {
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
    return function (target: object, propertyKey: string): void {
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
