import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from '../helpers/generate.helper.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

        const options = require(configFile);
        generateSdk(options);
        this.success(`Create sdk successfully!`);
    }
}
