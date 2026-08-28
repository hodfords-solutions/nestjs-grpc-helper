import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateProtoService } from '../helpers/generate.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';

@Command({
    signature: 'make:proto [configFile] [outputPath]',
    description: 'Make proto file'
})
@Injectable()
export class GenerateProtoCommand extends BaseCommand {
    public handle() {
        let [configFile] = this.params;
        const [, outputPath] = this.params;
        if (!configFile) {
            configFile = 'sdk-config.json';
        }
        const options: SdkBuildConfigType = JSON.parse(readFileSync(path.resolve(process.cwd(), configFile), 'utf8'));
        generateProtoService(options.name, outputPath || options.output);
        this.success(`Create proto file successfully!`);
    }
}
