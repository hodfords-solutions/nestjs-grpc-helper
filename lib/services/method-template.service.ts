import { ResponseMetadata } from '@hodfords/nestjs-response';
import { HbsGeneratorService } from './hbs-generator.service';
import { ParameterOptionType } from '../types/parameter-option.type';
import { convertProtoTypeToTypescript } from '../helpers/proto-type.helper';

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
        directParams: ParameterOptionType[]
    ): string {
        return this.compileTemplate('body-method-template.hbs', {
            response,
            serviceName,
            method,
            parameterName,
            parameterType,
            directParams
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
        directParams: ParameterOptionType[]
    ): string {
        return this.compileTemplate('method-template.hbs', {
            method,
            params,
            returnType,
            body,
            directParams: this.getDirectParams(directParams)
        });
    }
}
