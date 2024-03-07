import { Controller } from '@nestjs/common';
import { ResponseModel, UseResponseInterceptor } from '@hodfords/nestjs-response';
import { GrpcAction, RegisterGrpcMicroservice } from '@hodfords/nestjs-grpc-helper';
import { UserPaginationResponse } from './responses/user-pagination.response';
import { FindManyDto, ParamDto } from './dto/param.dto';
import { ApiOperation } from '@nestjs/swagger';
import { UserResponse } from './responses/user.response';
import { GrpcValue } from '../libs/decorators/grpc-value.decorator';

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
}
