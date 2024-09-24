import { IsArray, ValidateNested } from 'class-validator';
import { PaginationResponse } from './pagination.response';
import { UserResponse } from './user.response';
import { Type } from 'class-transformer';
import { MockNested, Property } from '@hodfords/nestjs-grpc-helper';

export class UserPaginationResponse extends PaginationResponse {
    @IsArray()
    @ValidateNested()
    @Type(() => UserResponse)
    @Property({ type: UserResponse, isArray: true })
    @MockNested(5)
    items: UserResponse[];
}
