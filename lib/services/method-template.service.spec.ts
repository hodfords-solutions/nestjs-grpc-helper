/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { MethodTemplateService } from './method-template.service';

class UserResponseFixture {}

class NestedTypeFixture {}

describe('MethodTemplateService', () => {
    let service: MethodTemplateService;

    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

    beforeEach(() => {
        service = new MethodTemplateService();
    });

    describe('templateBody', () => {
        it('should render a getOne call for single responses', () => {
            const response = { responseClass: UserResponseFixture, isArray: false } as any;
            const body = normalize(
                service.templateBody(response, 'UserService', 'findOne', 'ParamDto', 'ParamDto', undefined)
            );

            expect(body).toContain('return await GrpcHelper.with(this.client, UserResponseFixture, this.options)');
            expect(body).toContain(".service('UserService')");
            expect(body).toContain(".method('findOne')");
            expect(body).toContain('.data(param, ParamDto)');
            expect(body).toContain('.getOne() as any;');
        });

        it('should render a getMany call for array responses', () => {
            const response = { responseClass: UserResponseFixture, isArray: true } as any;
            const body = normalize(
                service.templateBody(response, 'UserService', 'findMany', 'ParamDto', 'ParamDto', undefined)
            );

            expect(body).toContain('.getMany() as any;');
        });

        it('should render a fire-and-forget call without return when there is no response', () => {
            const body = normalize(
                service.templateBody(null, 'UserService', 'doAction', 'ParamDto', 'ParamDto', undefined)
            );

            expect(body).toContain('await GrpcHelper.with(this.client, null as any, this.options)');
            expect(body).not.toContain('return');
            expect(body).toContain('.getMany();');
        });

        it('should send an empty object when there is no parameter', () => {
            const response = { responseClass: UserResponseFixture, isArray: false } as any;
            const body = normalize(service.templateBody(response, 'UserService', 'findAll', null, null, undefined));

            expect(body).toContain('.data({})');
        });

        it('should build the param object from direct parameters', () => {
            const response = { responseClass: UserResponseFixture, isArray: false } as any;
            const directParams = [
                { name: 'userId', type: 'string' },
                { name: 'limit', type: 'number' }
            ] as any[];
            const body = normalize(
                service.templateBody(response, 'UserService', 'findOne', 'Params', 'Params', directParams)
            );

            expect(body).toContain('const param = { userId, limit, };');
        });
    });

    describe('getDirectParams', () => {
        it('should return an empty array when no direct params are given', () => {
            expect(service.getDirectParams(undefined)).toEqual([]);
        });

        it('should convert proto types to typescript types', () => {
            const params = service.getDirectParams([
                { name: 'id', type: 'string', required: true },
                { name: 'flag', type: 'bool', required: false },
                { name: 'status', type: 'string', enum: { ACTIVE: 'ACTIVE' }, enumName: 'StatusEnum' },
                { name: 'nested', type: NestedTypeFixture, isArray: true }
            ] as any[]);

            expect(params).toEqual([
                { name: 'id', isArray: undefined, required: true, type: 'string' },
                { name: 'flag', isArray: undefined, required: false, type: 'boolean' },
                { name: 'status', isArray: undefined, required: undefined, type: 'StatusEnum' },
                { name: 'nested', isArray: true, required: undefined, type: 'NestedTypeFixture' }
            ]);
        });
    });

    describe('methodTemplate', () => {
        it('should render a method with a single param object', () => {
            const content = normalize(
                service.methodTemplate('findOne', 'ParamDto', 'UserResponse', 'BODY;', undefined)
            );
            expect(content).toBe('async findOne(param: ParamDto): Promise<UserResponse> { BODY; }');
        });

        it('should render a method without parameters', () => {
            const content = normalize(service.methodTemplate('findAll', null, 'UserResponse[]', 'BODY;', undefined));
            expect(content).toBe('async findAll(): Promise<UserResponse[]> { BODY; }');
        });

        it('should render direct params as a typed argument list', () => {
            const directParams = [
                { name: 'userId', type: 'string', required: true },
                { name: 'ids', type: 'string', required: true, isArray: true },
                { name: 'limit', type: 'number', required: false }
            ] as any[];
            const content = normalize(service.methodTemplate('findByIds', 'Params', 'string', 'BODY;', directParams));

            expect(content).toBe(
                'async findByIds( userId: string, ids: string[], limit?: number ): Promise<string> { BODY; }'
            );
        });
    });
});
