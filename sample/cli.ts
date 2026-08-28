import { NestFactory } from '@nestjs/core';
import { CommandService, CommandModule } from '@hodfords/nestjs-command';
import { AppModule } from './app.module.js';
import { generateProtoService } from '../lib/index.js';
import path from 'path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

generateProtoService('HERO', path.join(currentDir, '../../proto'));
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const commandService: CommandService = app.select(CommandModule).get(CommandService, { strict: false });
    await commandService.exec();
    await app.close();
}

bootstrap();
