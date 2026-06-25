import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 테스트 설정
 * 문서: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* 테스트 timeout 설정 */
  timeout: 60 * 1000, // 30초 → 60초로 증가 (Profile 페이지 로딩 고려)

  /* Expect assertion timeout */
  expect: {
    timeout: 10 * 1000, // 5초 → 10초로 증가
  },

  /* 병렬 테스트 실행 */
  fullyParallel: true,

  /* CI에서 실패 시 재시도 (로컬에서도 1회 재시도) */
  retries: process.env.CI ? 2 : 1,

  /* 병렬 워커 수 (CI에서는 1개만) */
  workers: process.env.CI ? 1 : undefined,

  /* 리포터 설정 */
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'test-results', open: 'never' }]],

  /* Global Setup - 로그인 상태 저장 */
  globalSetup: require.resolve('./e2e/global-setup'),

  /* 모든 테스트에 공통 설정 */
  use: {
    /* Base URL */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* 저장된 인증 상태 사용 */
    storageState: './playwright/.auth/user.json',

    /* Action timeout */
    actionTimeout: 15 * 1000, // 기본 액션 timeout 15초

    /* Navigation timeout */
    navigationTimeout: 30 * 1000, // 페이지 이동 timeout 30초

    /* 실패 시 스크린샷 촬영 */
    screenshot: 'only-on-failure',

    /* 실패 시 비디오 녹화 */
    video: 'retain-on-failure',

    /* 네트워크 요청 트레이스 */
    trace: 'on-first-retry',

    /* E2E 테스트 실행 시 환경 변수 검증 건너뛰기 */
    launchOptions: {
      env: {
        ...process.env,
        SKIP_ENV_VALIDATION: 'true',
        PLAYWRIGHT_TEST: 'true',
      },
    },
  },

  /* 테스트 실행 전 개발 서버 시작 (선택사항) */
  // 수동으로 개발 서버를 실행하려면 아래를 주석 처리하세요
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: {
          TEST_MODE: 'true',
        },
      },

  /* 테스트할 브라우저 설정 */
  projects: [
    // Setup project - 로그인 상태 저장 (단일 사용자)
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },

    // Multi-user setup - 다중 사용자 인증 상태 저장 (CLIENT, MANAGER, ENGINEER)
    {
      name: 'multi-user-setup',
      testMatch: /auth-multi-user\.setup\.ts/,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },

    // Chromium 테스트 - setup에 의존 (일반 기능 테스트)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './playwright/.auth/user.json',
      },
      dependencies: ['setup'],
      // 멀티 유저 테스트 파일 제외 (중복 실행 방지)
      testIgnore: [
        '**/08-*.spec.ts',
        '**/09-*.spec.ts',
        '**/17-*.spec.ts',
        '**/18-*.spec.ts',
        '**/19-*.spec.ts',
        '**/20-*.spec.ts',
        '**/21-*.spec.ts',
        '**/22-*.spec.ts',
        '**/23-*.spec.ts',
      ],
    },

    // Multi-user 테스트 - multi-user-setup에 의존 (권한별 테스트)
    {
      name: 'multi-user',
      testMatch: /(08|09|17|18|19|20|21|22|23)-.*\.spec\.ts/,
      // Serial 테스트에서 retry 시 상태 초기화 문제 방지
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        // 다중 사용자 테스트는 각 테스트 내에서 storageState를 동적으로 설정
      },
      dependencies: ['multi-user-setup'],
    },

    // 권한 테스트 (단독 실행 가능)
    {
      name: 'permissions',
      testMatch: /sr-permissions\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['multi-user-setup'],
    },

    /* 추가 브라우저 테스트 (선택사항) */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    /* 모바일 뷰포트 테스트 */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],
});
