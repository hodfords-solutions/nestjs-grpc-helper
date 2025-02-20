import { camelCase, upperFirst } from 'lodash';
import { HbsGeneratorService } from './hbs-generator.service';

export class MockModuleTemplateService extends HbsGeneratorService {
    constructor(
        private packageName: string,
        private fileName: string
    ) {
        super();
    }

    template(services: string[]) {
        const moduleName = upperFirst(camelCase(this.packageName));
        const providers = this.compileTemplate('mock-providers-template.hbs', { services });
        const mockServices = services.map((service) => `Mock${service}`);
        const importServices = [...services, ...mockServices];

        return this.compileTemplate('mock-module-template.hbs', {
            moduleName,
            providers,
            importServices,
            packageName: this.packageName,
            services,
            fileName: this.fileName
        });
    }
}
