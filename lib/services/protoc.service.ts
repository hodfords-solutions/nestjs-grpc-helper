import { SdkToolRequirement } from '../constants/sdk-toolchain.const.js';
import { findBinary, readBinaryVersion, runBinary } from '../helpers/shell.helper.js';

export class ProtocService {
    /**
     * Generated stubs only compile against matching runtime libraries, so a plugin outside the pinned
     * major.minor is rejected. A tool that does not report a version is accepted on its PATH presence.
     */
    assertTools(tools: SdkToolRequirement[]): void {
        const problems: string[] = [];

        for (const tool of tools) {
            if (!findBinary(tool.binary)) {
                problems.push(`- ${tool.binary} is not on PATH. Install: ${tool.install}`);
                continue;
            }
            if (!tool.version) {
                continue;
            }

            const actual = readBinaryVersion(tool.binary);
            if (actual && actual.split('.').slice(0, 2).join('.') !== tool.version) {
                problems.push(
                    `- ${tool.binary} ${actual} is not supported (need ${tool.version}.x). Install: ${tool.install}`
                );
            }
        }

        if (problems.length) {
            throw new Error(`Missing or unsupported SDK build tools:\n${problems.join('\n')}`);
        }
    }

    run(args: string[], cwd: string): void {
        runBinary('protoc', args, cwd);
    }
}
