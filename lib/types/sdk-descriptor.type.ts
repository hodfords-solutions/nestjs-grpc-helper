export type SdkNativeType = 'string' | 'bool' | 'float';
export type SdkResponseKind = 'empty' | 'single' | 'list' | 'native' | 'nativeList' | 'nullable';
export type SdkMethodDescriptor = {
    name: string;
    description?: string;
    requestType?: string;
    responseKind: SdkResponseKind;
    responseType?: string;
    wireResponseType: string;
    isStream: boolean;
    metadataKeys: string[];
    isNullablePrimitive: boolean;
};
export type SdkServiceDescriptor = { name: string; description?: string; methods: SdkMethodDescriptor[] };
export type SdkEnumDescriptor = {
    name: string;
    valueType: 'string' | 'number';
    entries: { key: string; value: string | number }[];
};
export type SdkDescriptor = { services: SdkServiceDescriptor[]; enums: SdkEnumDescriptor[] };
