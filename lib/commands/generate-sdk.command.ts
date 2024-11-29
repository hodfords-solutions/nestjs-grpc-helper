import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from 'lib/helpers/generate.helper';

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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const options = require(configFile);
        generateSdk(options);
        this.success(`Create sdk successfully!`);
    }
}
