import { Metadata } from '@grpc/grpc-js';
import { GrpcOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface';

export type MicroserviceModuleOptionType = {
    timeout: number;
    url: string;
    ssl?: boolean;
    maxReceiveMessageLength?: number;
    shouldLoadEmptyArray?: boolean;
    requestInitializer?: (metadata: Metadata) => void;
    package?: string | string[];
} & Omit<GrpcOptions['options'], 'package'>;

export type MicroserviceClientOptionType = {
    timeout: number;
    requestInitializer?: (metadata: Metadata) => void;
};
