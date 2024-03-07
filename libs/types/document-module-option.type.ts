import { ClientProvider } from '@nestjs/microservices/module/interfaces/clients-module.interface';

export type DocumentModuleOptionType = {
    isEnable: boolean;
    packageName: string;
    clientOptions: ClientProvider;
    waitingTime?: number;
    prefix?: string;
};
