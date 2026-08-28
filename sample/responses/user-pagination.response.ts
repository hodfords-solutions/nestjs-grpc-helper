import { IsArray, ValidateNested } from 'class-validator';
import { PaginationResponse } from './pagination.response.js';
import { UserResponse } from './user.response.js';
import { Type } from 'class-transformer';
import { MockNested, Property } from '../../lib/index.js';

export class UserPaginationResponse extends PaginationResponse {
    @IsArray()
    @ValidateNested()
    @Type(() => UserResponse)
    @Property({ type: UserResponse, isArray: true })
    @MockNested(5)
    items: UserResponse[];
}
