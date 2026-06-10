/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/naming-convention */
jest.mock('@hodfords/nestjs-cls-translation', () => ({
    runInLanguage: jest.fn((params: any, callback: () => any) => callback())
}));

import 'reflect-metadata';
import { runInLanguage } from '@hodfords/nestjs-cls-translation';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, Observable, of } from 'rxjs';
import { GrpcTranslationInterceptor } from './grpc-translation.interceptor';

describe('GrpcTranslationInterceptor', () => {
    let request: any;

    const createContext = (metadataMap: Record<string, string>): ExecutionContext => {
        request = {};
        return {
            switchToRpc: () => ({ getContext: () => ({ getMap: () => metadataMap }) }),
            switchToHttp: () => ({ getRequest: () => request })
        } as any;
    };

    const createCallHandler = (value: unknown): CallHandler => ({ handle: jest.fn(() => of(value)) });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('extracts the configured language keys from the gRPC metadata and runs in that language', async () => {
        const interceptor = new GrpcTranslationInterceptor(['lang', 'fallback-lang']);
        const context = createContext({ lang: 'vi', 'fallback-lang': 'en', ignored: 'x' });

        await interceptor.intercept(context, createCallHandler('response'));

        expect(runInLanguage).toHaveBeenCalledTimes(1);
        expect(runInLanguage).toHaveBeenCalledWith({ lang: 'vi', 'fallback-lang': 'en' }, expect.any(Function));
    });

    it('assigns the first metadata language key to the http request i18nLang', async () => {
        const interceptor = new GrpcTranslationInterceptor(['lang', 'fallback-lang']);
        const context = createContext({ lang: 'vi', 'fallback-lang': 'en' });

        await interceptor.intercept(context, createCallHandler('response'));

        expect(request.i18nLang).toBe('vi');
    });

    it('passes through the handler result as an observable', async () => {
        const interceptor = new GrpcTranslationInterceptor(['lang']);
        const context = createContext({ lang: 'en' });
        const next = createCallHandler({ id: 7 });

        const result = await interceptor.intercept(context, next);

        expect(result).toBeInstanceOf(Observable);
        await expect(firstValueFrom(result)).resolves.toEqual({ id: 7 });
        expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('maps missing metadata keys to undefined values', async () => {
        const interceptor = new GrpcTranslationInterceptor(['lang', 'missing-key']);
        const context = createContext({ lang: 'en' });

        await interceptor.intercept(context, createCallHandler(null));

        expect(runInLanguage).toHaveBeenCalledWith({ lang: 'en', 'missing-key': undefined }, expect.any(Function));
        expect(request.i18nLang).toBe('en');
    });
});
