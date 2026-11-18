import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import { GenerateSdkCommand } from './generate-sdk.command.js';

vi.mock('../helpers/generate.helper.js', () => ({ generateSdk: vi.fn() }));

const { generateSdk } = await import('../helpers/generate.helper.js');

describe('GenerateSdkCommand', () => {
    let appDir: string;
    let cwdSpy;

    beforeEach(() => {
        appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-app-'));
        fs.writeJsonSync(path.join(appDir, 'sdk-config.json'), { name: 'fromApp', output: 'sdk' });
        cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(appDir);
    });

    afterEach(() => {
        cwdSpy.mockRestore();
        fs.removeSync(appDir);
        vi.mocked(generateSdk).mockReset();
    });

    const createCommand = (args: string[], options: Record<string, string> = {}): GenerateSdkCommand => {
        const command = new GenerateSdkCommand();
        (command as any).program = { args, opts: () => options };
        (command as any).success = vi.fn();
        return command;
    };

    it('reads the config from the application working directory', () => {
        createCommand([]).handle();

        expect(generateSdk).toHaveBeenCalledWith({ name: 'fromApp', output: 'sdk' }, undefined);
    });

    it('passes the language from --lang', () => {
        createCommand([], { lang: 'rust' }).handle();

        expect(generateSdk).toHaveBeenCalledWith({ name: 'fromApp', output: 'sdk' }, ['rust']);
    });

    it('rejects an unknown --lang value', () => {
        expect(() => createCommand([], { lang: 'python' }).handle()).toThrow(
            'Unknown --lang "python". Use ts, rust or go.'
        );
        expect(generateSdk).not.toHaveBeenCalled();
    });
});
