import { NestFactory } from '@nestjs/core';
import { CommandService } from '@hodfords/nestjs-command';
import { AppModule, commandModule } from './app.module.js';
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';
import path from 'path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

generateProtoService('sdkName', path.join(currentDir, '../../proto'));
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const commandService: CommandService = app.select(commandModule).get(CommandService, { strict: false });
    await commandService.exec();
    await app.close();
}

bootstrap();
