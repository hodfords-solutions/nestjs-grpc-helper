import { Controller, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { ResponseModel, UseResponseInterceptor } from '@hodfords/nestjs-response';
import {
    SdkFlattenParams,
    GrpcAction,
    GrpcValue,
    MockResponseCallback,
    MockResponseMethod,
    MockResponseSample,
    RegisterGrpcMicroservice,
    GrpcPagination,
    GrpcSort,
    GrpcMetadataId,
    sample
} from '@hodfords/nestjs-grpc-helper';
import { UserPaginationResponse } from './responses/user-pagination.response';
import { AnyDto, FindManyDto, ParamDto, ParamNestedDto } from './dto/param.dto';
import { ApiOperation } from '@nestjs/swagger';
import { UserResponse } from './responses/user.response';
import { GrpcEnum, GrpcId, GrpcIds } from '@hodfords/nestjs-grpc-helper';
import { Metadata } from '@grpc/grpc-js';
import { GrpcExceptionFilter } from '@hodfords/nestjs-exception';
import { UserTypeEnum } from './enums/user-type.enum';
import { PaginationDto } from '../lib/dto/pagination.dto';
import { SortDto } from '../lib/dto/sort.dto';

@Controller()
@RegisterGrpcMicroservice('User management microservice for handling user CRUD operations and queries')
@UseFilters(GrpcExceptionFilter)
@UsePipes(new ValidationPipe())
@UseResponseInterceptor()
export class AppMicroservice {
    @GrpcAction('Retrieve a single user with paginated related data by search criteria')
    @ResponseModel(UserPaginationResponse)
    @ApiOperation({ description: 'test' })
    findOne(@GrpcValue() param: ParamDto): UserPaginationResponse {
        return { items: [{ name: 'test' }, { name: 'test2' }], total: 10, lastPage: 1, perPage: 1, currentPage: 1 };
    }

    @GrpcAction('Search and return multiple users matching the given filter criteria')
    @ResponseModel(UserResponse, true)
    @ApiOperation({ description: 'test' })
    findMany(@GrpcValue() param: FindManyDto): UserResponse[] {
        console.log(param);
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('Search users without a defined response model')
    emptyFunction(@GrpcValue() param: FindManyDto): UserResponse[] {
        console.log(param);
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('List all users without any filter parameters')
    emptyParams(): UserResponse[] {
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('Search users by name with flexible data input')
    @ResponseModel(UserResponse, true)
    anyDto(@GrpcValue() param: AnyDto): UserResponse[] {
        console.log(param);
        return [{ name: param.data, isAdmin: true }, { name: 'test2' }];
    }

    @GrpcAction('Get users by name with dynamic mock data based on input')
    @ResponseModel(UserResponse, true)
    @MockResponseCallback((param: AnyDto, sample, model) => {
        return sample(model);
    })
    getUsersByName(@GrpcValue() param: AnyDto): UserResponse[] {
        return [];
    }

    @GrpcAction('Check if a user is active, returns a boolean status')
    @ResponseModel(Boolean)
    @MockResponseSample(true)
    checkUserActive(@GrpcValue() param: AnyDto): any {
        return false;
    }

    @GrpcAction('Get the display name of a user as a string')
    @ResponseModel(String)
    @MockResponseMethod('faker.string.alpha')
    getUserDisplayName(@GrpcValue() param: AnyDto): any {
        return 'test';
    }

    @GrpcAction('Count the total number of users matching criteria')
    @ResponseModel(Number)
    @MockResponseMethod('faker.number.int', [{ min: 1, max: 100 }])
    countUsers(@GrpcValue() param: AnyDto): any {
        return 1;
    }

    @GrpcAction('Calculate the average rating score for a user')
    @ResponseModel(Number)
    getUserRating(@GrpcValue() param: AnyDto): any {
        return 1.5;
    }

    @GrpcAction('Get a list of tags associated with a user')
    @ResponseModel(String, true)
    getUserTags(@GrpcValue() param: AnyDto): string[] {
        return ['test', 'test2', 'test3'];
    }

    @GrpcAction('Get the permission flags for a user')
    @ResponseModel(Boolean, true)
    getUserPermissions(@GrpcValue() param: AnyDto): boolean[] {
        return [true, false, true];
    }

    @GrpcAction('Get the role priority values for a user')
    @ResponseModel(Number, true)
    getUserRolePriorities(@GrpcValue() param: AnyDto): number[] {
        return [1, Math.random(), 2];
    }

    @GrpcAction('Retrieve a user by ID along with related user IDs from gRPC metadata')
    @ResponseModel(String)
    @MockResponseCallback((userId: string, userIds: string[], sample, model) => {
        return sample(model);
    })
    getUserWithRelations(
        @GrpcId('userId') userId: string,
        @GrpcIds('userIds') userIds: string[],
        metadata: Metadata
    ): any {
        console.log('userId', userId);
        console.log('userIds', userIds);
        console.log('metadata', metadata);
        return '123';
    }

    @GrpcAction('Retrieve a user by ID filtered by their account type')
    @ResponseModel(String)
    getUserByType(
        @GrpcId('userId') userId: string,
        @GrpcEnum({
            name: 'userType',
            enum: UserTypeEnum,
            enumName: 'UserTypeEnum'
        })
        userType: UserTypeEnum
    ): any {
        console.log('userId', userId);
        console.log('userType', userType);
        return '123';
    }

    @GrpcAction('Search users with flattened individual search parameters')
    @SdkFlattenParams()
    @ResponseModel(String)
    searchUsersFlattened(@GrpcValue() param: ParamDto): any {
        console.log('flatten params', param);
        return '123';
    }

    @GrpcAction('Look up an address and return the resolved location identifier')
    @ResponseModel(String)
    resolveAddress(@GrpcValue() param: ParamNestedDto, metadata: Metadata): any {
        console.log('param', param);
        console.log('metadata', metadata);
        return '123';
    }

    @GrpcAction('Find an address and return null if not found')
    @ResponseModel(String, false, true)
    findAddressOrNull(@GrpcValue() param: ParamNestedDto, metadata: Metadata): any {
        return null;
    }

    @GrpcAction('Find a user by address, returning null when no match exists')
    @ResponseModel(UserResponse, { isAllowEmpty: true })
    findUserByAddress(@GrpcValue() param: ParamNestedDto): UserResponse | null {
        if (param.address !== 'exists') {
            return null;
        }

        return { name: 'test' };
    }

    @GrpcAction('List users with pagination, sorting, and workspace scoping')
    @ResponseModel(String)
    listUsers(
        @GrpcValue() param: ParamNestedDto,
        @GrpcPagination() pagination: PaginationDto,
        @GrpcSort() sortParam: SortDto,
        @GrpcMetadataId('workspace-id') workspaceId: string
    ): string {
        console.log('param', param);
        console.log('pagination', pagination);
        console.log('sortParam', sortParam);
        console.log('workspaceId', workspaceId);
        return '123';
    }

    @GrpcAction('Get the current workspace identifier from gRPC metadata')
    @ResponseModel(String)
    getWorkspaceId(@GrpcMetadataId('workspace-id') workspaceId: string): any {
        console.log('workspaceId', workspaceId);
        return '123';
    }
}
