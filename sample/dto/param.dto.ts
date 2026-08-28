import { IsString } from 'class-validator';
import { AnyType, Property } from '../../lib/index.js';

export class ParamNestedDto {
    @Property({
        type: String
    })
    @IsString()
    address: string;
}

export class ParamDto {
    @Property({
        type: 'string',
        description: 'Name of user to search'
    })
    @IsString()
    name: string;

    @Property({
        type: ParamNestedDto
    })
    nestedDto: ParamNestedDto;
}

export class FindManyDto {
    @Property({
        type: 'string',
        description: 'Name of user to search'
    })
    @IsString()
    name: string;

    @Property({
        type: ParamNestedDto,
        isArray: true,
        required: true
    })
    nestedDto: ParamNestedDto[];
}

export class AnyDto {
    @Property({
        type: 'string',
        description: 'Name of user to search'
    })
    @IsString()
    name: string;

    @Property({ type: 'string', format: 'any' })
    @AnyType()
    data: any;
}
