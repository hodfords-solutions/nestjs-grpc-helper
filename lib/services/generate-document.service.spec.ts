/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
// Register the Native*Value response classes exactly like importing the library index does in production
import '../responses/native.response';
import { ResponseModel } from '@hodfords/nestjs-response';
import path from 'path';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator';
import { Property } from '../decorators/property.decorator';
import { propertyStorage } from '../storages/property.storage';
import { DocumentType } from '../types/document.type';
import { GenerateDocumentService } from './generate-document.service';

class DocNestedResponse {
    @Property({ type: String })
    street: string;
}

class DocUserResponse {
    @Property({ type: String, description: 'User name' })
    name: string;

    @Property({ type: DocNestedResponse, required: false })
    nested?: DocNestedResponse;

    @Property({ type: () => DocUserResponse, required: false })
    manager?: DocUserResponse;
}

class DocParamDto {
    @Property({ type: String, description: 'Keyword to search' })
    keyword: string;
}

@RegisterGrpcMicroservice('Document fixture microservice')
export class DocFixtureMicroservice {
    @GrpcAction('Find one user')
    @ResponseModel(DocUserResponse)
    findOne(@GrpcValue() param: DocParamDto): DocUserResponse {
        return param as any;
    }

    @GrpcAction('Find many users')
    @ResponseModel(DocUserResponse, true)
    findMany(@GrpcValue() param: DocParamDto): DocUserResponse[] {
        return [param] as any;
    }

    @GrpcAction('Count users')
    @ResponseModel(Number)
    countUsers(@GrpcValue() param: DocParamDto): any {
        return param ? 1 : 0;
    }

    @GrpcAction('Trigger an action without response')
    noopAction(): void {}

    notAnAction(): void {}
}

describe('GenerateDocumentService', () => {
    let document: DocumentType;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const packageFile = require(path.join(process.cwd(), 'package.json'));

    beforeAll(() => {
        document = new GenerateDocumentService('docFixturePkg').generate();
    });

    it('should build the document header from the package name and host package.json', () => {
        expect(document.title).toBe('docFixturePkg');
        expect(document.package).toBe('docFixturePkg');
        expect(document.description).toBe(packageFile.description);
        expect(document.installDescription).toBe(`npm install --save ${packageFile.name}:${packageFile.version}`);
    });

    it('should render the usage description from the usage template', () => {
        expect(document.usageDescription).toContain('DocFixturePkgModule.register({');
        expect(document.usageDescription).toContain("url: 'localhost:50051'");
    });

    describe('models', () => {
        it('should include every dto registered in the property storage with unique class ids', () => {
            const names = document.models.map((model) => model.name);
            expect(names).toEqual(expect.arrayContaining(['DocUserResponse', 'DocNestedResponse', 'DocParamDto']));

            const classIds = document.models.map((model) => model.classId);
            expect(new Set(classIds).size).toBe(classIds.length);
            for (const classId of classIds) {
                expect(classId).toMatch(/^class#/);
            }
        });

        it('should document scalar properties with their options', () => {
            const paramModel = document.models.find((model) => model.name === 'DocParamDto');
            expect(paramModel.properties).toEqual([
                { name: 'keyword', option: { type: 'string', description: 'Keyword to search' } }
            ]);
        });

        it('should link nested class properties to the referenced model via typeId', () => {
            const userModel = document.models.find((model) => model.name === 'DocUserResponse');
            const nestedModel = document.models.find((model) => model.name === 'DocNestedResponse');

            const nestedProperty = userModel.properties.find((property) => property.name === 'nested');
            expect(nestedProperty.option.type).toBe('DocNestedResponse');
            expect(nestedProperty.option.typeId).toBe(nestedModel.classId);
        });

        it('should resolve lazy type functions to the referenced model', () => {
            const userModel = document.models.find((model) => model.name === 'DocUserResponse');
            const managerProperty = userModel.properties.find((property) => property.name === 'manager');
            expect(managerProperty.option.type).toBe('DocUserResponse');
            expect(managerProperty.option.typeId).toBe(userModel.classId);
        });

        it('should not mutate the property storage when resolving types', () => {
            const storedProperties = propertyStorage.get(DocUserResponse);
            const nestedProperty = storedProperties.find((property) => property.name === 'nested');
            expect(nestedProperty.option.type).toBe(DocNestedResponse);
            expect((nestedProperty.option as any).typeId).toBeUndefined();
        });
    });

    describe('microservices', () => {
        let microservice;

        beforeAll(() => {
            microservice = document.microservices.find((item) => item.name === 'DocFixtureMicroservice');
        });

        it('should document the microservice with its description', () => {
            expect(microservice).toBeDefined();
            expect(microservice.description).toBe('Document fixture microservice');
        });

        it('should only include methods decorated with @GrpcAction', () => {
            const methodNames = microservice.methods.map((method) => method.name);
            expect(methodNames).toEqual(['findOne', 'findMany', 'countUsers', 'noopAction']);
            expect(methodNames).not.toContain('notAnAction');
        });

        it('should link methods to parameter and response models by classId', () => {
            const findOne = microservice.methods.find((method) => method.name === 'findOne');
            const paramModel = document.models.find((model) => model.name === 'DocParamDto');
            const responseModel = document.models.find((model) => model.name === 'DocUserResponse');

            expect(findOne.description).toBe('Find one user');
            expect(findOne.parameter).toBe(paramModel.classId);
            expect(findOne.response).toBe(responseModel.classId);
            expect(findOne.isResponseArray).toBe(false);
            expect(findOne.sdkUsage).toBe('const response = await docFixtureMicroservice.findOne({});');
        });

        it('should mark array responses', () => {
            const findMany = microservice.methods.find((method) => method.name === 'findMany');
            expect(findMany.isResponseArray).toBe(true);
        });

        it('should mark primitive responses as native', () => {
            const countUsers = microservice.methods.find((method) => method.name === 'countUsers');
            expect(countUsers.response).toBe('Number');
            expect(countUsers.isResponseNative).toBe(true);
        });

        it('should leave parameter and response empty for methods without them', () => {
            const noopAction = microservice.methods.find((method) => method.name === 'noopAction');
            expect(noopAction.parameter).toBeUndefined();
            expect(noopAction.response).toBeUndefined();
        });
    });
});
