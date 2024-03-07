import { IsArray, ValidateNested } from 'class-validator';
import { PaginationResponse } from './pagination.response';
import { UserResponse } from './user.response';
import { Type } from 'class-transformer';
import { Property } from '@hodfords/nestjs-grpc-helper';
import { MockNested } from '../../libs/decorators/mock.decorator';

export class UserPaginationResponse extends PaginationResponse {
    @IsArray()
    @ValidateNested()
    @Type(() => UserResponse)
    @Property({ type: UserResponse, isArray: true })
    @MockNested(5)
    items: UserResponse[];
}
