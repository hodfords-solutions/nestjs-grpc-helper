#!/usr/bin/env node
/**
 * Copy non-TypeScript assets into the build output.
 * Replaces the `assets` section of nest-cli.json now that the build runs `tsc` directly.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist', 'lib');

mkdirSync(dist, { recursive: true });

const assets = [
    ['lib/templates', 'templates'],
    ['lib/public', 'public'],
    ['lib/sdk-stub', 'sdk-stub'],
    ['sdk-config.json', 'sdk-config.json']
];

for (const [from, to] of assets) {
    const source = join(root, from);
    if (!existsSync(source)) {
        continue;
    }
    cpSync(source, join(dist, to), { recursive: true });
}
