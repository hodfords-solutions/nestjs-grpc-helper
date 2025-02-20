import { ResponseMetadata } from '@hodfords/nestjs-response';
import { HbsGeneratorService } from './hbs-generator.service';

export class MethodTemplateService extends HbsGeneratorService {
    constructor() {
        super();
    }

    templateBody(
        response: ResponseMetadata,
        serviceName: string,
        method: string,
        parameterName: string,
        parameterType: string
    ): string {
        return this.compileTemplate('body-method-template.hbs', {
            response,
            serviceName,
            method,
            parameterName,
            parameterType
        });
    }

    methodTemplate(method: string, params: string, returnType: string, body: string): string {
        return this.compileTemplate('method-template.hbs', { method, params, returnType, body });
    }
}
