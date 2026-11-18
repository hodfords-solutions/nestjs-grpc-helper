/* eslint-disable max-lines-per-function */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocService } from './protoc.service.js';

vi.mock('../helpers/shell.helper.js', () => ({
    findBinary: vi.fn(),
    readBinaryVersion: vi.fn(),
    runBinary: vi.fn()
}));

const { findBinary, readBinaryVersion, runBinary } = await import('../helpers/shell.helper.js');

describe('ProtocService', () => {
    const tools = [
        { binary: 'protoc', install: 'brew install protobuf' },
        { binary: 'protoc-gen-go', version: '1.36', install: 'go install protoc-gen-go@v1.36.6' }
    ];

    beforeEach(() => {
        vi.mocked(findBinary).mockReset().mockReturnValue('/usr/bin/tool');
        vi.mocked(readBinaryVersion).mockReset().mockReturnValue('1.36.6');
        vi.mocked(runBinary).mockReset();
    });

    it('accepts tools that are present in a supported version', () => {
        expect(() => new ProtocService().assertTools(tools)).not.toThrow();
    });

    it('does not read the version of a tool without a version requirement', () => {
        new ProtocService().assertTools([tools[0]]);

        expect(readBinaryVersion).not.toHaveBeenCalled();
    });

    it('lists every missing tool with its install command in one error', () => {
        vi.mocked(findBinary).mockReturnValue(null);

        expect(() => new ProtocService().assertTools(tools)).toThrow(
            'Missing or unsupported SDK build tools:\n' +
                '- protoc is not on PATH. Install: brew install protobuf\n' +
                '- protoc-gen-go is not on PATH. Install: go install protoc-gen-go@v1.36.6'
        );
    });

    it('rejects a tool whose major.minor differs from the pinned one', () => {
        vi.mocked(readBinaryVersion).mockReturnValue('1.35.2');

        expect(() => new ProtocService().assertTools(tools)).toThrow(
            '- protoc-gen-go 1.35.2 is not supported (need 1.36.x). Install: go install protoc-gen-go@v1.36.6'
        );
    });

    it('accepts a tool that does not report a version', () => {
        vi.mocked(readBinaryVersion).mockReturnValue(null);

        expect(() => new ProtocService().assertTools(tools)).not.toThrow();
    });

    it('runs protoc with the given arguments and working directory', () => {
        new ProtocService().run(['--go_out=.', 'microservice.proto'], '/work/sdk-go');

        expect(runBinary).toHaveBeenCalledWith('protoc', ['--go_out=.', 'microservice.proto'], '/work/sdk-go');
    });
});
