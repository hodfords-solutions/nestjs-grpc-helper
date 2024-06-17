import { UserResponse } from './user.response';
import { ExtendType, PickResponseType } from '@hodfords/nestjs-grpc-helper';

@ExtendType()
export class UserNameResponse extends PickResponseType(UserResponse, ['name', 'type']) {}

@ExtendType()
export class UserNameResponse2 extends PickResponseType(UserNameResponse, ['name']) {}
