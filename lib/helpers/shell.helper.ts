import { spawnSync } from 'node:child_process';
import shelljs from 'shelljs';

const { exec } = shelljs;
// Compilers can print far more than spawnSync's 1 MiB default; past the limit the child is killed with ENOBUFS.
const maxOutputBytes = 64 * 1024 * 1024;

export function runCommand(command: string, cwd: string = process.cwd()): any {
    const result = exec(command, { silent: true, cwd: cwd });
    if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result;
}

export function findBinary(binary: string): string | null {
    const found = shelljs.which(binary);
    return found ? found.toString() : null;
}

/**
 * Runs a binary with an argument array (no shell, so paths with spaces are safe) and returns stdout.
 * stdin is closed immediately: protoc plugins read a request from stdin and would otherwise hang.
 */
export function runBinary(binary: string, args: string[], cwd: string = process.cwd()): string {
    const result = spawnSync(binary, args, { cwd, encoding: 'utf8', input: '', maxBuffer: maxOutputBytes });
    if (result.error) {
        throw new Error(`Unable to run ${binary}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${binary} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }
    return result.stdout;
}

export function readBinaryVersion(binary: string): string | null {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8', input: '', timeout: 5000 });
    if (result.error) {
        return null;
    }
    const match = /\d+\.\d+(?:\.\d+)?/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    return match ? match[0] : null;
}

/** Numeric comparison of dot-separated versions; missing parts count as 0. */
export function isVersionAtLeast(actual: string, minimum: string): boolean {
    const actualParts = actual.split('.').map(Number);
    const minimumParts = minimum.split('.').map(Number);
    const length = Math.max(actualParts.length, minimumParts.length);
    for (let index = 0; index < length; index++) {
        const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
        if (difference !== 0) {
            return difference > 0;
        }
    }
    return true;
}
