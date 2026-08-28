import { ClientProvider } from '@nestjs/microservices/module/interfaces/clients-module.interface.js';

export type DocumentModuleOptionType = {
    isEnable: boolean;
    packageName: string;
    clientOptions: ClientProvider;
    waitingTime?: number;
    prefix?: string;
};
