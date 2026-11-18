/* eslint-disable max-lines-per-function */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../tests/fixtures/sdk-fixture.microservice.js';
import { SdkDescriptorService } from '../services/sdk-descriptor.service.js';
import { SdkBuildConfigType } from '../types/sdk-build-config.type.js';

const generators = vi.hoisted(() => ({ ts: vi.fn(), rust: vi.fn(), go: vi.fn(), warn: vi.fn(), assertTools: vi.fn() }));
const tools = vi.hoisted(() => ({
    protoc: { binary: 'protoc', install: 'install protoc' },
    prost: { binary: 'protoc-gen-prost', version: '0.4', install: 'install prost' },
    go: { binary: 'protoc-gen-go', version: '1.36', install: 'install go' }
}));

vi.mock('../services/generate-microservice.service.js', () => ({
    GenerateMicroserviceService: class {
        generate = generators.ts;
    }
}));
vi.mock('../services/rust-sdk-generator.service.js', () => ({
    RustSdkGeneratorService: class {
        static requiredTools = [tools.protoc, tools.prost];
        generate = generators.rust;
    }
}));
vi.mock('../services/go-sdk-generator.service.js', () => ({
    GoSdkGeneratorService: class {
        static requiredTools = [tools.protoc, tools.go];
        generate = generators.go;
    }
}));
vi.mock('../services/protoc.service.js', () => ({
    ProtocService: class {
        assertTools = generators.assertTools;
    }
}));
vi.mock('@nestjs/common', async (importOriginal) => {
    const original = await importOriginal<typeof import('@nestjs/common')>();
    return {
        ...original,
        Logger: class {
            warn = generators.warn;
            log = vi.fn();
            error = vi.fn();
        }
    };
});

const { generateSdk, resolveSdkLanguages } = await import('./generate.helper.js');

const tsOnly: SdkBuildConfigType = { name: 'fixturePkg', packageName: '@scope/sdk', output: 'sdk' };
const allLanguages: SdkBuildConfigType = {
    ...tsOnly,
    rust: { crateName: 'sdk', output: 'sdk-rust' },
    go: { module: 'example.com/sdk', output: 'sdk-go' }
};

describe('resolveSdkLanguages', () => {
    it('builds only TypeScript when no other block is configured', () => {
        expect(resolveSdkLanguages(tsOnly)).toEqual(['ts']);
    });

    it('builds every configured language when none is requested', () => {
        expect(resolveSdkLanguages(allLanguages)).toEqual(['ts', 'rust', 'go']);
    });

    it('builds only the requested languages', () => {
        expect(resolveSdkLanguages(allLanguages, ['go'])).toEqual(['go']);
    });

    it('rejects an unknown language', () => {
        expect(() => resolveSdkLanguages(allLanguages, ['python' as any])).toThrow(
            'Unknown SDK language "python". Use ts, rust or go.'
        );
    });
});

describe('generateSdk', () => {
    beforeEach(() => {
        Object.values(generators).forEach((mock) => mock.mockReset());
    });

    it('keeps building only TypeScript for an existing config', () => {
        generateSdk(tsOnly);

        expect(generators.ts).toHaveBeenCalledTimes(1);
        expect(generators.rust).not.toHaveBeenCalled();
        expect(generators.go).not.toHaveBeenCalled();
    });

    it('builds every configured language', () => {
        generateSdk(allLanguages);

        expect(generators.ts).toHaveBeenCalledTimes(1);
        expect(generators.rust).toHaveBeenCalledTimes(1);
        expect(generators.go).toHaveBeenCalledTimes(1);
    });

    it('builds a single requested language', () => {
        generateSdk(allLanguages, ['rust']);

        expect(generators.ts).not.toHaveBeenCalled();
        expect(generators.rust).toHaveBeenCalledTimes(1);
        expect(generators.go).not.toHaveBeenCalled();
    });

    it('fails before generating anything when a requested language has no config block', () => {
        expect(() => generateSdk(tsOnly, ['ts', 'go'])).toThrow(
            'Language "go" was requested but the SDK config has no "go" block'
        );
        expect(generators.ts).not.toHaveBeenCalled();
    });

    it('describes the microservices once and hands the same descriptor to the Rust and Go generators', () => {
        const describeSpy = vi.spyOn(SdkDescriptorService.prototype, 'describe');

        try {
            generateSdk(allLanguages);

            expect(describeSpy).toHaveBeenCalledTimes(1);
            const [{ value: descriptor }] = describeSpy.mock.results;
            expect(descriptor.services.map((service) => service.name)).toContain('SdkFixtureMicroservice');
            expect(generators.rust.mock.calls[0][0]).toBe(descriptor);
            expect(generators.go.mock.calls[0][0]).toBe(descriptor);
        } finally {
            describeSpy.mockRestore();
        }
    });

    it('warns about nullable primitive responses when building Rust or Go', () => {
        generateSdk(allLanguages, ['go']);

        expect(generators.warn).toHaveBeenCalledWith(expect.stringContaining('SdkFixtureMicroservice.maybeGetName'));
    });

    it('does not warn when only TypeScript is built', () => {
        generateSdk(allLanguages, ['ts']);

        expect(generators.warn).not.toHaveBeenCalled();
    });

    it('checks the tools of every Rust and Go target once, before any SDK is generated', () => {
        generators.assertTools.mockImplementation(() => {
            throw new Error('Missing or unsupported SDK build tools');
        });

        expect(() => generateSdk(allLanguages)).toThrow('Missing or unsupported SDK build tools');
        expect(generators.assertTools).toHaveBeenCalledTimes(1);
        expect(generators.assertTools).toHaveBeenCalledWith([tools.protoc, tools.prost, tools.go]);
        expect(generators.ts).not.toHaveBeenCalled();
        expect(generators.rust).not.toHaveBeenCalled();
        expect(generators.go).not.toHaveBeenCalled();
    });

    it('checks only the tools of the requested targets', () => {
        generateSdk(allLanguages, ['ts', 'go']);

        expect(generators.assertTools).toHaveBeenCalledWith([tools.protoc, tools.go]);
    });

    it('does not check SDK build tools when only TypeScript is built', () => {
        generateSdk(allLanguages, ['ts']);

        expect(generators.assertTools).not.toHaveBeenCalled();
    });
});
