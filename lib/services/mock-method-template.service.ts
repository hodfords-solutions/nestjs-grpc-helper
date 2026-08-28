import { ResponseMetadata } from '@hodfords/nestjs-response';
import { ParameterOptionType } from '../types/parameter-option.type.js';
import { MethodTemplateService } from './method-template.service.js';

export class MockMethodTemplateService extends MethodTemplateService {
    templateBody(
        response: ResponseMetadata,
        target: any,
        propertyKey: any,
        directParams?: any,
        isStream: any = false
    ): string {
        if (!response) {
            return '';
        }

        const expression = this.sampleExpression(response, target, propertyKey, directParams);
        const value = isStream ? `of(${expression})` : expression;
        return `return ${value} as any;`;
    }

    private sampleExpression(response: ResponseMetadata, target: any, propertyKey: any, directParams?: any): string {
        const mockResponse = Reflect.getMetadata('mock:response', target, propertyKey);
        if (mockResponse) {
            if (mockResponse.callback) {
                const paramArg =
                    directParams && directParams.length ? `{ ${directParams.map((p) => p.name).join(', ')} }` : 'param';
                return `(${mockResponse.callback.toString()})(${paramArg}, sample, ${response.responseClass.name})`;
            } else if (mockResponse.sample) {
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

    methodTemplate(
        method: string,
        params: string,
        returnType: string,
        body: string,
        directParams: ParameterOptionType[],
        isStream = false
    ): string {
        return this.compileTemplate('mock-method-template.hbs', {
            method,
            params,
            returnType,
            body,
            isStream,
            directParams: this.getDirectParams(directParams)
        });
    }
}
