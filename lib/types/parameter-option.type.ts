import { PropertyOptionType } from './property-option.type';

export type ParameterOptionType = {
    index?: number;
    name: string;
    decorators?: PropertyDecorator[];
} & PropertyOptionType;
