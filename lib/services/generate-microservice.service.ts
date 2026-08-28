/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { extractProperties, generateProtoService } from '../index.js';
import { RESPONSE_METADATA_KEY } from '@hodfords/nestjs-response';
import { Logger } from '@nestjs/common';
import { copyFileSync, rmSync, writeFileSync } from 'fs';
import * as fs from 'fs-extra';
import { kebabCase } from 'es-toolkit';
import * as process from 'node:process';
import path from 'path';
import { isEnumProperty } from '../helpers/api-property.helper.js';
import { getReturnType, resolveMethodParams } from '../helpers/grpc-method.helper.js';
import { convertProtoTypeToTypescript } from '../helpers/proto-type.helper.js';
import { runCommand } from '../helpers/shell.helper.js';
import { microserviceStorage } from '../storages/microservice.storage.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { HbsGeneratorService } from './hbs-generator.service.js';
import { MethodTemplateService } from './method-template.service.js';
import { MockMethodTemplateService } from './mock-method-template.service.js';
import { MockModuleTemplateService } from './mock-module-template.service.js';
import { ModuleTemplateService } from './module-template.service.js';
import { ServiceTemplateService } from './service-template.service.js';
import { GenerateSkillService } from './generate-skill.service.js';
import { GRPC_METHOD_METADATA_KEY, GRPC_STREAM_METADATA_KEY } from '../constants/metadata-key.const.js';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export class GenerateMicroserviceService extends HbsGeneratorService {
    private serviceTemplateService: ServiceTemplateService;
    private moduleTemplateService: ModuleTemplateService;
    private mockModuleTemplateService: MockModuleTemplateService;
    private fileName = '';
    private logger = new Logger(this.constructor.name);

    constructor(private config: SdkBuildConfigType) {
        super();
        this.fileName = kebabCase(this.config.name).toLowerCase();
        this.serviceTemplateService = new ServiceTemplateService(this.config);
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
        const serviceContent = this.generateServices();
        this.generateModule();
        const modelContent = this.generateModels();
        const enumContent = this.generateEnums();
        const content = this.serviceTemplateService.templateServiceAndModel(serviceContent, modelContent, enumContent);
        this.writeFile(content, `services/${this.fileName}.service.ts`);
        this.copySdk();
        this.generatePackageFile();
        new GenerateSkillService(this.config).generate();
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

        let dirPath = currentDir;
        if (fs.existsSync(path.join(currentDir, '../../sdk-stub/helpers/grpc.helper.ts'))) {
            dirPath = path.join(currentDir, '../../sdk-stub');
        } else {
            dirPath = path.join(currentDir, '../sdk-stub');
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
        const sdkPackageFile = this.getPackageJsonContent();
        this.writeFile(JSON.stringify(sdkPackageFile), `package.json`);
    }

    getPackageJsonContent() {
        const packageFile = require(path.join(process.cwd(), 'package.json'));

        const peerDependencies = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@nestjs/common': '*',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@nestjs/microservices': '*',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@grpc/grpc-js': '*',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'class-transformer': '*',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@hodfords/nestjs-cls-translation': '*'
        };

        if (this.config.addAllowDecorator) {
            peerDependencies['class-validator'] = '*';
        }

        return {
            name: this.config.packageName || packageFile.name,
            version: packageFile.version,
            publishConfig: packageFile.publishConfig,
            license: packageFile.license,
            repository: packageFile.repository,
            scripts: this.config.build ? {} : { build: 'tsc' },
            peerDependencies: peerDependencies
        };
    }

    generateIndex() {
        const indexContent = this.compileTemplate('./index-template.hbs', {
            fileName: this.fileName
        });
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

    generateModels() {
        const dtoWithProperties = extractProperties({ includeSdkExposed: true });
        const contents = Object.keys(dtoWithProperties).map((name) =>
            this.generateModel({ name } as Function, dtoWithProperties[name])
        );
        return contents;
    }

    generateModel(dto: Function, properties) {
        const propertyContents = properties.map((property) => {
            const type = convertProtoTypeToTypescript(property.option, true);
            return this.serviceTemplateService.propertyTemplate(property, type);
        });
        const parentClass = Object.getPrototypeOf(dto);
        return this.serviceTemplateService.modelTemplate(dto.name, propertyContents, parentClass);
    }

    generateEnums() {
        const dtoWithProperties = extractProperties({ includeSdkExposed: true });
        const properties = Object.values(dtoWithProperties).flat();
        const generatedEnumAuditor = new Set<string>();
        const contents = [];

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

        return contents;
    }

    generateServices() {
        const content = [];
        for (const constructor of microserviceStorage) {
            content.push(this.generateService(constructor, false));
            content.push(this.generateService(constructor, true));
        }

        return content;
    }

    generateService(constructor: Function, isMock: boolean) {
        const propertyKeys = Object.getOwnPropertyNames(constructor.prototype);
        const methods = propertyKeys
            .map((propertyKey) => this.generateRpcMethod(constructor, propertyKey, isMock))
            .filter((method) => method);
        return { serviceName: constructor.name, methods, isMock };
    }

    generateRpcMethod(constructor, propertyKey: string, isMock: boolean): string {
        if (!Reflect.hasMetadata(GRPC_METHOD_METADATA_KEY, constructor.prototype, propertyKey)) {
            return;
        }

        const { parameterName, directParams } = resolveMethodParams(constructor, propertyKey);
        const response = Reflect.getMetadata(RESPONSE_METADATA_KEY, constructor.prototype[propertyKey]);
        const isStream = Boolean(Reflect.getMetadata(GRPC_STREAM_METADATA_KEY, constructor.prototype, propertyKey));
        const methodTemplateService = isMock ? new MockMethodTemplateService() : new MethodTemplateService();
        const body =
            methodTemplateService instanceof MockMethodTemplateService
                ? methodTemplateService.templateBody(response, constructor, propertyKey, directParams, isStream)
                : methodTemplateService.templateBody(
                      response,
                      constructor.name,
                      propertyKey,
                      parameterName,
                      parameterName,
                      directParams,
                      isStream
                  );
        const returnType = getReturnType(response);
        return methodTemplateService.methodTemplate(
            propertyKey,
            parameterName,
            returnType,
            body,
            directParams,
            isStream
        );
    }

    formatCode() {
        const formatter = this.config.formatter ?? 'prettier';
        this.logger.log(`Start formatting code with ${formatter}`);
        const command =
            formatter === 'oxfmt'
                ? `oxfmt ${this.config.output}`
                : `prettier --write ${this.config.output}/**/*.ts ${this.config.output}/*.ts ${this.config.output}/*.json`;
        const response = runCommand(command);
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

        copyFileSync(
            path.join(process.cwd(), this.config.output, 'microservice.proto'),
            path.join(process.cwd(), this.config.outputBuild, 'microservice.proto')
        );

        const skillMdPath = path.join(process.cwd(), this.config.output, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
            copyFileSync(skillMdPath, path.join(process.cwd(), this.config.outputBuild, 'SKILL.md'));
        }

        const skillConfigPath = path.join(process.cwd(), this.config.output, 'skill.json');
        if (fs.existsSync(skillConfigPath)) {
            copyFileSync(skillConfigPath, path.join(process.cwd(), this.config.outputBuild, 'skill.json'));
        }

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
