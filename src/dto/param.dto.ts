import { IsString } from 'class-validator';
import { Property } from '@hodfords/nestjs-grpc-helper';

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
