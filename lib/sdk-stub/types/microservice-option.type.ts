import { Metadata } from '@grpc/grpc-js';
import { GrpcOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface';

export type MicroserviceModuleOptionType = {
    timeout: number;
    url: string;
    ssl?: boolean;
    maxReceiveMessageLength?: number;
    shouldLoadEmptyArray?: boolean;
    requestInitializer?: (metadata: Metadata) => void;
} & GrpcOptions['options'];

export type MicroserviceClientOptionType = {
    timeout: number;
    requestInitializer?: (metadata: Metadata) => void;
};
