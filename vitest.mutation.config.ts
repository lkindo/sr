import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node', // Use node environment for service tests, faster than jsdom
        globals: true,
        include: ['src/services/__tests__/sr.service.mutation.test.ts'],
        alias: {
            '@': path.resolve(__dirname, './src'),
            'next/server': path.resolve(__dirname, './src/__tests__/mocks/next-server.ts'),
            'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next-navigation.ts'),
            'next/cache': path.resolve(__dirname, './src/__tests__/mocks/next-cache.ts'),
            'server-only': path.resolve(__dirname, './src/__tests__/mocks/server-only.ts'),
        },
        isolate: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            'next/server': path.resolve(__dirname, './src/__tests__/mocks/next-server.ts'),
            'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next-navigation.ts'),
            'next/cache': path.resolve(__dirname, './src/__tests__/mocks/next-cache.ts'),
            'server-only': path.resolve(__dirname, './src/__tests__/mocks/server-only.ts'),
        },
    },
});
