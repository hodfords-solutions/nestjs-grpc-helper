/* eslint-disable @typescript-eslint/no-unsafe-function-type */
export type DocumentType = {
    title: string;
    package: string;
    description: string;
    installDescription: string;
    usageDescription: string;
    microservices: MicroserviceDocumentType[];
    models: ModelDocumentType[];
};

export type ModelDocumentType = {
    classId: string;
    model: Function;
    name: string;
    properties: PropertyDocumentType[];
};

export type PropertyDocumentType = {
    name: string;
    option: {
        type: any;
        isArray?: boolean;
        required?: boolean;
        description?: string;
        default?: any;
        typeId?: string;
    };
};

export type MicroserviceDocumentType = {
    name: string;
    description: string;
    methods: MethodDocumentType[];
};

export type MethodDocumentType = {
    name: string;
    sdkUsage: string;
    description: string;
    parameter: string;
    response: string;
    isResponseArray: boolean;
    isResponseNative: boolean;
    exampleResponse: string;
};
