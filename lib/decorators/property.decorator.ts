import { ApiProperty } from '@nestjs/swagger';
import { isEnumProperty } from '../helpers/api-property.helper.js';
import { convertProtoTypeToSwagger } from '../helpers/proto-type.helper.js';
import { addPropertyToStorage } from '../helpers/property.helper.js';
import { PropertyOptionType } from '../types/property-option.type.js';

/*
    type: Value should not be named as "type" (E.g: type: type)
*/
export function Property(option: PropertyOptionType): PropertyDecorator {
    return function (target: object, propertyName: string | symbol): void {
        // Protobuf has no "number" type and enum values are integers: a numeric enum without a format is int32.
        // @GrpcEnum / @GrpcEnums parameters get this default too, because their params DTO is built with @Property.
        const isEnum = isEnumProperty(option);
        const isNumber = option.type === Number || option.type === 'number';
        if (isEnum && isNumber && !option.format) {
            option.format = 'int32';
        }

        // For enum properties `convertProtoTypeToSwagger()` returns the enum *name*, which is what
        // the proto/TypeScript generators want but is not a valid OpenAPI `type`. @nestjs/swagger v11
        // silently overwrote it with the derived JSON type; v12 only fills `type` in when it is not
        // already set, so passing it through would emit `type: 'UserTypeEnum'`. Let swagger derive it.
        const apiOptions = isEnum ? { ...option } : { ...option, type: convertProtoTypeToSwagger(option) };
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

        addPropertyToStorage(target.constructor, propertyName as string, option);
    };
}
