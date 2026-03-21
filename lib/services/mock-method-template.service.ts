import { ResponseMetadata } from '@hodfords/nestjs-response';
import { ParameterOptionType } from '../types/parameter-option.type';
import { MethodTemplateService } from './method-template.service';

export class MockMethodTemplateService extends MethodTemplateService {
    templateBody(response: ResponseMetadata, target: any, propertyKey: any, directParams?: any): string {
        if (!response) {
            return '';
        }

        const mockResponse = Reflect.getMetadata('mock:response', target, propertyKey);
        if (mockResponse) {
            if (mockResponse.callback) {
                const paramArg =
                    directParams && directParams.length ? `{ ${directParams.map((p) => p.name).join(', ')} }` : 'param';
                return `return (${mockResponse.callback.toString()})(${paramArg}, sample, ${response.responseClass.name}) as any;`;
            } else if (mockResponse.sample) {
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

    methodTemplate(
        method: string,
        params: string,
        returnType: string,
        body: string,
        directParams: ParameterOptionType[]
    ): string {
        return this.compileTemplate('mock-method-template.hbs', {
            method,
            params,
            returnType,
            body,
            directParams: this.getDirectParams(directParams)
        });
    }
}
