/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { RESPONSE_METADATA_KEY, ResponseMetadata } from '@hodfords/nestjs-response';
import path from 'path';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { microserviceStorage } from '../storages/microservice.storage';
import { propertyStorage } from '../storages/property.storage';
import {
    DocumentType,
    MethodDocumentType,
    MicroserviceDocumentType,
    ModelDocumentType,
    PropertyDocumentType
} from '../types/document.type';
import { camelCase, cloneDeep, upperFirst } from 'lodash';
import { randomUUID } from 'crypto';
import { getPropertiesOfClass } from '../helpers/property.helper';

export class GenerateDocumentService {
    private document: DocumentType;

    constructor(private packageName: string) {}

    generate() {
        const moduleName = upperFirst(camelCase(this.packageName));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const packageFile = require(path.join(process.cwd(), 'package.json'));
        this.document = {
            title: this.packageName,
            package: this.packageName,
            description: packageFile.description,
            installDescription: `npm install --save ${packageFile.name}:${packageFile.version}`,
            usageDescription: `
                //Import module
                
                ${moduleName}Module.register({
                    timeout: 5000,
                    url: 'localhost:50051'
                })
                
                // Use in service
                export class ExampleService {
                    constructor(private ${camelCase(this.packageName)}Microservice: ${moduleName}Microservice) {
                        
                    }
                    
                    findOne() {
                        return this.${camelCase(this.packageName)}Microservice.findOne({ id: 1 });
                    }
                }
            `.replaceAll('                ', ''),
            microservices: [],
            models: []
        };
        this.document.models = this.generateModels();
        this.document.microservices = this.generateMicroservices();
        return this.document;
    }

    generateModels(): any[] {
        const models: ModelDocumentType[] = cloneDeep(
            Array.from(propertyStorage.keys()).map((dto) => {
                return {
                    classId: 'class#' + randomUUID(),
                    model: dto,
                    name: dto.name,
                    properties: getPropertiesOfClass(dto) as PropertyDocumentType[]
                };
            })
        );

        for (const model of models) {
            for (const property of model.properties) {
                if (isFunction(property.option.type)) {
                    const type =
                        property.option.type.name === 'type' ? (property.option.type as any)() : property.option.type;
                    property.option.typeId = models.find((m) => m.model == type).classId;
                    property.option.type = type.name;
                }
            }
        }

        return models;
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

    generateMicroservices(): MicroserviceDocumentType[] {
        const content: MicroserviceDocumentType[] = [];
        for (const constructor of microserviceStorage) {
            content.push(this.generateMicroservice(constructor));
        }

        return content;
    }

    generateMicroservice(constructor: Function): MicroserviceDocumentType {
        const microserviceDocument: MicroserviceDocumentType = {
            name: constructor.name,
            description: Reflect.getMetadata('grpc:description', constructor.prototype),
            methods: []
        };
        const propertyKeys = Object.getOwnPropertyNames(constructor.prototype);
        microserviceDocument.methods = propertyKeys
            .map((propertyKey) => this.generateRpcMethod(constructor, propertyKey))
            .filter((method) => method);
        return microserviceDocument;
    }

    generateRpcMethod(constructor, propertyKey: string): MethodDocumentType {
        if (Reflect.hasMetadata('grpc:method', constructor.prototype, propertyKey)) {
            const methodDocument: MethodDocumentType = {} as any;
            const params = Reflect.getMetadata('design:paramtypes', constructor.prototype, propertyKey);
            const parameterIndex = Reflect.getMetadata('grpc:parameter-index', constructor.prototype, propertyKey);
            methodDocument.name = propertyKey;
            methodDocument.description = Reflect.getMetadata('grpc:description', constructor.prototype, propertyKey);
            methodDocument.sdkUsage = `const response = await ${camelCase(constructor.name)}.${propertyKey}({});`;

            methodDocument.parameter = this.document.models.find(
                (model) => model.model === params[parameterIndex]
            )?.classId;
            const response: ResponseMetadata = Reflect.getMetadata(
                RESPONSE_METADATA_KEY,
                constructor.prototype[propertyKey]
            );
            if (response) {
                methodDocument.response = this.document.models.find(
                    (model) => model.model === response.responseClass
                ).classId;
                methodDocument.isResponseArray = response.isArray;
            }
            return methodDocument;
        }
    }
}
