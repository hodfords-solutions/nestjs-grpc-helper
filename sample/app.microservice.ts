import { Controller, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { ResponseModel, UseResponseInterceptor } from '@hodfords/nestjs-response';
import {
    SdkFlattenParams,
    GrpcAction,
    GrpcValue,
    MockResponseMethod,
    MockResponseSample,
    RegisterGrpcMicroservice
} from '@hodfords/nestjs-grpc-helper';
import { UserPaginationResponse } from './responses/user-pagination.response';
import { AnyDto, FindManyDto, ParamDto, ParamNestedDto } from './dto/param.dto';
import { ApiOperation } from '@nestjs/swagger';
import { UserResponse } from './responses/user.response';
import { GrpcEnum, GrpcId, GrpcIds } from '../lib/decorators/grpc-param.decorator';
import { Metadata } from '@grpc/grpc-js';
import { GrpcExceptionFilter } from '@hodfords/nestjs-exception';
import { UserTypeEnum } from './enums/user-type.enum';

@Controller()
@RegisterGrpcMicroservice()
@UseFilters(GrpcExceptionFilter)
@UsePipes(new ValidationPipe())
@UseResponseInterceptor()
export class AppMicroservice {
    @GrpcAction('Get user by id')
    @ResponseModel(UserPaginationResponse)
    @ApiOperation({ description: 'test' })
    findOne(@GrpcValue() param: ParamDto): UserPaginationResponse {
        return { items: [{ name: 'test' }, { name: 'test2' }], total: 10, lastPage: 1, perPage: 1, currentPage: 1 };
    }

    @GrpcAction('Find many user')
    @ResponseModel(UserResponse, true)
    @ApiOperation({ description: 'test' })
    findMany(@GrpcValue() param: FindManyDto): UserResponse[] {
        console.log(param);
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('Get empty data')
    emptyFunction(@GrpcValue() param: FindManyDto): UserResponse[] {
        console.log(param);
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('Get empty data')
    emptyParams(): UserResponse[] {
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @GrpcAction('Any Dto')
    @ResponseModel(UserResponse, true)
    anyDto(@GrpcValue() param: AnyDto): UserResponse[] {
        console.log(param);
        return [{ name: param.data, isAdmin: true }, { name: 'test2' }];
    }

    @GrpcAction('Native response boolean')
    @ResponseModel(Boolean)
    @MockResponseSample(true)
    nativeResponse(@GrpcValue() param: AnyDto): any {
        return false;
    }

    @GrpcAction('Native response string')
    @ResponseModel(String)
    @MockResponseMethod('faker.string.alpha')
    nativeString(@GrpcValue() param: AnyDto): any {
        return 'test';
    }

    @GrpcAction('Native response number')
    @ResponseModel(Number)
    @MockResponseMethod('faker.number.int', [{ min: 1, max: 100 }])
    nativeNumber(@GrpcValue() param: AnyDto): any {
        return 1;
    }

    @GrpcAction('Native response float')
    @ResponseModel(Number)
    nativeFloat(@GrpcValue() param: AnyDto): any {
        return 1.5;
    }

    @GrpcAction('Native response string')
    @ResponseModel(String, true)
    nativeArrayString(@GrpcValue() param: AnyDto): string[] {
        return ['test', 'test2', 'test3'];
    }

    @GrpcAction('Native response string')
    @ResponseModel(Boolean, true)
    nativeArrayBoolean(@GrpcValue() param: AnyDto): boolean[] {
        return [true, false, true];
    }

    @GrpcAction('Native response string')
    @ResponseModel(Number, true)
    nativeArrayNumber(@GrpcValue() param: AnyDto): number[] {
        return [1, Math.random(), 2];
    }

    @GrpcAction('Single params')
    @ResponseModel(String)
    singleParam(@GrpcId('userId') userId: string, @GrpcIds('userIds') userIds: string[], metadata: Metadata): any {
        console.log('userId', userId);
        console.log('userIds', userIds);
        console.log('metadata', metadata);
        return '123';
    }

    @GrpcAction('Single params')
    @ResponseModel(String)
    singleParamWithEnum(
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

    @GrpcAction('flatten params')
    @SdkFlattenParams()
    @ResponseModel(String)
    flattenParams(@GrpcValue() param: ParamDto): any {
        console.log('flatten params', param);
        return '123';
    }

    @GrpcAction('testMetadata')
    @ResponseModel(String)
    testMetadata(@GrpcValue() param: ParamNestedDto, metadata: Metadata): any {
        console.log('param', param);
        console.log('metadata', metadata);
        return '123';
    }
}
