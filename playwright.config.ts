import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 테스트 설정
 * 문서: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  
  /* 병렬 테스트 실행 */
  fullyParallel: true,
  
  /* CI에서 실패 시 재시도 */
  retries: process.env.CI ? 2 : 0,
  
  /* 병렬 워커 수 (CI에서는 1개만) */
  workers: process.env.CI ? 1 : undefined,
  
  /* 리포터 설정 */
  reporter: 'html',
  
  /* Global Setup - 로그인 상태 저장 */
  globalSetup: require.resolve('./e2e/global-setup'),
  
  /* 모든 테스트에 공통 설정 */
  use: {
    /* Base URL */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    /* 저장된 인증 상태 사용 */
    storageState: './playwright/.auth/user.json',
    
    /* 실패 시 스크린샷 촬영 */
    screenshot: 'only-on-failure',
    
    /* 실패 시 비디오 녹화 */
    video: 'retain-on-failure',
    
    /* 네트워크 요청 트레이스 */
    trace: 'on-first-retry',
  },

  /* 테스트 실행 전 개발 서버 시작 (선택사항) */
  // 수동으로 개발 서버를 실행하려면 아래를 주석 처리하세요
  webServer: process.env.SKIP_WEBSERVER ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* 테스트할 브라우저 설정 */
  projects: [
    // Setup project - 로그인 상태 저장
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    
    // Chromium 테스트 - setup에 의존
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: './playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /* 추가 브라우저 테스트 (선택사항) */
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* 모바일 뷰포트 테스트 */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],
})

