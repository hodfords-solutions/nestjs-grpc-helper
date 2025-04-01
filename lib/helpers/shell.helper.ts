import { exec } from 'shelljs';

export function runCommand(command: string, cwd: string = process.cwd()): any {
    const result = exec(command, { silent: true, cwd: cwd });
    if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result;
}
