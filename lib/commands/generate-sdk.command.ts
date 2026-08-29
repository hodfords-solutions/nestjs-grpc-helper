import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from '../helpers/generate.helper.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

@Command({
    signature: 'make-sdk [configFile]',
    description: 'Make sdk'
})
@Injectable()
export class GenerateSdkCommand extends BaseCommand {
    public handle() {
        let [configFile] = this.params;
        if (!configFile) {
            configFile = 'sdk-config.json';
        }

        // The config file belongs to the consumer application, so it must be resolved
        // from the working directory instead of this package's location.
        const configPath = path.isAbsolute(configFile) ? configFile : path.resolve(process.cwd(), configFile);
        const options = JSON.parse(readFileSync(configPath, 'utf8'));
        generateSdk(options);
        this.success(`Create sdk successfully!`);
    }
}
