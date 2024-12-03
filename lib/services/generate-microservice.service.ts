/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-require-imports */
import { extractProperties, generateProtoService } from '@hodfords/nestjs-grpc-helper';
import { RESPONSE_METADATA_KEY, ResponseMetadata } from '@hodfords/nestjs-response';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { copyFileSync, rmSync, writeFileSync } from 'fs';
import * as fs from 'fs-extra';
import { kebabCase } from 'lodash';
import path from 'path';
import { convertProtoTypeToTypescript } from '../helpers/proto-type.helper';
import { microserviceStorage } from '../storages/microservice.storage';
import { MethodTemplateService } from './method-template.service';
import { MockMethodTemplateService } from './mock-method-template.service';
import { MockModuleTemplateService } from './mock-module-template.service';
import { ModuleTemplateService } from './module-template.service';
import { ServiceTemplateService } from './service-template.service';
import { isEnumProperty } from '../helpers/api-property.helper';
import { SdkBuildConfigType } from '../types/sdk-build-config.type';
import { runCommand } from '../helpers/shell.helper';
import * as process from 'node:process';
import { Logger } from '@nestjs/common';

export class GenerateMicroserviceService {
    private serviceTemplateService: ServiceTemplateService;
    private moduleTemplateService: ModuleTemplateService;
    private mockModuleTemplateService: MockModuleTemplateService;
    private fileName = '';
    private logger = new Logger(this.constructor.name);

    constructor(private config: SdkBuildConfigType) {
        this.fileName = kebabCase(this.config.name).toLowerCase();
        this.serviceTemplateService = new ServiceTemplateService(this.config.name);
        this.moduleTemplateService = new ModuleTemplateService(this.config.name, this.fileName);
        this.mockModuleTemplateService = new MockModuleTemplateService(this.config.name, this.fileName);
        this.config = {
            build: false,
            format: false,
            ...config
        };
    }

    generate(): void {
        generateProtoService(this.config.name, this.config.output);
        this.generateIndex();
        let serviceContent = this.generateServices();
        this.generateModule();
        const modelContent = this.generateModels();
        const enumContent = this.generateEnums();
        serviceContent = this.serviceTemplateService.templateServiceAndModel(serviceContent, modelContent, enumContent);
        this.writeFile(serviceContent, `services/${this.fileName}.service.ts`);
        this.copySdk();
        this.generatePackageFile();
        if (this.config.format) {
            this.formatCode();
        }
        if (this.config.build) {
            this.buildCode();
        }
    }

    copySdk(): void {
        fs.ensureDirSync(path.join(this.config.output, 'helpers'));
        fs.ensureDirSync(path.join(this.config.output, 'types'));
        fs.ensureDirSync(path.join(this.config.output, 'constants'));

        let dirPath = __dirname;
        if (fs.existsSync(path.join(__dirname, '../../sdk-stub/helpers/grpc.helper.ts'))) {
            dirPath = path.join(__dirname, '../../sdk-stub');
        } else {
            dirPath = path.join(__dirname, '../sdk-stub');
        }
        if (!fs.existsSync(path.join(this.config.output, 'helpers/grpc.helper.ts'))) {
            copyFileSync(
                path.join(dirPath, 'helpers/grpc.helper.ts'),
                path.join(this.config.output, 'helpers/grpc.helper.ts')
            );
        }

        copyFileSync(
            path.join(dirPath, 'types/microservice-option.type.ts'),
            path.join(this.config.output, 'types/microservice-option.type.ts')
        );
    }

    generatePackageFile() {
        const sdkPackageFile = this.getPackageJsonContent(!this.config.build);
        this.writeFile(JSON.stringify(sdkPackageFile), `package.json`);
    }

    getPackageJsonContent(isNeedBuildScript: boolean) {
        const packageFile = require(path.join(process.cwd(), 'package.json'));

        return {
            name: this.config.packageName || packageFile.name,
            version: packageFile.version,
            publishConfig: packageFile.publishConfig,
            license: packageFile.license,
            repository: packageFile.repository,
            scripts: isNeedBuildScript ? { build: 'tsc' } : {},
            peerDependencies: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '@nestjs/common': '*',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '@nestjs/microservices': '*',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                '@grpc/grpc-js': '*'
            }
        };
    }

    generateIndex() {
        const indexContent = `
        export * from './helpers/grpc.helper'
        export * from './${this.fileName}.module'
        export * from './${this.fileName}.mock.module'
        export * from './services/${this.fileName}.service';
        export * from './types/microservice-option.type';
        `;
        this.writeFile(indexContent, `index.ts`);
    }

    writeFile(content: string, filePath: string): void {
        const microserviceProtoPath = path.join(this.config.output, filePath);
        fs.ensureFileSync(microserviceProtoPath);
        fs.writeFileSync(microserviceProtoPath, content);
    }

    generateModule(): void {
        const services = [];
        for (const constructor of microserviceStorage) {
            services.push(constructor.name);
        }
        this.writeFile(this.moduleTemplateService.template(services), `${this.fileName}.module.ts`);
        this.writeFile(this.mockModuleTemplateService.template(services), `${this.fileName}.mock.module.ts`);
    }

    generateModels(): string {
        const dtoWithProperties = extractProperties();
        const content = Object.keys(dtoWithProperties).map((name) =>
            this.generateModel({ name } as Function, dtoWithProperties[name])
        );
        return content.reverse().join('\n');
    }

    generateModel(dto: Function, properties): string {
        const propertyContents = properties.map((property) => {
            const type = convertProtoTypeToTypescript(property.option, true);
            return this.serviceTemplateService.propertyTemplate(property, type);
        });
        const parentClass = Object.getPrototypeOf(dto);
        return this.serviceTemplateService.modelTemplate(dto.name, propertyContents, parentClass);
    }

    generateEnums(): string {
        const dtoWithProperties = extractProperties();
        const properties = Object.values(dtoWithProperties).flat();
        const generatedEnumAuditor = new Set<string>();
        const contents: string[] = [];

        for (const { option } of properties) {
            if (!isEnumProperty(option)) {
                continue;
            }

            const isEnumGenerated = generatedEnumAuditor.has(option.enumName);
            if (isEnumGenerated) {
                continue;
            }

            const content = this.serviceTemplateService.enumTemplate(option);
            contents.push(content);
            generatedEnumAuditor.add(option.enumName);
        }

        return contents.join('\n');
    }

    generateServices(): string {
        const content = [];
        for (const constructor of microserviceStorage) {
            content.push(this.generateService(constructor, false));
            content.push(this.generateService(constructor, true));
        }

        return content.join('\n');
    }

    generateService(constructor: Function, isMock: boolean): string {
        const propertyKeys = Object.getOwnPropertyNames(constructor.prototype);
        const methods = propertyKeys
            .map((propertyKey) => this.generateRpcMethod(constructor, propertyKey, isMock))
            .filter((method) => method);
        return this.serviceTemplateService.templateService(constructor.name, methods, isMock);
    }

    generateRpcMethod(constructor, propertyKey: string, isMock: boolean): string {
        if (!Reflect.hasMetadata('grpc:method', constructor.prototype, propertyKey)) {
            return;
        }

        const params = Reflect.getMetadata('design:paramtypes', constructor.prototype, propertyKey);
        const parameterIndex = Reflect.getMetadata('grpc:parameter-index', constructor.prototype, propertyKey);
        let parameterName;
        if (!isUndefined(parameterIndex)) {
            parameterName = params[parameterIndex].name;
        }
        const response = Reflect.getMetadata(RESPONSE_METADATA_KEY, constructor.prototype[propertyKey]);
        const methodTemplateService = isMock ? new MockMethodTemplateService() : new MethodTemplateService();
        const body =
            methodTemplateService instanceof MockMethodTemplateService
                ? methodTemplateService.templateBody(response)
                : methodTemplateService.templateBody(
                      response,
                      constructor.name,
                      propertyKey,
                      parameterName,
                      parameterName
                  );
        const returnType = this.getReturnType(response);
        return methodTemplateService.methodTemplate(propertyKey, parameterName, returnType, body);
    }

    getReturnType(response: ResponseMetadata): string {
        if (response) {
            if (response.isArray) {
                return `${response.responseClass.name}[]`;
            } else {
                return response.responseClass.name;
            }
        }

        return 'void';
    }

    formatCode() {
        this.logger.log('Start formatting code');
        const response = runCommand(
            `prettier --write ${this.config.output}/**/*.ts ${this.config.output}/*.ts ${this.config.output}/*.json`
        );
        if (response.stderr) {
            this.logger.error(response.stderr);
        } else {
            this.logger.log('Format code successfully');
        }
    }

    buildCode() {
        this.logger.log('Start building code');

        rmSync(path.join(process.cwd(), this.config.outputBuild), { recursive: true, force: true });

        let tsConfigName = 'tsconfig.json';
        if (this.config.tsconfig) {
            tsConfigName = 'tsconfig-sdk.json';
            const tsconfigPath = path.join(process.cwd(), 'tsconfig-sdk.json');
            writeFileSync(tsconfigPath, JSON.stringify(this.config.tsconfig));
        }
        const response = runCommand(`tsc -p ${tsConfigName}`);

        copyFileSync(
            path.join(process.cwd(), this.config.output, 'package.json'),
            path.join(process.cwd(), this.config.outputBuild, 'package.json')
        );

        if (this.config.tsconfig) {
            fs.unlinkSync(path.join(process.cwd(), tsConfigName));
        }

        if (this.config.removeOutput) {
            rmSync(path.join(process.cwd(), this.config.output), { recursive: true });
        }

        if (response.stderr) {
            this.logger.error(response.stderr);
        } else {
            this.logger.log('Build code successfully');
        }
    }
}
