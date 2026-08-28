import { ResponseMetadata } from '@hodfords/nestjs-response';
import { HbsGeneratorService } from './hbs-generator.service.js';
import { ParameterOptionType } from '../types/parameter-option.type.js';
import { convertProtoTypeToTypescript } from '../helpers/proto-type.helper.js';

export class MethodTemplateService extends HbsGeneratorService {
    constructor() {
        super();
    }

    templateBody(
        response: ResponseMetadata,
        serviceName: string,
        method: string,
        parameterName: string,
        parameterType: string,
        directParams: ParameterOptionType[],
        isStream = false
    ): string {
        return this.compileTemplate('body-method-template.hbs', {
            response,
            serviceName,
            method,
            parameterName,
            parameterType,
            directParams,
            isStream
        });
    }

    getDirectParams(directParams: ParameterOptionType[]) {
        const newParams = [];
        if (directParams) {
            for (const param of directParams) {
                newParams.push({
                    name: param.name,
                    isArray: param.isArray,
                    required: param.required,
                    type: convertProtoTypeToTypescript(param)
                });
            }
        }
        return newParams;
    }

    methodTemplate(
        method: string,
        params: string,
        returnType: string,
        body: string,
        directParams: ParameterOptionType[],
        isStream = false
    ): string {
        return this.compileTemplate('method-template.hbs', {
            method,
            params,
            returnType,
            body,
            isStream,
            directParams: this.getDirectParams(directParams)
        });
    }
}
