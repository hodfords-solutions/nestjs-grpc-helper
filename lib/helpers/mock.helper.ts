import { getPropertiesOfClass } from './property.helper';
import { plainToInstance } from 'class-transformer';
import { faker } from '@faker-js/faker';
import { get } from 'lodash';
import { PropertyOptionType } from '../types/property-option.type';
import { MockOptionType } from '../types/mock-option.type';

function resolveType(type: any) {
    if (typeof type === 'function' && type.name === 'type') {
        return type();
    }
    return type;
}

function getData(option: PropertyOptionType, depth = 0, visited: Set<any> = new Set()): any {
    const { mock } = option;

    if (!mock) {
        return undefined;
    }

    if (mock.sample) {
        return mock.sample;
    }

    if (mock.nestedMaxSize) {
        const resolvedType = resolveType(option.type);

        if (option.isArray) {
            return new Array(mock.nestedMaxSize).fill(0).map(() => sample(resolvedType, depth, visited));
        }

        return sample(resolvedType, depth, visited);
    }

    if (mock.method && mock.method.startsWith('faker.')) {
        const method: any = get({ faker }, mock.method);

        return method(...mock.args);
    }
}

export function sampleMethod(mock: MockOptionType) {
    const method: any = get({ faker }, mock.method);

    return method(...mock.args);
}

export function sample<T>(dto: new (...args: any[]) => T, depth = 0, visited: Set<any> = new Set()): T {
    const maxDepth = 5;

    if (depth > maxDepth || visited.has(dto)) {
        return {} as T;
    }

    visited.add(dto);

    const data: Record<string, any> = {};
    const properties = getPropertiesOfClass(dto);

    for (const property of properties) {
        if (property.option.mock) {
            data[property.name] = getData(property.option, depth + 1, visited);
        } else {
            data[property.name] = property.option.example;
        }
    }

    visited.delete(dto);

    return plainToInstance(dto, data);
}
