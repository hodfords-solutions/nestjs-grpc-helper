import { describe, expect, it } from 'vitest';
import { findBinary, isVersionAtLeast, readBinaryVersion, runBinary } from './shell.helper.js';

describe('shell.helper', () => {
    it('finds a binary that is on PATH', () => {
        expect(findBinary('node')).toEqual(expect.any(String));
    });

    it('returns null for a binary that is not on PATH', () => {
        expect(findBinary('definitely-not-a-real-binary-xyz')).toBeNull();
    });

    it('returns stdout of a successful command', () => {
        expect(runBinary(process.execPath, ['-e', 'console.log("ok")'])).toBe('ok\n');
    });

    it('throws with stderr when the command exits non-zero', () => {
        expect(() => runBinary(process.execPath, ['-e', 'console.error("boom"); process.exit(2)'])).toThrow('boom');
    });

    it('keeps large output of a failing command instead of failing with ENOBUFS', () => {
        const script =
            "require('fs').writeSync(2, 'x'.repeat(2 * 1024 * 1024) + 'END-OF-OUTPUT'); process.exitCode = 1";

        expect(() => runBinary(process.execPath, ['-e', script])).toThrow(/x{1000}END-OF-OUTPUT$/);
        expect(() => runBinary(process.execPath, ['-e', script])).not.toThrow('ENOBUFS');
    });

    it('throws when the binary cannot be started', () => {
        expect(() => runBinary('definitely-not-a-real-binary-xyz', [])).toThrow(
            'Unable to run definitely-not-a-real-binary-xyz'
        );
    });

    it('reads the first version number from --version output', () => {
        expect(readBinaryVersion(process.execPath)).toBe(process.versions.node);
    });

    it('returns null when the binary is missing', () => {
        expect(readBinaryVersion('definitely-not-a-real-binary-xyz')).toBeNull();
    });

    it('compares dot-separated versions numerically, treating missing parts as 0', () => {
        expect(isVersionAtLeast('1.85.0', '1.85')).toBe(true);
        expect(isVersionAtLeast('1.80.0', '1.85')).toBe(false);
        expect(isVersionAtLeast('1.100.0', '1.85')).toBe(true);
        expect(isVersionAtLeast('2.0', '1.85')).toBe(true);
        expect(isVersionAtLeast('1.23', '1.23')).toBe(true);
        expect(isVersionAtLeast('1.20.2', '1.23')).toBe(false);
        expect(isVersionAtLeast('1.85', '1.85.1')).toBe(false);
    });
});
