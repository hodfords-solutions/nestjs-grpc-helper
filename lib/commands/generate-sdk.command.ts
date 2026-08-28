import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateSdk } from '../helpers/generate.helper.js';

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
        const options = JSON.parse(readFileSync(path.resolve(process.cwd(), configFile), 'utf8'));
        generateSdk(options);
        this.success(`Create sdk successfully!`);
    }
}
