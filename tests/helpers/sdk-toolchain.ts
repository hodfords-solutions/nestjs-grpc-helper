import { GO_SDK_TOOLCHAIN, RUST_SDK_TOOLCHAIN } from '../../lib/constants/sdk-toolchain.const.js';
import { findBinary, isVersionAtLeast, readBinaryVersion, runBinary } from '../../lib/helpers/shell.helper.js';
import { GoSdkGeneratorService } from '../../lib/services/go-sdk-generator.service.js';
import { ProtocService } from '../../lib/services/protoc.service.js';
import { RustSdkGeneratorService } from '../../lib/services/rust-sdk-generator.service.js';

// The first cargo build downloads and compiles tonic.
export const BUILD_TIMEOUT = 20 * 60_000;

function readGoVersion(): string | null {
    try {
        return /go(\d+\.\d+(?:\.\d+)?)/.exec(runBinary('go', ['version']))?.[1] ?? null;
    } catch {
        return null;
    }
}

// protoc and the plugins, checked exactly like generateSdk checks them (presence and pinned version)
function findUnusablePlugins(): string[] {
    const tools = [...RustSdkGeneratorService.requiredTools, ...GoSdkGeneratorService.requiredTools].filter(
        (tool, index, all) => all.findIndex((other) => other.binary === tool.binary) === index
    );
    try {
        new ProtocService().assertTools(tools);
        return [];
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return message
            .split('\n')
            .filter((line) => line.startsWith('- '))
            .map((line) => line.slice(2));
    }
}

// A tool that is missing, or too old for the generated code, is unusable. An unreadable version counts as usable.
export function findUnusableTools(): string[] {
    const compilers: Record<string, { read: () => string | null; minimum: string }> = {
        cargo: { read: () => readBinaryVersion('cargo'), minimum: RUST_SDK_TOOLCHAIN.minRustVersion },
        go: { read: readGoVersion, minimum: GO_SDK_TOOLCHAIN.goVersion }
    };
    const unusable = findUnusablePlugins();
    for (const [tool, check] of Object.entries(compilers)) {
        if (!findBinary(tool)) {
            unusable.push(`${tool} (not on PATH)`);
            continue;
        }
        const actual = check.read();
        if (actual && !isVersionAtLeast(actual, check.minimum)) {
            unusable.push(`${tool} ${actual} (need ${check.minimum} or newer)`);
        }
    }
    return unusable;
}
