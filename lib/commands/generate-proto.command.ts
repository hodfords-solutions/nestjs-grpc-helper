import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateProtoService } from 'lib/helpers/generate.helper';
import { SdkBuildConfigType } from 'lib/types/sdk-build-config.type';

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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const options: SdkBuildConfigType = require(configFile);
        generateProtoService(options.name, outputPath || options.output);
        this.success(`Create proto file successfully!`);
    }
}
