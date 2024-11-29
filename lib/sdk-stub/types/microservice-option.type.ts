import { Metadata } from '@grpc/grpc-js';

export type MicroserviceModuleOptionType = {
    timeout: number;
    url: string;
    ssl?: boolean;
    maxReceiveMessageLength?: number;
    shouldLoadEmptyArray?: boolean;
    enableLanguageMetaData?: boolean;
    requestInitializer?: (metadata: Metadata) => void;
};

export type MicroserviceClientOptionType = {
    timeout: number;
    enableLanguageMetaData?: boolean;
    requestInitializer?: (metadata: Metadata) => void;
};
