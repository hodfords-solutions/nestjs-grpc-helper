import fs from 'fs-extra';
import path from 'node:path';
import { SdkBuildConfigType, SdkLanguage } from '../types/sdk-build-config.type.js';

/** Paths a generator may delete and rewrite. Everything else in the output directory is left alone. */
export const RUST_OWNED_PATHS = ['Cargo.toml', 'microservice.proto', 'src'];
export const GO_OWNED_PATHS = ['go.mod', 'microservice.proto', 'pb', 'client.go', 'errors.go', 'enums.go'];

/** True when `child` is `parent` itself or a directory below it. Both paths must be absolute. */
function isSameOrInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Rust and Go outputs are usually their own git repositories. Fail before anything is written when
 * an output could clobber the application or another SDK. An output that is the working directory or
 * one of its parents is rejected, because cleaning it would delete application files. An output that
 * is nested inside, or contains, the TypeScript `output` / `outputBuild` or the other SDK's output is
 * rejected too, because the TypeScript generator deletes its directories on every run.
 */
export function assertSdkOutputs(
    config: SdkBuildConfigType,
    languages: SdkLanguage[],
    cwd: string = process.cwd()
): void {
    const claimed = new Map<string, string>();
    for (const key of ['output', 'outputBuild'] as const) {
        if (config[key]) {
            claimed.set(path.resolve(cwd, config[key]), key);
        }
    }

    for (const language of ['rust', 'go'] as const) {
        if (!languages.includes(language)) {
            continue;
        }

        const block = config[language];
        if (!block) {
            throw new Error(`Language "${language}" was requested but the SDK config has no "${language}" block.`);
        }

        assertRequiredName(language, block);
        const label = `${language}.output`;
        if (!block.output) {
            throw new Error(`"${label}" is required in the SDK config.`);
        }

        const resolved = path.resolve(cwd, block.output);
        if (isSameOrInside(path.resolve(cwd), resolved)) {
            throw new Error(`"${label}" must not be the working directory or one of its parent directories.`);
        }

        assertSeparateFrom(label, resolved, claimed);
        claimed.set(resolved, label);
    }
}

function assertRequiredName(language: 'rust' | 'go', block: object): void {
    const requiredKey = language === 'go' ? 'module' : 'crateName';
    const requiredValue = (block as Record<string, unknown>)[requiredKey];
    if (typeof requiredValue !== 'string' || requiredValue.trim() === '') {
        throw new Error(`"${language}.${requiredKey}" is required in the SDK config.`);
    }
}

function assertSeparateFrom(label: string, resolved: string, claimed: Map<string, string>): void {
    for (const [claimedPath, owner] of claimed) {
        if (claimedPath === resolved) {
            throw new Error(`"${label}" is also used by "${owner}". Each SDK needs its own directory.`);
        }
        if (isSameOrInside(resolved, claimedPath) || isSameOrInside(claimedPath, resolved)) {
            throw new Error(
                `"${label}" and "${owner}" must not be nested inside one another. Each SDK needs its own directory.`
            );
        }
    }
}

export function cleanOwnedPaths(outputDir: string, ownedPaths: string[]): void {
    fs.ensureDirSync(outputDir);
    for (const ownedPath of ownedPaths) {
        fs.removeSync(path.join(outputDir, ownedPath));
    }
}

/** Created next to the output, on the same filesystem, so moving the generated files in is a rename. */
function createStagingDir(outputDir: string): string {
    const parentDir = path.dirname(outputDir);
    fs.ensureDirSync(parentDir);
    return fs.mkdtempSync(path.join(parentDir, `.${path.basename(outputDir)}-staging-`));
}

/** Replaces the owned paths of `outputDir` with the ones generated in `stagingDir`. Other files are kept. */
function replaceOwnedPaths(stagingDir: string, outputDir: string, ownedPaths: string[]): void {
    cleanOwnedPaths(outputDir, ownedPaths);
    for (const ownedPath of ownedPaths) {
        const stagedPath = path.join(stagingDir, ownedPath);
        if (fs.existsSync(stagedPath)) {
            fs.moveSync(stagedPath, path.join(outputDir, ownedPath));
        }
    }
}

/**
 * Runs `generate` in a staging directory and then replaces the owned paths of `outputDir` with what it wrote there.
 * Everything that can fail (proto generation, protoc) belongs in `generate`: a failure before the swap leaves the
 * existing SDK as it was.
 */
export function stageOwnedPaths(outputDir: string, ownedPaths: string[], generate: (stagingDir: string) => void): void {
    const stagingDir = createStagingDir(outputDir);
    try {
        generate(stagingDir);
        replaceOwnedPaths(stagingDir, outputDir, ownedPaths);
    } finally {
        fs.removeSync(stagingDir);
    }
}
