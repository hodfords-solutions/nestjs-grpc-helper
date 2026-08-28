import 'reflect-metadata';
import { ModuleTemplateService } from './module-template.service';

describe('ModuleTemplateService', () => {
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

    let content: string;

    beforeAll(() => {
        const service = new ModuleTemplateService('userSdk', 'user-sdk');
        content = service.template(['UserMicroservice', 'OrderMicroservice']);
    });

    it('should declare a global dynamic module named after the package', () => {
        expect(content).toContain('@Global()');
        expect(content).toContain('export class UserSdkModule {');
        expect(content).toContain('static register(options: MicroserviceModuleOptionType): DynamicModule {');
    });

    it('should import the generated services from the service file', () => {
        expect(content).toContain("import { UserMicroservice,OrderMicroservice } from './services/user-sdk.service';");
    });

    it('should provide and export every service', () => {
        const normalized = normalize(content);
        expect(normalized).toContain('providers: [ UserMicroservice,OrderMicroservice,');
        expect(normalized).toContain('exports: [UserMicroservice,OrderMicroservice],');
    });

    it('should register the grpc client with package specific tokens', () => {
        expect(content).toContain("provide: 'userSdk_OPTIONS'");
        expect(content).toContain("name: 'userSdk_PACKAGE'");
        expect(content).toContain("package: 'userSdk'");
        expect(content).toContain("protoPath: path.join(__dirname, 'microservice.proto')");
    });
});
