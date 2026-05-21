import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MockMethod, MockSample, Property, SdkExpose } from '@hodfords/nestjs-grpc-helper';
import { UserTypeEnum } from '../enums/user-type.enum';
import { Type } from 'class-transformer';

export enum UnusedEnum {
    A = 'A',
    B = 'B'
}

export class NestedUnusedUserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.firstName')
    @IsString()
    @IsOptional()
    name?: string;
}

@SdkExpose()
export class UnusedWithDecorator {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.firstName')
    @IsString()
    @IsOptional()
    name?: string;
}

export class UnusedUserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.firstName')
    @IsString()
    @IsOptional()
    name?: string;
}

export class UserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.firstName')
    @IsString()
    @IsOptional()
    name?: string;

    @Property({ type: Boolean, required: false })
    @IsBoolean()
    @IsOptional()
    isAdmin?: boolean;

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

    @Property({ type: NestedUnusedUserResponse, required: false })
    @IsOptional()
    @Type(() => NestedUnusedUserResponse)
    nested?: NestedUnusedUserResponse;
}
