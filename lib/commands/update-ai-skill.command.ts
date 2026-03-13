import { BaseCommand, Command } from '@hodfords/nestjs-command';
import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import path from 'path';
import { kebabCase } from 'lodash';

@Command({
    signature: 'update-ai-skill <packageName> <ai>',
    description: 'Update AI Skill'
})
@Injectable()
export class UpdateAiSkillCommand extends BaseCommand {
    public handle() {
        const aiSkillPathMap: Record<string, string> = {
            claude: './.claude/skills',
            antigravity: './.agent/skills'
        };

        const [packageName, ai] = this.params;
        const aiSkillPath = aiSkillPathMap[ai];
        if (!aiSkillPath) {
            return this.error(`AI must be ${Object.keys(aiSkillPathMap).join(' or ')}`);
        }
        fs.mkdirSync(aiSkillPath, { recursive: true });

        const packages = this.getAllPackages();
        const matchedPackages = packages.filter((pkg) => pkg.match(packageName));
        const skills: string[] = [];

        for (const pkg of matchedPackages) {
            const pkgPath = `./node_modules/${pkg}`;
            const skillConfigPath = path.join(pkgPath, 'skill.json');
            if (!fs.existsSync(skillConfigPath)) {
                continue;
            }

            const config = JSON.parse(fs.readFileSync(skillConfigPath, 'utf-8'));
            if (!config.name) {
                return this.error(`Skill config in package ${pkg} is invalid, missing name property`);
            }

            const skillName = kebabCase(config.name);
            if (skills.includes(skillName)) {
                return this.error(`Duplicate skill name ${skillName} in package ${pkg}, skill names must be unique`);
            }
            this.syncSkillMd(pkgPath, path.join(aiSkillPath, skillName));
            skills.push(skillName);
        }

        if (!skills.length) {
            return this.error(`No skill found in packages matching ${packageName}`);
        }
        this.success(`Copy AI skills successfully: ${skills.join(', ')}`);
    }

    private syncSkillMd(pkgPath: string, skillFolderPath: string) {
        const skillMdPath = path.join(pkgPath, 'SKILL.md');
        const newSkillPath = path.join(skillFolderPath, 'SKILL.md');

        if (fs.existsSync(skillMdPath)) {
            if (fs.existsSync(newSkillPath)) {
                fs.rmSync(skillFolderPath, { recursive: true, force: true });
            }
            fs.mkdirSync(skillFolderPath, { recursive: true });
            fs.symlinkSync(skillMdPath, newSkillPath);
        }
    }

    private getAllPackages(): string[] {
        const modules = fs.readdirSync('./node_modules');
        return modules.flatMap((dir) => {
            if (dir.startsWith('@')) {
                return fs.readdirSync(`./node_modules/${dir}`).map((pkg) => `${dir}/${pkg}`);
            }
            return [dir];
        });
    }
}
