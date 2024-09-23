import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MockMethod, MockSample, Property } from '@hodfords/nestjs-grpc-helper';
import { UserTypeEnum } from '../enums/user-type.enum';

export class UserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.name.fullName', [10])
    @IsString()
    @IsOptional()
    name?: string;

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
