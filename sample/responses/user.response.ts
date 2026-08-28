import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MockMethod, MockSample, Property } from '../../lib/index.js';
import { UserTypeEnum } from '../enums/user-type.enum.js';

export class UserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.person.fullName', [10])
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
}
