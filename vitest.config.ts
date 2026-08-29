import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                target: 'es2023',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true }
            }
        })
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['{tests,test,lib,src}/**/*.{spec,test}.ts'],
        setupFiles: ['./vitest.setup.ts'],
        // Jest in this repo used the default timeout (5s); every test here runs under 1s.
        // 30s is generous enough without letting CI hang when a test genuinely breaks.
        testTimeout: 30_000,
        hookTimeout: 30_000,
        passWithNoTests: true,
        coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['lib/**/*.ts'] }
    }
});
