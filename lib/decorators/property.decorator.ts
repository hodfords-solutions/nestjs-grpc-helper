import { ApiProperty } from '@nestjs/swagger';
import { convertProtoTypeToSwagger } from '../helpers/proto-type.helper';
import { addPropertyToStorage } from '../helpers/property.helper';
import { PropertyOptionType } from '../types/property-option.type';

/*
    type: Value should not be named as "type" (E.g: type: type)
*/
export function Property(option: PropertyOptionType): PropertyDecorator {
    return function (target: object, propertyName: string): void {
        const apiOptions = { ...option, type: convertProtoTypeToSwagger(option) };
        ApiProperty(apiOptions)(target, propertyName);

        if (option.type == String || option.type == Number) {
            option.type = option.type.name.toLowerCase();
        }
        if (option.type == Boolean) {
            option.type = 'boolean';
        }

        //@TODO: Need to recheck
        if (option.type === 'string' && option?.default === 'any') {
            option.type = 'any';
        }

        addPropertyToStorage(target.constructor, propertyName, option);
    };
}
