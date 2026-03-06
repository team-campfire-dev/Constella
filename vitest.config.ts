import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        globals: true,
        include: ['src/**/*.test.ts'],
        setupFiles: ['src/test/setup.ts'],
        // Isolate test files to prevent side effects between modules
        pool: 'forks',
    },
});
