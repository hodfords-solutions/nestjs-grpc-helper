import { ResponseMetadata } from '@hodfords/nestjs-response';

export class MockMethodTemplateService {
    templateBody(response: ResponseMetadata, target: any, propertyKey: any): string {
        if (!response) {
            return '';
        }

        const mockResponse = Reflect.getMetadata('mock:response', target, propertyKey);
        if (mockResponse) {
            if (mockResponse.sample) {
                return `return ${JSON.stringify(mockResponse.sample)} as any;`;
            } else if (mockResponse.method) {
                return `return sampleMethod(${JSON.stringify(mockResponse)}) as any;`;
            }
        }

        if (response.isArray) {
            return `return [sample(${response.responseClass.name})] as any;`;
        } else {
            return `return sample(${response.responseClass.name}) as any;`;
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
