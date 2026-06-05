import { NestFactory } from '@nestjs/core';
import { CommandService } from '@hodfords/nestjs-command';
import { AppModule, commandModule } from './app.module';
import { generateProtoService } from '@hodfords/nestjs-grpc-helper';
import path from 'path';

generateProtoService('sdkName', path.join(__dirname, '../../proto'));
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const commandService: CommandService = app.select(commandModule).get(CommandService, { strict: false });
    await commandService.exec();
    await app.close();
}

bootstrap();
