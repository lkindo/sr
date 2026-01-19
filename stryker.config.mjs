// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutator: {
    plugins: [],
  },
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'command',
  commandRunner: {
    command:
      'npx vitest run src/services/__tests__/sr.service.mutation.test.ts --config vitest.mutation.config.ts --test-timeout=60000',
  },
  coverageAnalysis: 'off',
  mutate: ['src/services/sr.service.ts'],
  concurrency: 1,
  timeoutMS: 30000,
  timeoutFactor: 2.5,
};
export default config;
