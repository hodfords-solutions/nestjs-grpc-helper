import { GenerateDocumentService } from '../services/generate-document.service.js';
import { GenerateMicroserviceService } from '../services/generate-microservice.service.js';
import { GenerateProtoService } from '../services/generate-proto.service.js';
import { GoSdkGeneratorService } from '../services/go-sdk-generator.service.js';
import { ProtocService } from '../services/protoc.service.js';
import { RustSdkGeneratorService } from '../services/rust-sdk-generator.service.js';
import { SdkDescriptorService } from '../services/sdk-descriptor.service.js';
import { SDK_LANGUAGES, SdkBuildConfigType, SdkLanguage } from '../types/sdk-build-config.type.js';
import { assertSdkOutputs } from './sdk-output.helper.js';

export function resolveSdkLanguages(config: SdkBuildConfigType, languages?: SdkLanguage[]): SdkLanguage[] {
    if (!languages?.length) {
        return SDK_LANGUAGES.filter((language) => language === 'ts' || Boolean(config[language]));
    }

    for (const language of languages) {
        if (!SDK_LANGUAGES.includes(language)) {
            throw new Error(`Unknown SDK language "${language}". Use ts, rust or go.`);
        }
    }
    return languages;
}

/**
 * Checks the tools of every requested Rust / Go target in one go, so a missing plugin fails the run
 * before any SDK (including the TypeScript one) is rewritten, and one error lists everything missing.
 */
function assertSdkTools(targets: SdkLanguage[]): void {
    // Both lists start with the same PROTOC_TOOL object, so a Set is enough to check protoc once
    const tools = new Set([
        ...(targets.includes('rust') ? RustSdkGeneratorService.requiredTools : []),
        ...(targets.includes('go') ? GoSdkGeneratorService.requiredTools : [])
    ]);
    if (tools.size) {
        new ProtocService().assertTools([...tools]);
    }
}

/**
 * Builds the SDKs described by `config`. Without `languages`, TypeScript is always built and Rust/Go
 * are built when their config block is present.
 */
export function generateSdk(config: SdkBuildConfigType, languages?: SdkLanguage[]) {
    const targets = resolveSdkLanguages(config, languages);
    assertSdkOutputs(config, targets);
    assertSdkTools(targets);

    // Described once for both generators, so each warning about the model is logged once per run
    const descriptor =
        targets.includes('rust') || targets.includes('go') ? new SdkDescriptorService().describe() : undefined;
    if (targets.includes('ts')) {
        new GenerateMicroserviceService(config).generate();
    }
    if (targets.includes('rust')) {
        new RustSdkGeneratorService(config).generate(descriptor);
    }
    if (targets.includes('go')) {
        new GoSdkGeneratorService(config).generate(descriptor);
    }
}

export function generateProtoService(packageName: string, dirPath: string) {
    new GenerateProtoService(packageName, dirPath).generate();
}

export function generateDocumentService(packageName: string) {
    return new GenerateDocumentService(packageName).generate();
}
