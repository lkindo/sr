// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

import simpleImportSort from 'eslint-plugin-simple-import-sort';
import reactHooks from 'eslint-plugin-react-hooks';

const eslintConfig = [
  {
    ignores: [
      '.agent/',
      '.next/',
      'node_modules/',
      'coverage/',
      'dist/',
      '**/*.config.js',
      '**/*.config.ts',
      '**/.stryker-tmp/**',
      // Storybook 빌드 결과물 및 관련 파일 제외
      'storybook-static/',
      '.storybook/',
      '**/*.stories.ts',
      '**/*.stories.tsx',
      // 빌드 결과물 제외
      'public/sw.js',
      'public/workbox-*.js',
      // Playwright 테스트 결과 제외 (번들된 trace 파일)
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: {
      security: security,
      'simple-import-sort': simpleImportSort,
      'react-hooks': reactHooks,
    },
    rules: {
      // React 훅 규칙 (감사 4.4).
      //
      // 플러그인은 이미 설치되어 있었지만 이 설정에 연결되지 않아 한 번도 실행되지 않았다.
      // 실제로 이 규칙이 잡았어야 할 버그가 있었다 — IdleTimeoutProvider 의 자동 로그아웃이
      // 동작하지 않던 원인이 정확히 exhaustive-deps 위반이었다(감사 3.24).
      // effect 가 의존하는 값이 deps 에서 빠지면 그 effect 는 낡은 클로저를 붙들거나
      // 자기 자신을 취소한다 — 조용히 동작만 사라지므로 테스트 없이는 드러나지 않는다.
      //
      // 도입 시점 위반은 8건이었고, 4건은 useCallback 으로 실제 수정했으며
      // 나머지 4건은 의도된 동작이라 사유를 적은 disable 주석을 달았다.
      // 규칙의 값어치는 "그 판단을 눈에 보이게 만드는 것"이다.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      // Import sorting
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Side effect imports.
            ['^\\u0000'],
            // Packages. `react` related packages come first.
            ['^react', '^next', '^@?\\w'],
            // Internal packages.
            ['^@/'],
            // Parent imports. Put `..` last.
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            // Other relative imports. Put `.` last.
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            // Style imports.
            ['^.+\\.s?css$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'warn',
    },
  },
  {
    files: ['e2e/**/*', 'scripts/**/*', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-console': 'off',
      // Relax security rules for test files
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
  ...storybook.configs['flat/recommended'],
];

export default eslintConfig;
