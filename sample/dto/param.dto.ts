import { IsString } from 'class-validator';
import { AnyType, Property } from '@hodfords/nestjs-grpc-helper';

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

    @Property({ type: 'any' })
    @AnyType()
    data: any;
}
