/* eslint-disable max-lines-per-function */
import 'reflect-metadata';

// @faker-js/faker ships ESM only and cannot be parsed by this jest setup; it is irrelevant for generation
jest.mock('@faker-js/faker', () => ({ faker: {} }));

// Register the Native*Value response classes exactly like importing the library index does in production
import '../responses/native.response';
import { ResponseModel } from '@hodfords/nestjs-response';
import * as fs from 'fs-extra';
import * as os from 'os';
import path from 'path';
import { GrpcId, GrpcIds } from '../decorators/grpc-param.decorator';
import { GrpcValue } from '../decorators/grpc-value.decorator';
import { GrpcAction, RegisterGrpcMicroservice } from '../decorators/microservice.decorator';
import { Property } from '../decorators/property.decorator';
import { GenerateSkillService } from './generate-skill.service';

enum SkillStatusEnum {
    ACTIVE = 'ACTIVE',
    BLOCKED = 'BLOCKED'
}

class SkillParamDto {
    @Property({ type: String, description: 'Keyword to search' })
    keyword: string;

    @Property({ type: String, enum: SkillStatusEnum, enumName: 'SkillStatusEnum', required: false })
    status?: SkillStatusEnum;
}

class SkillUserResponse {
    @Property({ type: String, description: 'User identifier' })
    id: string;

    @Property({ type: String, isArray: true, required: false })
    tags?: string[];
}

@RegisterGrpcMicroservice('Skill fixture microservice')
export class SkillFixtureMicroservice {
    @GrpcAction('Find one user')
    @ResponseModel(SkillUserResponse)
    findOne(@GrpcValue() param: SkillParamDto): SkillUserResponse {
        return param as any;
    }

    @GrpcAction('Find users by ids')
    @ResponseModel(SkillUserResponse, true)
    findByIds(@GrpcId('userId') userId: string, @GrpcIds('ids') ids: string[]): any {
        return { userId, ids } as any;
    }

    @GrpcAction('Ping without input')
    @ResponseModel(String)
    ping(): any {
        return 'pong';
    }
}

describe('GenerateSkillService', () => {
    let outputDir: string;
    let skillContent: string;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hostPackage = require(path.join(process.cwd(), 'package.json'));

    beforeAll(() => {
        outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grpc-helper-skill-'));
        new GenerateSkillService({
            name: 'skillPkg',
            packageName: '@test/skill-pkg',
            output: outputDir,
            aiSkill: { name: 'my-skill', description: 'Skill for testing' }
        } as any).generate();
        skillContent = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf8');
    });

    afterAll(() => {
        fs.removeSync(outputDir);
    });

    it('should write skill.json with the configured ai skill metadata', () => {
        const skillJson = fs.readJsonSync(path.join(outputDir, 'skill.json'));
        expect(skillJson).toEqual({ name: 'my-skill', description: 'Skill for testing' });
    });

    it('should render the front matter and installation instructions', () => {
        expect(skillContent).toContain('name: my-skill');
        expect(skillContent).toContain('description: Skill for testing');
        expect(skillContent).toContain('# skillPkg');
        expect(skillContent).toContain('npm install --save @test/skill-pkg');
    });

    it('should render the module setup with the generated module name', () => {
        expect(skillContent).toContain("import { SkillPkgModule } from '@test/skill-pkg';");
        expect(skillContent).toContain('SkillPkgModule.register({');
    });

    it('should document each microservice with a constructor usage snippet', () => {
        expect(skillContent).toContain('### SkillFixtureMicroservice');
        expect(skillContent).toContain('constructor(private skillFixtureMicroservice: SkillFixtureMicroservice) {}');
    });

    it('should document dto based methods with request and response types', () => {
        expect(skillContent).toContain('#### `findOne`');
        expect(skillContent).toContain('Find one user');
        expect(skillContent).toContain('- **Request:** `SkillParamDto`');
        expect(skillContent).toContain('- **Response:** `SkillUserResponse`');
        expect(skillContent).toContain(
            'const response = await skillFixtureMicroservice.findOne({ /* SkillParamDto */ });'
        );
    });

    it('should document direct param methods with a parameter list instead of a request type', () => {
        expect(skillContent).toContain('#### `findByIds`');
        expect(skillContent).toContain('- **Parameters:**');
        expect(skillContent).toContain('- `userId`: `string`');
        expect(skillContent).toContain('- `ids`: `string[]`');
        expect(skillContent).toContain('- **Response:** `SkillUserResponse[]`');
        expect(skillContent).toContain('const response = await skillFixtureMicroservice.findByIds(userId, ids);');
        expect(skillContent).not.toContain('- **Request:** `SkillFixtureMicroserviceFindByIdsParams`');
    });

    it('should document parameterless methods with an empty call', () => {
        expect(skillContent).toContain('const response = await skillFixtureMicroservice.ping();');
    });

    it('should render model tables with type, required flag and description', () => {
        expect(skillContent).toContain('### SkillParamDto');
        expect(skillContent).toContain('| keyword | `string` | Yes | Keyword to search |');
        expect(skillContent).toContain('| status | `SkillStatusEnum` | No |  |');
        expect(skillContent).toContain('| tags | `string[]` | No |  |');
    });

    it('should render enum sections with their values', () => {
        expect(skillContent).toContain('### SkillStatusEnum');
        expect(skillContent).toContain('| `ACTIVE` |');
        expect(skillContent).toContain('| `BLOCKED` |');
    });

    it('should fall back to the host package metadata when no ai skill config is given', () => {
        const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grpc-helper-skill-fallback-'));
        try {
            new GenerateSkillService({ name: 'skillPkg', output: fallbackDir } as any).generate();
            const skillJson = fs.readJsonSync(path.join(fallbackDir, 'skill.json'));
            expect(skillJson).toEqual({ name: 'skillPkg', description: hostPackage.description });

            const fallbackSkill = fs.readFileSync(path.join(fallbackDir, 'SKILL.md'), 'utf8');
            expect(fallbackSkill).toContain(`npm install --save ${hostPackage.name}`);
        } finally {
            fs.removeSync(fallbackDir);
        }
    });
});
