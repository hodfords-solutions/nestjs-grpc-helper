import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from '../helpers/generate.helper.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SDK_LANGUAGES } from '../types/sdk-build-config.type.js';

@Command({
    signature: 'make-sdk [configFile]',
    description: 'Make sdk',
    options: [{ value: '--lang <language>', description: 'Build a single language: ts, rust or go' }]
})
@Injectable()
export class GenerateSdkCommand extends BaseCommand {
    public handle() {
        let [configFile] = this.params;
        if (!configFile) {
            configFile = 'sdk-config.json';
        }

        const { lang } = this.program.opts();
        if (lang && !SDK_LANGUAGES.includes(lang)) {
            throw new Error(`Unknown --lang "${lang}". Use ts, rust or go.`);
        }

        // The config file belongs to the consumer application, so it must be resolved
        // from the working directory instead of this package's location.
        const configPath = path.isAbsolute(configFile) ? configFile : path.resolve(process.cwd(), configFile);
        const options = JSON.parse(readFileSync(configPath, 'utf8'));
        generateSdk(options, lang ? [lang] : undefined);
        this.success(`Create sdk successfully!`);
    }
}
