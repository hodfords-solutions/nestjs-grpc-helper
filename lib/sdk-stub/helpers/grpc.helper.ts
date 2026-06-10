import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { trans } from '@hodfords/nestjs-cls-translation';
import { Metadata, status } from '@grpc/grpc-js';
import { MicroserviceClientOptionType } from '../types/microservice-option.type';
import { Logger } from '@nestjs/common/services/logger.service';
import { applyTransforms } from '@hodfords/nestjs-response';

export class GrpcHelper<Model> {
    private serviceGrpc: any;
    private serviceName: string;
    private methodName: string;
    private payload: any;
    private metadata = new Metadata();
    private logger = new Logger('GrpcHelper');

    static with<Model>(
        client: ClientGrpc,
        model: { new (): Model },
        options: MicroserviceClientOptionType
    ): GrpcHelper<Model> {
        return new GrpcHelper<Model>(client, model, options);
    }

    private constructor(
        private client: ClientGrpc,
        private model: { new (): Model },
        private options: MicroserviceClientOptionType
    ) {
        if (this.options.requestInitializer) {
            this.options.requestInitializer(this.metadata);
        }
    }

    service(name: string): GrpcHelper<Model> {
        this.serviceName = name;
        this.serviceGrpc = this.client.getService<any>(name);
        return this;
    }

    method(name: string): GrpcHelper<Model> {
        this.methodName = name;
        return this;
    }

    data(data: any, parameterModel?: any): GrpcHelper<Model> {
        if (parameterModel) {
            // this.payload = plainToInstance(parameterModel, data, { groups: ['__sendData'] });
            this.payload = applyTransforms(structuredClone(data), parameterModel, { groups: ['__sendData'] });
        } else {
            this.payload = data;
        }
        return this;
    }

    async getOne(): Promise<Model> {
        const data = await this.getMany();
        return data[0];
    }

    async getMany(): Promise<Model[]> {
        try {
            let data = await this.execute<any>();
            if (data.grpcArray) {
                data = data.items || [];
            }
            if (data.grpcNative) {
                data = data.value;
            } else if (data.grpcNullable) {
                return [applyTransforms(data.value || null, this.model as any, { groups: ['__getData'] })];
            }
            if (Array.isArray(data)) {
                // applyTransforms does not walk top-level arrays — transform each item individually
                return data.map((item) => applyTransforms(item, this.model as any, { groups: ['__getData'] }));
            } else {
                return [applyTransforms(data, this.model as any, { groups: ['__getData'] })];
            }
        } catch (exception) {
            this.logger.error(exception);
            throw exception;
        }
    }

    private async execute<T>(): Promise<T> {
        const handler = (): Promise<T> =>
            this.toPromise<T>(
                this.serviceGrpc[this.methodName](this.payload, this.metadata).pipe(timeout(this.options.timeout))
            );

        return handler();
    }

    // eslint-disable-next-line
    // @ts-ignore
    private async toPromise<T>(observe: Observable<T>): Promise<T> {
        try {
            return await firstValueFrom(observe);
        } catch (error) {
            this.handelError(error);
        }
    }

    private get callContext(): string {
        return `${this.serviceName}.${this.methodName}`;
    }

    private handelError(error: any): void {
        if (error instanceof TimeoutError) {
            const timeoutError = new Error(`gRPC timeout after ${this.options.timeout}ms calling ${this.callContext}`);
            this.logger.error(timeoutError.message, timeoutError.stack);
            throw new HttpException(trans('error.an_error_occurred'), HttpStatus.INTERNAL_SERVER_ERROR);
        }

        if (error.code) {
            if (error.code == status.ABORTED) {
                const responseError = JSON.parse(error.details);
                const httpError: any = new HttpException(responseError.message, responseError.code);
                httpError['response'] = responseError.errors;
                httpError.message = responseError.message;
                throw httpError;
            } else {
                this.logger.error(error);
                throw new HttpException(trans('error.an_error_occurred'), HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } else {
            throw error;
        }
    }
}
