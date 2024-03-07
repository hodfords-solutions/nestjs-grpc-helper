import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Property } from '@hodfords/nestjs-grpc-helper';
import { UserTypeEnum } from 'src/enums/user-type.enum';
import { MockMethod, MockSample } from '../../libs/decorators/mock.decorator';

export class UserResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.datatype.string', [10])
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
