/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { RESPONSE_METADATA_KEY } from '@hodfords/nestjs-response';
import { isFunction, isUndefined } from '@nestjs/common/utils/shared.utils';
import * as fs from 'fs-extra';
import path from 'path';
import { extractProperties } from '../helpers/property.helper';
import { microserviceStorage } from '../storages/microservice.storage';
import { HbsGeneratorService } from './hbs-generator.service';
import { PropertyOptionType } from 'lib/types/property-option.type';
import { isNil } from 'lodash';
import { isPrimitiveType } from '../helpers/type.helper';
import { GRPC_METHOD_METADATA_KEY, GRPC_PARAM_INDEX_METADATA_KEY } from '../constants/metadata-key.const';

export class GenerateProtoService extends HbsGeneratorService {
    constructor(
        private packageName: string,
        private dirPath: string
    ) {
        super();
    }

    generate(): void {
        let microserviceContent = this.generateMicroservices();
        const modelContent = this.generateModels();

        microserviceContent = this.compileTemplate('proto-service-definition.hbs', {
            packageName: this.packageName,
            microserviceContent,
            modelContent
        })
            .replaceAll('        ', '')
            .trim();
        const microserviceProtoPath = path.join(this.dirPath, 'microservice.proto');
        fs.ensureFileSync(microserviceProtoPath);
        fs.writeFileSync(microserviceProtoPath, microserviceContent);
    }

    generateModels(): string {
        const dtoWithProperties = extractProperties();
        let content = Object.keys(dtoWithProperties).map((name) =>
            this.generateModel({ name } as Function, dtoWithProperties[name])
        );
        content = content.concat(this.generateNativeModelList());
        return content.reverse().join('\n');
    }

    generateModel(dto: Function, properties): string {
        const propertyContent = properties
            .map(
                (property, index) =>
                    `${property.option.isArray ? 'repeated ' : ''}${this.getProtoType(property.option)} ${
                        property.name
                    } = ${index + 1};`
            )
            .join('\n\t');

        return this.compileTemplate('service-interface.hbs', {
            propertyContent,
            name: dto.name
        });
    }

    generateNativeModelList() {
        const nativeTypes = {
            string: String,
            bool: Boolean,
            float: Number
        };

        return Object.keys(nativeTypes).map((key) =>
            this.compileTemplate('proto-native-list.hbs', {
                name: nativeTypes[key].name,
                type: key
            })
        );
    }

    getProtoType(option: PropertyOptionType): string {
        const { type, format } = option;

        if (isFunction(type)) {
            if (type.name === 'type') {
                return (type as any)().name;
            }
            return type.name;
        }

        if (format === 'any') {
            return 'string';
        }

        if (type === 'number' && !isNil(format)) {
            return format;
        }

        if (type === 'boolean') {
            return 'bool';
        }

        return type;
    }

    generateMicroservices(): string {
        const content = [];
        for (const constructor of microserviceStorage) {
            content.push(this.generateMicroservice(constructor));
        }

        return content.join('\n');
    }

    generateMicroservice(constructor: Function): string {
        const propertyKeys = Object.getOwnPropertyNames(constructor.prototype);
        const rpcMethods = propertyKeys
            .map((propertyKey) => this.generateRpcMethod(constructor, propertyKey))
            .filter((method) => method);

        if (!rpcMethods.length) {
            return '';
        }

        return this.compileTemplate('grpc-service-template.hbs', {
            name: constructor.name,
            rpcMethods
        });
    }

    generateRpcMethod(constructor, propertyKey: string): string {
        if (Reflect.hasMetadata(GRPC_METHOD_METADATA_KEY, constructor.prototype, propertyKey)) {
            const params = Reflect.getMetadata('design:paramtypes', constructor.prototype, propertyKey);
            const parameterIndex = Reflect.getMetadata(
                GRPC_PARAM_INDEX_METADATA_KEY,
                constructor.prototype,
                propertyKey
            );
            let parameterName = 'google.protobuf.Empty';
            if (!isUndefined(parameterIndex)) {
                parameterName = params[parameterIndex].name;
            }
            const response = Reflect.getMetadata(RESPONSE_METADATA_KEY, constructor.prototype[propertyKey]);
            let returnType = 'google.protobuf.Empty';
            if (response) {
                if (response.isArray) {
                    returnType = `Proto${response.responseClass.name}List`;
                } else if (isPrimitiveType(response.responseClass)) {
                    returnType = `Native${response.responseClass.name}Value`;
                } else {
                    returnType = response.responseClass.name;
                }
            }
            return `rpc ${propertyKey} (${parameterName}) returns (${returnType}) {}`;
        }
    }
}
