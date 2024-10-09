import { ResponseMetadata } from '@hodfords/nestjs-response';

export class MethodTemplateService {
    templateBody(
        response: ResponseMetadata,
        serviceName: string,
        method: string,
        parameterName: string,
        parameterType: string
    ): string {
        if (response) {
            if (response.isArray) {
                return `
                    return await GrpcHelper.with(this.client, ${response.responseClass.name}, this.options)
                        .service('${serviceName}')
                        .method('${method}')
                        .data(${parameterName ? 'param' : '{}'}${parameterType ? ', ' + parameterType : ''})
                        .getMany();
                    `;
            } else {
                return `
                    return await GrpcHelper.with(this.client, ${response.responseClass.name}, this.options)
                        .service('${serviceName}')
                        .method('${method}')
                        .data(${parameterName ? 'param' : '{}'}${parameterType ? ', ' + parameterType : ''})
                        .getOne();
                    `;
            }
        } else {
            return `
            await GrpcHelper.with(this.client, null as any, this.options)
                        .service('${serviceName}')
                        .method('${method}')
                        .data(${parameterName ? 'param' : '{}'}${parameterType ? ', ' + parameterType : ''})
                        .getMany();
            `;
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
