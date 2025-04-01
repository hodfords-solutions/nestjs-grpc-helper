/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { ApiPropertyOptions } from '@nestjs/swagger';
import { isEnumProperty } from '../helpers/api-property.helper';
import { PropertyOptionType } from '@hodfords/nestjs-grpc-helper';
import { HbsGeneratorService } from './hbs-generator.service';

export class ServiceTemplateService extends HbsGeneratorService {
    constructor(private packageName: string) {
        super();
    }

    templateServiceAndModel(serviceContent, modelContent, enumContent): string {
        const data = {
            enumContent,
            modelContent,
            serviceContent
        };

        return this.compileTemplate('./service-template.hbs', data);
    }

    modelTemplate(name: string, properties: string[], parentClass: Function) {
        let extendClass = '';
        if (parentClass.name) {
            extendClass = `extends ${parentClass.name}`;
        }

        return { name, properties, extendClass };
    }

    enumTemplate(options: ApiPropertyOptions) {
        const { enum: properties, enumName, type } = options as PropertyOptionType;
        const valueFormatter = (value: any) => (type === 'string' ? `'${value}'` : value);

        return {
            enumName,
            keys: Object.keys(properties)
                .filter((key) => !parseInt(key))
                .map((key) => `${key} = ${valueFormatter(properties[key])}`)
        };
    }

    // eslint-disable-next-line max-lines-per-function
    propertyTemplate(property, type: string): string {
        const options: PropertyOptionType = { ...property.option, isAutoGenerated: true };
        const isPrimitiveType = ['object', 'string', 'number', 'bool', 'boolean'].includes(type);
        const isAnyType = type === 'string' && options.format === 'any';
        const isEnumType = isEnumProperty(options);
        const isNestedType = !isPrimitiveType && !isEnumType;

        let propertyType = '';
        if (isNestedType) {
            propertyType = `ReturnType<() =>  ${type} ${options.isArray ? '[]' : ''}>`;
        } else if (isAnyType) {
            propertyType = `any ${options.isArray ? '[]' : ''}`;
        } else {
            propertyType = `${type} ${options.isArray ? '[]' : ''}`;
        }

        const propertyName = `${property.name}${options.required === false ? '?' : ''}: ${propertyType}`;
        let typeDecorator = '';
        if (isNestedType) {
            typeDecorator = `@Type(() => ${type})`;
        }

        let propertyOption = JSON.stringify(options);
        if (isFunction(options.type)) {
            if (isNestedType) {
                propertyOption = JSON.stringify({ ...options, type: type }).replaceAll(
                    `"type":"${type}"`,
                    `"type": () => ${type}`
                );
            } else {
                propertyOption = JSON.stringify({ ...options, type: type }).replaceAll(
                    `"type":"${type}"`,
                    `"type":${type}`
                );
            }
        }

        const propertyDecorator = `
            @Property(${propertyOption})
            ${this.config.addAllowDecorator ? `@Allow()` : ''}
            ${type === 'any' ? `@AnyType()` : ''}
        `;
        if (isAnyType) {
            propertyDecorator += `
            @AnyType()
            `;
        }

        return `
        ${propertyDecorator}
        ${typeDecorator}
        ${propertyName}
        `;
    }
}
