import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnyType, MockSample, Property } from '@hodfords/nestjs-grpc-helper';
import { UserTypeEnum } from '../enums/user-type.enum';

export class ParamNestedDto {
    @Property({
        type: String
    })
    @IsString()
    address: string;

    @Property({
        type: String,
        required: false,
        enum: UserTypeEnum,
        enumName: 'UserTypeEnum'
    })
    @MockSample(UserTypeEnum.STANDARD)
    @IsEnum(UserTypeEnum)
    @IsOptional()
    type?: UserTypeEnum;
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
