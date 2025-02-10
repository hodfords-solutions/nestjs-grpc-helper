/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { ApiPropertyOptions } from '@nestjs/swagger';
import { isEnumProperty } from '../helpers/api-property.helper';
import { PropertyOptionType } from '@hodfords/nestjs-grpc-helper';

export class ServiceTemplateService {
    constructor(private packageName: string) {}

    templateServiceAndModel(serviceContent: string, modelContent: string, enumContent: string): string {
        return `
        import { GrpcHelper } from '../helpers/grpc.helper';
        import { Inject, Injectable } from '@nestjs/common';
        import { ClientGrpc } from '@nestjs/microservices';
        import { MicroserviceModuleOptionType } from '../types/microservice-option.type';
        import { Type } from 'class-transformer';
        import { Property, sample, AnyType } from '@hodfords/nestjs-grpc-helper';
        
        ${enumContent}

        ${modelContent}
        
        ${serviceContent}
        `;
    }

    templateService(serviceName: string, method: string[], isMock: boolean): string {
        if (isMock) {
            return `
        export class Mock${serviceName} {
           ${method.join('\n')}
        }
        `;
        }
        return `
        @Injectable()
        export class ${serviceName} {
             constructor(
                @Inject('${this.packageName}_PACKAGE') private client: ClientGrpc,
                @Inject('${this.packageName}_OPTIONS') private options: MicroserviceModuleOptionType
            ) {}
           ${method.join('\n')}
        }
        `;
    }

    modelTemplate(name: string, properties: string[], parentClass: Function): string {
        let extendClass = '';
        if (parentClass.name) {
            extendClass = `extends ${parentClass.name}`;
        }
        return `
                export class ${name} ${extendClass} {
                    ${properties.join('\n')}
                }
            `;
    }

    enumTemplate(options: ApiPropertyOptions): string {
        const { enum: properties, enumName, type } = options as PropertyOptionType;
        const valueFormatter = (value: any) => (type === 'string' ? `'${value}'` : value);
        return `
                export enum ${enumName} {
                    ${Object.keys(properties)
                        .filter((key) => !parseInt(key))
                        .map((key) => `${key} = ${valueFormatter(properties[key])}`)
                        .join(',\n')}
                }
            `;
    }

    propertyTemplate(property, type: string): string {
        const isPrimitiveType = ['object', 'string', 'number', 'bool', 'boolean', 'any'].includes(type);
        const isEnumType = isEnumProperty(property.option);
        const isNestedType = !isPrimitiveType && !isEnumType;
        let propertyType = '';
        if (isNestedType) {
            propertyType = `ReturnType<() =>  ${type} ${property.option.isArray ? '[]' : ''}>`;
        } else {
            propertyType = `${type} ${property.option.isArray ? '[]' : ''}`;
        }

        const propertyName = `${property.name}${property.option.required === false ? '?' : ''}: ${propertyType}`;
        let typeDecorator = '';
        if (isNestedType) {
            typeDecorator = `@Type(() => ${type})`;
        }

        const options = { ...property.option, isAutoGenerated: true };

        let propertyOption = JSON.stringify(options);
        if (isFunction(property.option.type)) {
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

        let propertyDecorator = `
            @Property(${propertyOption})
        `;
        if (type === 'any') {
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
