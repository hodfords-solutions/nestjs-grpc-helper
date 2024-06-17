import { UserResponse } from './user.response';
import { ExtendType, MockMethod, PickResponseType, Property } from '@hodfords/nestjs-grpc-helper';
import { IsOptional, IsString } from 'class-validator';
import { IntersectionResponseType } from '../../libs/type-helpers/intersection-type.helper';
import { OmitResponseType } from '../../libs/type-helpers/omit-type.helper';
import { PartialResponseType } from '../../libs/type-helpers/partial-type.helper';

@ExtendType()
export class UserNameResponse extends PickResponseType(UserResponse, ['name', 'type']) {}

@ExtendType()
export class UserAdditionResponse extends PickResponseType(UserNameResponse, ['name']) {
    @Property({ type: String, required: false })
    @MockMethod('faker.datatype.string', [10])
    @IsString()
    @IsOptional()
    address?: string;
}

@ExtendType()
export class UserFullResponse extends IntersectionResponseType(UserNameResponse, UserAdditionResponse) {
    @Property({ type: String, required: false })
    @MockMethod('faker.datatype.string', [10])
    @IsString()
    @IsOptional()
    state?: string;
}

@ExtendType()
export class UserAddressResponse extends OmitResponseType(UserFullResponse, ['name', 'type']) {
    @Property({ type: String, required: true })
    @MockMethod('faker.datatype.string', [10])
    @IsString()
    country: string;
}

@ExtendType()
export class UserPartialResponse extends PartialResponseType(UserAddressResponse) {}
