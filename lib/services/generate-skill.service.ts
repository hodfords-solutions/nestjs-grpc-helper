/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-require-imports */
import { extractProperties } from '@hodfords/nestjs-grpc-helper';
import { RESPONSE_METADATA_KEY } from '@hodfords/nestjs-response';
import * as fs from 'fs-extra';
import { camelCase, upperFirst } from 'lodash';
import * as process from 'node:process';
import path from 'path';
import { isEnumProperty } from '../helpers/api-property.helper';
import { getReturnType, resolveMethodParams } from '../helpers/grpc-method.helper';
import { convertProtoTypeToTypescript } from '../helpers/proto-type.helper';
import { microserviceStorage } from '../storages/microservice.storage';
import { PropertyType } from '../types/property-option.type';
import { SdkBuildConfigType } from '../types/sdk-build-config.type';
import { HbsGeneratorService } from './hbs-generator.service';
import { GRPC_DESCRIPTION_METADATA_KEY, GRPC_METHOD_METADATA_KEY } from '../constants/metadata-key.const';

export class GenerateSkillService extends HbsGeneratorService {
    constructor(private config: SdkBuildConfigType) {
        super();
    }

    generate(): void {
        const packageFile = require(path.join(process.cwd(), 'package.json'));
        const moduleName = upperFirst(camelCase(this.config.name));
        const packageName = this.config.packageName || packageFile.name;

        const data = {
            title: this.config.name,
            description: packageFile.description || '',
            packageName,
            moduleName,
            services: this.collectServices(),
            models: this.collectModels(),
            enums: this.collectEnums()
        };

        const content = this.compileTemplate('./skill-template.hbs', data);
        const filePath = path.join(this.config.output, 'SKILL.md');
        fs.ensureFileSync(filePath);
        fs.writeFileSync(filePath, content);
    }

    private collectServices() {
        const services = [];
        for (const constructor of microserviceStorage) {
            const description = Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, constructor.prototype);
            const propertyKeys = Object.getOwnPropertyNames(constructor.prototype);
            const methods = propertyKeys
                .map((propertyKey) => this.collectMethod(constructor, propertyKey))
                .filter((method) => method);

            services.push({
                name: constructor.name,
                description,
                methods
            });
        }
        return services;
    }

    private collectMethod(constructor: Function, propertyKey: string) {
        if (!Reflect.hasMetadata(GRPC_METHOD_METADATA_KEY, constructor.prototype, propertyKey)) {
            return;
        }

        const description = Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, constructor.prototype, propertyKey);
        const { parameterName, directParams } = resolveMethodParams(constructor, propertyKey);

        const response = Reflect.getMetadata(RESPONSE_METADATA_KEY, constructor.prototype[propertyKey]);
        const responseType = response ? getReturnType(response) : undefined;

        const serviceName = camelCase(constructor.name);
        let requestType: string = parameterName;
        let args: string;

        let parameters = [];
        if (directParams && directParams.length) {
            parameters = directParams.map((p) => ({
                name: p.name,
                type: convertProtoTypeToTypescript(p, true),
                isArray: p.isArray,
                required: p.required !== false
            }));
            args = directParams.map((p) => p.name).join(', ');
            requestType = undefined;
        } else if (requestType) {
            args = `{ /* ${requestType} */ }`;
        } else {
            args = '';
        }
        const usage = `const response = await ${serviceName}.${propertyKey}(${args});`;

        return {
            name: propertyKey,
            description,
            requestType,
            responseType,
            parameters,
            usage
        };
    }

    private collectModels() {
        const dtoWithProperties = extractProperties();
        return Object.keys(dtoWithProperties).map((name) => {
            const properties = (dtoWithProperties[name] as PropertyType[]).map((property) => {
                const type = convertProtoTypeToTypescript(property.option, true);
                const isArray = property.option.isArray;
                return {
                    name: property.name,
                    type: isArray ? `${type}[]` : type,
                    required: property.option.required !== false,
                    description: property.option.description || ''
                };
            });
            return { name, properties };
        });
    }

    private collectEnums() {
        const dtoWithProperties = extractProperties();
        const properties = Object.values(dtoWithProperties).flat();
        const generatedEnumAuditor = new Set<string>();
        const enums = [];

        for (const { option } of properties) {
            if (!isEnumProperty(option)) {
                continue;
            }
            if (generatedEnumAuditor.has(option.enumName)) {
                continue;
            }
            enums.push({
                name: option.enumName,
                values: Object.values(option.enum)
            });
            generatedEnumAuditor.add(option.enumName);
        }

        return enums;
    }
}
