import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.next/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 70,
      },
      exclude: [
        'node_modules/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        'tests/',
        'e2e/',
        'src/repositories/**',
        'src/services/**',
        'src/lib/redis-cache.ts',
        'src/lib/logger.ts',
        'src/lib/prisma.ts',
      ],
    },
    alias: {
      'next/server': path.resolve(__dirname, './src/__tests__/mocks/next-server.ts'),
      'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next-navigation.ts'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

