/* eslint-disable max-lines-per-function */
import 'reflect-metadata';
import { MockResponseCallback, MockResponseMethod, MockResponseSample } from '../decorators/mock.decorator';
import { MockMethodTemplateService } from './mock-method-template.service';

class UserResponseFixture {}

class MockTargetFixture {
    @MockResponseSample({ id: '1', name: 'mocked' })
    sampled(): void {}

    @MockResponseMethod('faker.number.int', [{ min: 1, max: 9 }])
    generated(): void {}

    @MockResponseCallback((param, sample, model) => sample(model))
    computed(): void {}

    plain(): void {}
}

describe('MockMethodTemplateService', () => {
    let service: MockMethodTemplateService;

    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
    const singleResponse = { responseClass: UserResponseFixture, isArray: false } as any;
    const arrayResponse = { responseClass: UserResponseFixture, isArray: true } as any;

    beforeEach(() => {
        service = new MockMethodTemplateService();
    });

    describe('templateBody', () => {
        it('should return an empty body when there is no response', () => {
            expect(service.templateBody(null, MockTargetFixture, 'plain')).toBe('');
        });

        it('should return a single sample for plain responses', () => {
            const body = service.templateBody(singleResponse, MockTargetFixture, 'plain');
            expect(body).toBe('return sample(UserResponseFixture) as any;');
        });

        it('should return a sample array for array responses', () => {
            const body = service.templateBody(arrayResponse, MockTargetFixture, 'plain');
            expect(body).toBe('return [sample(UserResponseFixture)] as any;');
        });

        it('should inline the sample of @MockResponseSample', () => {
            const body = service.templateBody(singleResponse, MockTargetFixture, 'sampled');
            expect(body).toBe('return {"id":"1","name":"mocked"} as any;');
        });

        it('should call sampleMethod for @MockResponseMethod', () => {
            const body = service.templateBody(singleResponse, MockTargetFixture, 'generated');
            expect(body).toBe('return sampleMethod({"method":"faker.number.int","args":[{"min":1,"max":9}]}) as any;');
        });

        it('should inline the callback of @MockResponseCallback with the param object', () => {
            const body = service.templateBody(singleResponse, MockTargetFixture, 'computed');
            expect(normalize(body)).toBe(
                'return ((param, sample, model) => sample(model))(param, sample, UserResponseFixture) as any;'
            );
        });

        it('should pass direct params as a destructured object to the callback', () => {
            const body = service.templateBody(singleResponse, MockTargetFixture, 'computed', [
                { name: 'userId' },
                { name: 'limit' }
            ]);
            expect(normalize(body)).toContain('({ userId, limit }, sample, UserResponseFixture) as any;');
        });
    });

    describe('methodTemplate', () => {
        it('should render a mock method with a single param object', () => {
            const content = normalize(
                service.methodTemplate('findOne', 'ParamDto', 'UserResponse', 'BODY;', undefined)
            );
            expect(content).toBe('async findOne(param: ParamDto): Promise<UserResponse> { BODY; }');
        });

        it('should render a mock method without parameters', () => {
            const content = normalize(service.methodTemplate('findAll', null, 'void', 'BODY;', undefined));
            expect(content).toBe('async findAll(): Promise<void> { BODY; }');
        });

        it('should render direct params as a typed argument list', () => {
            const directParams = [
                { name: 'userId', type: 'string', required: true },
                { name: 'flags', type: 'bool', required: false, isArray: true }
            ] as any[];
            const content = normalize(service.methodTemplate('check', 'Params', 'boolean', 'BODY;', directParams));
            expect(content).toBe('async check( userId: string, flags?: boolean[] ): Promise<boolean> { BODY; }');
        });
    });
});
