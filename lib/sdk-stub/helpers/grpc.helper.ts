import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CLS_TRANSLATION_NAMESPACE, currentLanguage, getLanguageByKey, trans } from '@hodfords/nestjs-cls-translation';
import { Metadata, status } from '@grpc/grpc-js';
import { MicroserviceClientOptionType } from '../types/microservice-option.type';
import {
    COMMUNICATION_LANGUAGE,
    PLATFORM_LANGUAGE_KEY,
    REPORT_LANGUAGE_KEY
} from '../constants/multi-language-key.constant';

export class GrpcHelper<Model> {
    private serviceGrpc: any;
    private methodName: string;
    private payload: any;
    private metadata = new Metadata();

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
        if (this.options.enableLanguageMetaData) {
            this.appendLanguages();
        }
    }

    private currentPriorityLanguage(key = REPORT_LANGUAGE_KEY) {
        return CLS_TRANSLATION_NAMESPACE.get(key);
    }

    private appendLanguages() {
        const platformLanguage = currentLanguage();
        const reportLanguage = this.currentPriorityLanguage();
        const communicationLanguage = getLanguageByKey(COMMUNICATION_LANGUAGE);
        if (platformLanguage) {
            this.metadata.add(PLATFORM_LANGUAGE_KEY, platformLanguage);
        }
        if (reportLanguage) {
            this.metadata.add(REPORT_LANGUAGE_KEY, reportLanguage);
        }
        if (communicationLanguage) {
            this.metadata.add(COMMUNICATION_LANGUAGE, communicationLanguage);
        }
    }

    service(name: string): GrpcHelper<Model> {
        this.serviceGrpc = this.client.getService<any>(name);
        return this;
    }

    method(name: string): GrpcHelper<Model> {
        this.methodName = name;
        return this;
    }

    data(data: any): GrpcHelper<Model> {
        this.payload = data;
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
            if (Array.isArray(data)) {
                return plainToInstance(this.model, data);
            } else {
                return [plainToInstance(this.model, data)];
            }
        } catch (exception) {
            console.log(this.methodName, exception);
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

    private handelError(error: any): void {
        if (error.code) {
            if (error.code == status.ABORTED) {
                const responseError = JSON.parse(error.details);
                const httpError: any = new HttpException(responseError.message, responseError.code);
                httpError['response'] = responseError.errors;
                httpError.message = responseError.message;
                throw httpError;
            } else {
                console.error(error);
                throw new HttpException(trans('error.an_error_occurred'), HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } else {
            throw error;
        }
    }
}
