import { camelCase, upperFirst } from 'lodash';

export class MockModuleTemplateService {
    constructor(
        private packageName: string,
        private fileName: string
    ) {}

    template(services: string[]) {
        const moduleName = upperFirst(camelCase(this.packageName));
        const providers = services
            .map(
                (service) => `{
                    provide: ${service},
                    useClass: Mock${service}
                }`
            )
            .join(',');
        const mockServices = services.map((service) => `Mock${service}`);
        const importServices = [...services, ...mockServices].join(',');

        return `
        import { Module, Global } from '@nestjs/common';
        import { ${importServices} } from './services/${this.fileName}.service';

        @Global()
        @Module({
            providers: [
                ${providers}
            ],
            exports: [${services.join(',')}]
        })
        export class Mock${moduleName}Module {
        }
        `;
    }
}
