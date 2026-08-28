export type MetadataParameterOptionType = {
    index?: number;
    name: string;
    validate?: ((value: string) => boolean)[];
    type: any;
};
