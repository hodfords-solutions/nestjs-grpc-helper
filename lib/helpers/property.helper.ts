/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import { differenceBy } from 'lodash';
import { PropertyOptionType, PropertyType } from '../types/property-option.type';

export function getClassHasProperties() {
    return propertyStorage.keys();
}

export function addPropertyToStorage(constructor: Function, propertyName: string, option: PropertyOptionType) {
    if (propertyStorage.has(constructor)) {
        const properties = propertyStorage.get(constructor);
        const property = properties.find(({ name }) => name === propertyName);
        if (property) {
            property.option = { ...property.option, ...option };
        } else {
            properties.push({
                name: propertyName,
                option
            });
        }
    } else {
        propertyStorage.set(constructor, [
            {
                name: propertyName,
                option
            }
        ]);
    }

    if (!option.isAutoGenerated) {
        sdkDtos.add(constructor);
    }
}

function removeOverridableProperties(
    validProperties: PropertyType[],
    overridableProperties: PropertyType[]
): PropertyType[] {
    return differenceBy(validProperties, overridableProperties, (item) => item.name);
}

export function extractProperties(): Record<string, { option: PropertyOptionType }[]> {
    const dtos = traverseSDKProperties();
    const dtoWithProperties = {};

    for (const dto of dtos) {
        const properties = getPropertiesOfClass(dto);
        if (!dtoWithProperties[dto.name]) {
            dtoWithProperties[dto.name] = properties;
            continue;
        }
        const existedProperties: string[] = dtoWithProperties[dto.name].map((property) => property.name);
        const newProperties = properties.filter((property) => !existedProperties.includes(property.name));
        const overridableProperties = properties.filter(
            (property) => existedProperties.includes(property.name) && !property.option?.isAutoGenerated
        );
        const validProperties = removeOverridableProperties(dtoWithProperties[dto.name], overridableProperties);
        dtoWithProperties[dto.name] = validProperties.concat(newProperties).concat(overridableProperties);
    }

    return dtoWithProperties;
}

export function getPropertiesOfClass(constructor: Function, properties = []): PropertyType[] {
    if (!propertyStorage.get(constructor)) {
        return properties;
    }
    const parentProperties = propertyStorage.get(constructor) || [];
    for (const property of parentProperties) {
        if (!properties.some((newProperty) => newProperty.name === property.name)) {
            properties.push(property);
        }
    }
    const parentClass = Object.getPrototypeOf(constructor);
    if (parentClass.name) {
        return getPropertiesOfClass(parentClass, properties);
    }
    return properties;
}

export function traverseSDKProperties(): Function[] {
    const queue: Function[] = Array.from(sdkDtos.keys());
    const auditor = new Set(sdkDtos);
    const responses: Function[] = [];

    while (queue.length) {
        const dto = queue.shift();
        const properties = getPropertiesOfClass(dto);
        for (const { option } of properties) {
            if (isFunction(option.type)) {
                const constructor = option.type.name === 'type' ? option.type() : option.type;
                if (!auditor.has(constructor)) {
                    queue.push(constructor);
                    auditor.add(constructor);
                }
            }
        }
        responses.push(dto);
    }

    return responses.reverse();
}
