export type DocumentType = {
    title: string;
    package: string;
    description: string;
    installDescription: string;
    usageDescription: string;
    microservices: MicroserviceDocumentType[];
    models: ModelDocumentType[];
    host: string;
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
    link: string;
};

export type MethodDocumentType = {
    name: string;
    link: string;
    sdkUsage: string;
    description: string;
    parameter: string;
    response: string;
    isResponseArray: boolean;
    exampleResponse: string;
};
