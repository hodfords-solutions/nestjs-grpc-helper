/* eslint-disable max-lines-per-function */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { assertSdkOutputs, cleanOwnedPaths, GO_OWNED_PATHS } from './sdk-output.helper.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';

const baseConfig: SdkBuildConfigType = {
    name: 'sdkName',
    packageName: '@scope/sdk',
    output: 'sdk',
    outputBuild: 'sdkBuild'
};

describe('assertSdkOutputs', () => {
    const cwd = '/work/app';

    it('accepts separate directories, including ones outside the working directory', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'sdk-rust' },
            go: { module: 'example.com/sdk', output: '../sdk-go' }
        };

        expect(() => assertSdkOutputs(config, ['ts', 'rust', 'go'], cwd)).not.toThrow();
    });

    it('rejects an output that is the working directory', () => {
        const config = { ...baseConfig, go: { module: 'example.com/sdk', output: '.' } };

        expect(() => assertSdkOutputs(config, ['go'], cwd)).toThrow('"go.output" must not be the working directory');
    });

    it('rejects an output that is a parent of the working directory', () => {
        const config = { ...baseConfig, go: { module: 'example.com/sdk', output: '..' } };

        expect(() => assertSdkOutputs(config, ['go'], cwd)).toThrow(
            '"go.output" must not be the working directory or one of its parent directories'
        );
    });

    it('rejects an absolute output that is a parent of the working directory', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: '/work' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow(
            '"rust.output" must not be the working directory or one of its parent directories'
        );
    });

    it('rejects an output shared with the TypeScript output', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: './sdk' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow('"rust.output" is also used by "output"');
    });

    it('rejects an output shared with the TypeScript build output', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: 'sdkBuild' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow('"rust.output" is also used by "outputBuild"');
    });

    it('rejects rust and go sharing a directory', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'native' },
            go: { module: 'example.com/sdk', output: 'native' }
        };

        expect(() => assertSdkOutputs(config, ['rust', 'go'], cwd)).toThrow(
            '"go.output" is also used by "rust.output"'
        );
    });

    it('rejects a requested language without a config block', () => {
        expect(() => assertSdkOutputs(baseConfig, ['rust'], cwd)).toThrow(
            'Language "rust" was requested but the SDK config has no "rust" block'
        );
    });

    it('rejects an SDK output inside the TypeScript output', () => {
        const config = { ...baseConfig, removeOutput: true, rust: { crateName: 'sdk', output: 'sdk/rust' } };

        expect(() => assertSdkOutputs(config, ['ts', 'rust'], cwd)).toThrow(
            '"rust.output" and "output" must not be nested inside one another. Each SDK needs its own directory.'
        );
    });

    it('rejects an SDK output inside the TypeScript build output', () => {
        const config = { ...baseConfig, go: { module: 'example.com/sdk', output: 'sdkBuild/go' } };

        expect(() => assertSdkOutputs(config, ['go'], cwd)).toThrow(
            '"go.output" and "outputBuild" must not be nested inside one another. Each SDK needs its own directory.'
        );
    });

    it('rejects an SDK output that contains the TypeScript output', () => {
        const config = { ...baseConfig, output: 'out/ts', rust: { crateName: 'sdk', output: 'out' } };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow(
            '"rust.output" and "output" must not be nested inside one another. Each SDK needs its own directory.'
        );
    });

    it('rejects a go output nested inside the rust output', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'native' },
            go: { module: 'example.com/sdk', output: 'native/go' }
        };

        expect(() => assertSdkOutputs(config, ['rust', 'go'], cwd)).toThrow(
            '"go.output" and "rust.output" must not be nested inside one another. Each SDK needs its own directory.'
        );
    });

    it('accepts a directory whose name only starts with another output name', () => {
        const config = {
            ...baseConfig,
            rust: { crateName: 'sdk', output: 'sdk-rust' },
            go: { module: 'example.com/sdk', output: 'sdkBuild-go' }
        };

        expect(() => assertSdkOutputs(config, ['rust', 'go'], cwd)).not.toThrow();
    });

    it('rejects a built go block without a module', () => {
        const config = { ...baseConfig, go: { module: '', output: 'sdk-go' } };

        expect(() => assertSdkOutputs(config, ['go'], cwd)).toThrow('"go.module" is required in the SDK config.');
    });

    it('rejects a built rust block without a crate name', () => {
        const config = { ...baseConfig, rust: { output: 'sdk-rust' } as any };

        expect(() => assertSdkOutputs(config, ['rust'], cwd)).toThrow(
            '"rust.crateName" is required in the SDK config.'
        );
    });

    it('ignores blocks for languages that are not being built', () => {
        const config = { ...baseConfig, rust: { crateName: 'sdk', output: '.' } };

        expect(() => assertSdkOutputs(config, ['ts'], cwd)).not.toThrow();
    });
});

describe('cleanOwnedPaths', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-output-'));
    });

    afterEach(() => {
        fs.removeSync(dir);
    });

    it('removes owned paths and keeps everything else', () => {
        fs.outputFileSync(path.join(dir, '.git/HEAD'), 'ref');
        fs.outputFileSync(path.join(dir, 'go.sum'), 'sum');
        fs.outputFileSync(path.join(dir, 'README.md'), 'readme');
        fs.outputFileSync(path.join(dir, 'pb/old.pb.go'), 'old');
        fs.outputFileSync(path.join(dir, 'client.go'), 'old');

        cleanOwnedPaths(dir, GO_OWNED_PATHS);

        expect(fs.existsSync(path.join(dir, '.git/HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'go.sum'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'pb'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'client.go'))).toBe(false);
    });

    it('creates the output directory when it does not exist', () => {
        const target = path.join(dir, 'nested/sdk-go');

        cleanOwnedPaths(target, GO_OWNED_PATHS);

        expect(fs.existsSync(target)).toBe(true);
    });
});
