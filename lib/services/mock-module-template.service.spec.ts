import 'reflect-metadata';
import { MockModuleTemplateService } from './mock-module-template.service';

describe('MockModuleTemplateService', () => {
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

    let content: string;

    beforeAll(() => {
        const service = new MockModuleTemplateService('userSdk', 'user-sdk');
        content = service.template(['UserMicroservice', 'OrderMicroservice']);
    });

    it('should declare a global mock module named after the package', () => {
        expect(content).toContain('@Global()');
        expect(content).toContain('export class MockUserSdkModule {');
    });

    it('should import both the real and the mock services', () => {
        expect(content).toContain(
            'import { UserMicroservice,OrderMicroservice,MockUserMicroservice,MockOrderMicroservice }' +
                " from './services/user-sdk.service';"
        );
    });

    it('should provide each service with its mock implementation', () => {
        const normalized = normalize(content);
        expect(normalized).toContain('{ provide: UserMicroservice, useClass: MockUserMicroservice },');
        expect(normalized).toContain('{ provide: OrderMicroservice, useClass: MockOrderMicroservice }');
    });

    it('should export the real service tokens', () => {
        expect(normalize(content)).toContain('exports: [UserMicroservice,OrderMicroservice]');
    });
});
