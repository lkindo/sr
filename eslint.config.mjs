import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

import simpleImportSort from 'eslint-plugin-simple-import-sort';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const nodeGlobals = globals.node;

const eslintConfig = [
  {
    ignores: [
      '.agent/',
      '.next/',
      '.next-e2e/',
      'node_modules/',
      'coverage/',
      'dist/',
      '**/*.config.js',
      '**/*.config.ts',
      '**/.stryker-tmp/**',
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
    // 순수 Node 스크립트. `.ts` 스크립트는 typescript-eslint 가 no-undef 를 꺼주지만
    // `.mjs` 는 그렇지 않아 process/console 이 전부 no-undef 로 잡힌다.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: nodeGlobals,
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
  {
    /**
     * 디자인 토큰 강제 (fe-rules §3.2).
     *
     * 색상 hex 리터럴을 컴포넌트에 하드코딩하면 테마 토큰이 무시된다. 이 프로젝트는
     * 다크 캔버스(#090909)인데 과거 라이트 스펙 팔레트가 문서상 정본이던 시기에
     * `bg-[#f8fafc]` 같은 값이 그대로 들어와 **흰 패널 위 흰 글씨**가 실제로 만들어졌다.
     * 정본을 `docs/DESIGN.md` 하나로 못 박았으므로 재유입을 여기서 막는다.
     */
    files: ['src/**/*.tsx', 'src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'Literal[value=/(?:bg|text|border|ring|fill|stroke|from|via|to|shadow)-.#[0-9a-fA-F]{3,8}/]',
          message:
            '색상 hex 리터럴 대신 디자인 토큰 클래스를 쓰세요(bg-background / text-foreground / bg-muted / border-border 등). 정본: docs/DESIGN.md, fe-rules §3.2.',
        },
        {
          selector:
            'TemplateElement[value.raw=/(?:bg|text|border|ring|fill|stroke|from|via|to|shadow)-.#[0-9a-fA-F]{3,8}/]',
          message:
            '색상 hex 리터럴 대신 디자인 토큰 클래스를 쓰세요(bg-background / text-foreground / bg-muted / border-border 등). 정본: docs/DESIGN.md, fe-rules §3.2.',
        },
      ],
    },
  },
];

export default eslintConfig;
