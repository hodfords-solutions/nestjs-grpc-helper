import { ResponseMetadata } from '@hodfords/nestjs-response';

export class MockMethodTemplateService {
    templateBody(response: ResponseMetadata, target: any, propertyKey: any, isStream = false): string {
        if (!response) {
            return '';
        }

        const expression = this.sampleExpression(response, target, propertyKey);
        const value = isStream ? `of(${expression})` : expression;
        return `return ${value} as any;`;
    }

    private sampleExpression(response: ResponseMetadata, target: any, propertyKey: any): string {
        const mockResponse = Reflect.getMetadata('mock:response', target, propertyKey);
        if (mockResponse) {
            if (mockResponse.sample) {
                return JSON.stringify(mockResponse.sample);
            } else if (mockResponse.method) {
                return `sampleMethod(${JSON.stringify(mockResponse)})`;
            }
        }

        if (response.isArray) {
            return `[sample(${response.responseClass.name})]`;
        }
        return `sample(${response.responseClass.name})`;
    }

    methodTemplate(method: string, params: string, returnType: string, body: string, isStream = false): string {
        const signaturePrefix = isStream ? '' : 'async ';
        const returnTypeWrapper = isStream ? `Observable<${returnType}>` : `Promise<${returnType}>`;
        if (params) {
            return `
            ${signaturePrefix}${method}(param: ${params}): ${returnTypeWrapper} {
                ${body}
            }`;
        }
        return `
            ${signaturePrefix}${method}(): ${returnTypeWrapper} {
                ${body}
            }`;
    }
}
