import { PickResponseType } from '../../libs/type-helpers/pick-type.helper';
import { UserResponse } from './user.response';
import { ExtendType } from '../../libs/decorators/extend-type.decorator';

@ExtendType()
export class UserNameResponse extends PickResponseType(UserResponse, ['name', 'type']) {}

@ExtendType()
export class UserNameResponse2 extends PickResponseType(UserNameResponse, ['name']) {}
