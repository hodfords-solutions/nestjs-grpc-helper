/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { RESPONSE_METADATA_KEY } from '@hodfords/nestjs-response';
import { isFunction, isUndefined } from '@nestjs/common/utils/shared.utils';
import * as fs from 'fs-extra';
import path from 'path';
import { extractProperties } from '../helpers/property.helper';
import { microserviceStorage } from '../storages/microservice.storage';

export class GenerateProtoService {
    constructor(
        private packageName: string,
        private dirPath: string
    ) {}

    generate(): void {
        let microserviceContent = this.generateMicroservices();
        const modelContent = this.generateModels();
        const headerContent = `
        syntax = "proto3";
        import "google/protobuf/empty.proto";
        package ${this.packageName};
        `;
        microserviceContent = `
            ${headerContent}
            ${microserviceContent}
            ${modelContent}
        `
            .replaceAll('        ', '')
            .trim();
        const microserviceProtoPath = path.join(this.dirPath, 'microservice.proto');
        fs.ensureFileSync(microserviceProtoPath);
        fs.writeFileSync(microserviceProtoPath, microserviceContent);
    }

    generateModels(): string {
        const dtoWithProperties = extractProperties();
        const content = Object.keys(dtoWithProperties).map((name) =>
            this.generateModel({ name } as Function, dtoWithProperties[name])
        );
        return content.reverse().join('\n');
    }

    generateModel(dto: Function, properties): string {
        const propertyContent = properties
            .map(
                (property, index) =>
                    `${property.option.isArray ? 'repeated ' : ''}${this.getProtoType(property.option.type)} ${
                        property.name
                    } = ${index + 1};`
            )
            .join('\n\t');

        return `
                message ${dto.name} {
                    ${propertyContent}
                }
                message Proto${dto.name}List {
                    repeated ${dto.name} items = 1;
                    bool grpcArray = 2;
                }
            `;
    }

    getProtoType(type): string {
        if (isFunction(type)) {
            if (type.name === 'type') {
                return (type as any)().name;
            }
            return type.name;
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

        return `
        service ${constructor.name} {
            ${rpcMethods.join('\n\t')}
        }
        `;
    }

    generateRpcMethod(constructor, propertyKey: string): string {
        if (Reflect.hasMetadata('grpc:method', constructor.prototype, propertyKey)) {
            const params = Reflect.getMetadata('design:paramtypes', constructor.prototype, propertyKey);
            const parameterIndex = Reflect.getMetadata('grpc:parameter-index', constructor.prototype, propertyKey);
            let parameterName = 'google.protobuf.Empty';
            if (!isUndefined(parameterIndex)) {
                parameterName = params[parameterIndex].name;
            }
            const response = Reflect.getMetadata(RESPONSE_METADATA_KEY, constructor.prototype[propertyKey]);
            let returnType = 'google.protobuf.Empty';
            if (response) {
                if (response.isArray) {
                    returnType = `Proto${response.responseClass.name}List`;
                } else {
                    returnType = response.responseClass.name;
                }
            }
            return `rpc ${propertyKey} (${parameterName}) returns (${returnType}) {}`;
        }
    }
}
