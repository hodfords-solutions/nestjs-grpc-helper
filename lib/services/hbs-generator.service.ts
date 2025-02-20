import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export class HbsGeneratorService {
    compileTemplate(templatePath: string, data: any): string {
        const templateSource = fs.readFileSync(path.resolve(__dirname, `../templates/${templatePath}`), 'utf8');
        const template = Handlebars.compile(templateSource);
        return template(data);
    }
}
