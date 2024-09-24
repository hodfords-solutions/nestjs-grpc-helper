import { UserResponse } from './user.response';
import { ExtendType, MockMethod, PickResponseType, Property } from '@hodfords/nestjs-grpc-helper';
import { IsOptional, IsString } from 'class-validator';
import { IntersectionResponseType } from 'lib/type-helpers/intersection-type.helper';
import { OmitResponseType } from 'lib/type-helpers/omit-type.helper';
import { PartialResponseType } from 'lib/type-helpers/partial-type.helper';

@ExtendType()
export class UserNameResponse extends PickResponseType(UserResponse, ['name', 'type']) {}

@ExtendType()
export class UserAdditionResponse extends PickResponseType(UserNameResponse, ['name']) {
    @Property({ type: String, required: false })
    @MockMethod('faker.address.streetAddress')
    @IsString()
    @IsOptional()
    address?: string;
}

@ExtendType()
export class UserFullResponse extends IntersectionResponseType(UserNameResponse, UserAdditionResponse) {
    @Property({ type: String, required: false })
    @MockMethod('faker.location.state')
    @IsString()
    @IsOptional()
    state?: string;
}

@ExtendType()
export class UserAddressResponse extends OmitResponseType(UserFullResponse, ['name', 'type']) {
    @Property({ type: String, required: true })
    @MockMethod('faker.location.country')
    @IsString()
    country: string;
}

@ExtendType()
export class UserPartialResponse extends PartialResponseType(UserAddressResponse) {}

export class UserExtendResponse {
    @Property({ type: String, required: false })
    @MockMethod('faker.name.fullName')
    @IsString()
    @IsOptional()
    name?: string;
}

@ExtendType()
export class UserExtendResponse2 extends UserExtendResponse {}
@ExtendType()
export class UserExtendResponse3 extends PickResponseType(UserExtendResponse2, ['name']) {}
