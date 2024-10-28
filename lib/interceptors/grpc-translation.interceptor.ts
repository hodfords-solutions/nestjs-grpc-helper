import { Metadata } from '@grpc/grpc-js';
import { runInLanguage } from '@hodfords/nestjs-cls-translation';
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { first } from 'lodash';
import { firstValueFrom, from, Observable } from 'rxjs';

export class GrpcTranslationInterceptor implements NestInterceptor {
    constructor(private metadataLanguageKeys: string[]) {}

    intercept(context: ExecutionContext, next: CallHandler<any>): Promise<Observable<any>> {
        const metadata: Metadata = context.switchToRpc().getContext().getMap();
        const params = this.metadataLanguageKeys.reduce((values, key) => {
            params[key] = metadata[key];
            return values;
        }, {});
        context.switchToHttp().getRequest().i18nLang = metadata[first(this.metadataLanguageKeys)];
        return runInLanguage(params, () => from(firstValueFrom(next.handle())));
    }
}
