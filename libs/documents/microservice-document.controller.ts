import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { generateDocumentService, GrpcHelper } from '@hodfords/nestjs-grpc-helper';
import { DocumentModuleOptionType } from '../types/document-module-option.type';
import { ClientGrpc } from '@nestjs/microservices';
import { GrpcTestDto } from './grpc-test.dto';

@Controller('microservice-documents')
export class MicroserviceDocumentController {
    constructor(
        @Inject('DOCUMENT_OPTIONS') private options: DocumentModuleOptionType,
        @Inject('HERO_PACKAGE') private client: ClientGrpc
    ) {}

    @Get('json')
    getDocumentJson() {
        return generateDocumentService(this.options.packageName);
    }

    @Post('test')
    @HttpCode(HttpStatus.OK)
    async grpcTest(@Body() value: GrpcTestDto) {
        const helper = GrpcHelper.with(this.client, null, { timeout: 10000 })
            .service(value.serviceName)
            .method(value.methodName)
            .data(value.data);
        if (value.isFindMany) {
            return helper.getMany();
        }

        return helper.getOne();
    }
}
