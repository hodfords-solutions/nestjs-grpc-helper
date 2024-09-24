import { ResponseMetadata } from '@hodfords/nestjs-response';

export class MockMethodTemplateService {
    templateBody(response: ResponseMetadata): string {
        if (response) {
            if (response.isArray) {
                return `return [sample(${response.responseClass.name})];`;
            } else {
                return `return sample(${response.responseClass.name});`;
            }
        } else {
            return ``;
        }
    }

    methodTemplate(method: string, params: string, returnType: string, body: string): string {
        if (params) {
            return `
            async ${method}(param: ${params}): Promise<${returnType}> {
                ${body}
            }`;
        }
        return `
            async ${method}(): Promise<${returnType}> {
                ${body}
            }`;
    }
}
