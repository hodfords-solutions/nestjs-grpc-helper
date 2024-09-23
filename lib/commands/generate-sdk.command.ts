import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import { generateSdk } from '@hodfords/nestjs-grpc-helper';

@Command({
    signature: 'make-sdk <packageName> <dirName>',
    description: 'Make sdk'
})
@Injectable()
export class GenerateSdkCommand extends BaseCommand {
    public handle() {
        const [packageName, dirName] = this.params;
        generateSdk(packageName, dirName);
        this.success(`Create sdk successfully!`);
    }
}
