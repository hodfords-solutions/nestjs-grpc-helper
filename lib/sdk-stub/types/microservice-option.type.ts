export type MicroserviceModuleOptionType = {
    timeout: number;
    url: string;
    ssl?: boolean;
    maxReceiveMessageLength?: number;
    shouldLoadEmptyArray?: boolean;
    enableLanguageMetaData?: boolean;
};

export type MicroserviceClientOptionType = {
    timeout: number;
    enableLanguageMetaData?: boolean;
};
