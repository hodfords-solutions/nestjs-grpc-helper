import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export class HbsGeneratorService {
    constructor() {
        Handlebars.registerHelper('hasItems', function (items: any[], options) {
            console.log(items);
            if (items && items.length > 0) {
                return options.fn(this);
            } else {
                return options.inverse(this);
            }
        });
    }

    compileTemplate(templatePath: string, data: any): string {
        const templateSource = fs.readFileSync(path.resolve(__dirname, `../templates/${templatePath}`), 'utf8');
        const template = Handlebars.compile(templateSource);
        return template(data);
    }
}
