import { Metadata } from '@grpc/grpc-js';

export type MicroserviceModuleOptionType = {
    timeout: number;
    url: string;
    ssl?: boolean;
    maxReceiveMessageLength?: number;
    shouldLoadEmptyArray?: boolean;
    requestInitializer?: (metadata: Metadata) => void;
};

export type MicroserviceClientOptionType = {
    timeout: number;
    requestInitializer?: (metadata: Metadata) => void;
};
