import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { UseResponseInterceptor, ResponseModel } from '@hodfords/nestjs-response';
import { UserResponse } from './responses/user.response';
import { UserPaginationResponse } from './responses/user-pagination.response';
import { generateDocumentService } from '@hodfords/nestjs-grpc-helper';
import { UserNameResponse } from './responses/user-name.response';

@Controller()
@UseResponseInterceptor()
export class AppController {
    @Get('microservice-docs')
    @HttpCode(HttpStatus.OK)
    async document() {
        return generateDocumentService('Hero');
    }

    @Get('multiple')
    @ResponseModel(UserResponse, true)
    @HttpCode(HttpStatus.OK)
    getMultiple() {
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @Get('user')
    @ResponseModel(UserNameResponse, true)
    @HttpCode(HttpStatus.OK)
    getUserName() {
        return [{ name: 'test' }, { name: 'test2' }];
    }

    @Get('pagination')
    @ResponseModel(UserPaginationResponse, false)
    @HttpCode(HttpStatus.OK)
    getPagination() {
        return { items: [{ name: 'test' }, { name: 'test2' }], total: 10, lastPage: 1, perPage: 1, currentPage: 1 };
    }
}
