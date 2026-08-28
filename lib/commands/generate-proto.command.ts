import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateProtoService } from '../helpers/generate.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

        const options: SdkBuildConfigType = require(configFile);
        generateProtoService(options.name, outputPath || options.output);
        this.success(`Create proto file successfully!`);
    }
}
