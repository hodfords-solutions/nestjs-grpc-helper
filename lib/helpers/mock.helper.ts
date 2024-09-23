import { getPropertiesOfClass } from './property.helper';
import { plainToInstance } from 'class-transformer';
import { faker } from '@faker-js/faker';
import { get } from 'lodash';
import { PropertyOptionType } from '../types/property-option.type';

function getData(option: PropertyOptionType) {
    const { mock } = option;
    if (mock.sample) {
        return mock.sample;
    }
    if (mock.nestedMaxSize) {
        if (option.isArray) {
            return new Array(mock.nestedMaxSize).fill(0).map(() => sample(option.type));
        }
        return sample(option.type);
    }
    if (mock.method && mock.method.startsWith('faker.')) {
        const method: any = get({ faker }, mock.method);

        return method(...mock.args);
    }
}

export function sample<T>(dto: new () => T): T {
    const data = {};
    const properties = getPropertiesOfClass(dto);
    for (const property of properties) {
        if (property.option.mock) {
            data[property.name] = getData(property.option);
        } else {
            data[property.name] = property.option.example;
        }
    }
    return plainToInstance(dto, data);
}
