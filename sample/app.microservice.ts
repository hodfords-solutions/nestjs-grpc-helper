import { Controller } from '@nestjs/common';
import { ResponseModel, UseResponseInterceptor } from '@hodfords/nestjs-response';
import {
    GrpcAction,
    GrpcValue,
    MockResponseMethod,
    MockResponseSample,
    RegisterGrpcMicroservice
} from '@hodfords/nestjs-grpc-helper';
import { UserPaginationResponse } from './responses/user-pagination.response';
import { AnyDto, FindManyDto, ParamDto } from './dto/param.dto';
import { ApiOperation } from '@nestjs/swagger';
import { UserResponse } from './responses/user.response';

@Controller()
@RegisterGrpcMicroservice()
@UseResponseInterceptor()
export class AppMicroservice {
    @GrpcAction('Get user by id')
    @ResponseModel(UserPaginationResponse)
    @ApiOperation({ description: 'test' })
    findOne(@GrpcValue() param: ParamDto): UserPaginationResponse {
        console.log(param);
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
        return true;
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
}
