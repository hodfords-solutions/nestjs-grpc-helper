import { NestFactory } from '@nestjs/core';
import { CommandService, CommandModule } from '@hodfords/nestjs-command';
import { AppModule } from './app.module';
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';
import path from 'path';

generateProtoService('HERO', path.join(__dirname, '../../proto'));
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const commandService: CommandService = app.select(CommandModule).get(CommandService, { strict: false });
    await commandService.exec();
    await app.close();
}

bootstrap();
