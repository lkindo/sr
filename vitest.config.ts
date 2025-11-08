import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
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
      exclude: [
        'node_modules/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/',
        'tests/',
        'e2e/',
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

