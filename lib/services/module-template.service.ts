import { camelCase, upperFirst } from 'lodash';
import { HbsGeneratorService } from './hbs-generator.service';

export class ModuleTemplateService extends HbsGeneratorService {
    constructor(
        private packageName: string,
        private fileName: string
    ) {
        super();
    }

    template(services: string[]) {
        const moduleName = upperFirst(camelCase(this.packageName));
        return this.compileTemplate('module-template.hbs', {
            moduleName,
            services,
            packageName: this.packageName,
            fileName: this.fileName
        });
    }
}
