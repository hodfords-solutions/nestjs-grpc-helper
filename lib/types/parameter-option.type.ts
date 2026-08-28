import { PropertyOptionType } from './property-option.type.js';

export type ParameterOptionType = {
    index?: number;
    name: string;
    decorators?: PropertyDecorator[];
} & PropertyOptionType;
