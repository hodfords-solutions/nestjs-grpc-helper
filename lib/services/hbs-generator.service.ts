import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export class HbsGeneratorService {
    compileTemplate(templatePath: string, data: any): string {
        const templateSource = fs.readFileSync(path.resolve(currentDir, `../templates/${templatePath}`), 'utf8');
        const template = Handlebars.compile(templateSource);
        return template(data);
    }
}
