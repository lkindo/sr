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
          // 로그인은 `login:${email}:${ip}` 키로 STRICT(기본 1분 5회) 제한을 받는다.
          // 스위트는 페르소나마다 로그인하고 재시도까지 하므로 그 한도를 금방 넘긴다.
          // 그러면 로그인 폼이 비활성 상태로 굳으면서 setup 이 실패하는데, 증상만 보면
          // 로그인이 깨진 것처럼 보여 원인을 엉뚱한 데서 찾게 된다.
          //
          // 제한 자체는 켜 둔다 — 끄면 로그인 스로틀 회귀를 E2E 가 놓친다.
          // 한도만 스위트가 정상 동작하는 선까지 올린다.
          RATE_LIMIT_STRICT_MAX_REQUESTS: process.env.RATE_LIMIT_STRICT_MAX_REQUESTS ?? '100',
          // STRICT 만 올리면 반쪽이다. src/proxy.ts 는 그와 별개로 `/api/*` 전부에
          // IP 단위 버킷(RATE_LIMIT_MIDDLEWARE_*, 미설정 시 1분 100회)을 건다.
          // E2E 트래픽은 전부 127.0.0.1 이라 이 한 버킷을 모든 워커가 나눠 쓴다.
          // 실측: 갓 띄운 서버에 `/api/auth/session` 을 연속 호출하면 정확히 100번째부터
          // 429 가 떨어진다. 로그인 상태의 모든 페이지가 /api/realtime SSE 까지 여는 만큼
          // global-setup 의 워밍업만으로도 이 예산은 쉽게 닿는다.
          //
          // 여기서도 제한을 끄지는 않는다 — 끄면 API 스로틀 회귀를 E2E 가 놓친다.
          RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS:
            process.env.RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS ?? '2000',
        },
      },

  /* 테스트할 브라우저 설정 */
  projects: [
    // Setup project - 로그인 상태 저장 (단일 관리자)
    // 이전에는 testMatch가 global-setup.ts를 가리켰는데 그 파일에는 test()가 없어
    // 아무것도 실행되지 않는 빈 프로젝트였다. 역할 단언이 있는 auth.setup.ts로 교체한다.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },

    // Multi-user setup - 기존 페르소나 인증 상태 저장 (CLIENT, legacy-manager=ADMIN, ENGINEER)
    // @role-persona 태그가 붙은 신규 역할 페르소나는 제외한다 (아래 role-persona-setup 담당).
    {
      name: 'multi-user-setup',
      testMatch: /auth-multi-user\.setup\.ts/,
      grepInvert: /@role-persona/,
      use: {
        storageState: { cookies: [], origins: [] },
      },
    },

    // Role-persona setup - MANAGER / CLIENT_ADMIN 전용 인증 상태 저장
    // 시드에 해당 계정이 없으면 이 프로젝트만 실패하고 기존 스위트는 계속 돈다.
    // 이 프로젝트 자체가 게이트다: 페르소나가 기대한 역할이 아니면 여기서 빨갛게 죽는다.
    {
      name: 'role-persona-setup',
      testMatch: /auth-multi-user\.setup\.ts/,
      grep: /@role-persona/,
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
      // 이 프로젝트가 수집하는 스펙은 user.json(setup) 외에 manager.json / engineer.json 도 읽는다.
      //   - 06-sr-update.spec.ts: test.use({ storageState: manager.json })
      //   - sr-permissions.spec.ts: beforeAll 이 manager.json, ENGINEER describe 가 engineer.json
      // 두 파일은 multi-user-setup 이 만든다. 의존을 적지 않으면 순서 보장이 없어
      // 없거나 만료된 인증 파일로 돌 수 있다.
      dependencies: ['setup', 'multi-user-setup'],
      // 멀티 유저 테스트 파일 제외 (중복 실행 방지)
      testIgnore: [
        '**/roles/**',
        '**/08-*.spec.ts',
        '**/09-*.spec.ts',
        '**/17-*.spec.ts',
        '**/18-*.spec.ts',
        '**/19-*.spec.ts',
        '**/21-*.spec.ts',
        '**/22-*.spec.ts',
        '**/23-*.spec.ts',
      ],
    },

    // Multi-user 테스트 - multi-user-setup에 의존 (권한별 테스트)
    {
      name: 'multi-user',
      // 20-notification-system 은 삭제했다. 앱에 /notifications 라우트도 알림 벨 UI 도
      // 없어서(알림은 서버 사이드 outbox/listener 뿐이다) 12개 테스트가 전부
      // "요소를 못 찾음 → 로그 → 통과" 였다. 알림 회귀는 notification-outbox.test.ts 와
      // sr-notification.listener.test.ts 가 덮는다.
      testMatch: /(08|09|17|18|19|21|22|23)-.*\.spec\.ts/,
      // Serial 테스트에서 retry 시 상태 초기화 문제 방지
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        // 다중 사용자 테스트는 각 테스트 내에서 storageState를 동적으로 설정
      },
      // 08 / 09 / 23 은 test.use({ storageState: user.json }) 로 ADMIN 세션을 쓴다.
      // user.json 은 multi-user-setup 이 아니라 setup 이 만들므로 둘 다 의존해야 한다.
      dependencies: ['setup', 'multi-user-setup'],
    },

    // 역할 페르소나 테스트 - MANAGER / CLIENT_ADMIN 전용 스펙 (e2e/roles/*.spec.ts)
    // 스펙은 helpers/auth-helpers.ts의 PERSONA_AUTH_FILES.manager / .clientAdmin를 사용한다.
    {
      name: 'role-personas',
      testMatch: /roles[\\/].*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      // 스펙이 test.use 로 페르소나 파일을 지정하지 않으면 설정 최상단의 기본값
      // './playwright/.auth/user.json'(= setup 이 만드는 ADMIN 세션)으로 떨어진다.
      // 그 파일의 생성 순서를 보장하려면 setup 에도 의존해야 한다.
      // 주의: 그 폴백은 ADMIN 세션이므로, test.use 를 빠뜨린 MANAGER/CLIENT_ADMIN 스펙은
      //       "권한이 있다"는 쪽으로 조용히 통과할 수 있다. 스펙은 반드시
      //       PERSONA_AUTH_FILES.manager / .clientAdmin 를 명시할 것.
      dependencies: ['setup', 'role-persona-setup'],
    },

    // 권한 테스트 (단독 실행 가능)
    {
      name: 'permissions',
      testMatch: /sr-permissions\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
      // sr-permissions.spec.ts 의 첫 describe 는 storageState 를 지정하지 않아
      // 설정 최상단 기본값 './playwright/.auth/user.json'(setup 산출물)으로 동작하고,
      // beforeAll 은 manager.json, 두 번째 describe 는 engineer.json(multi-user-setup 산출물)을 쓴다.
      // 기존에는 multi-user-setup 만 의존해 user.json 의 생성 순서가 전혀 보장되지 않았다.
      dependencies: ['setup', 'multi-user-setup'],
    },

    /* 크로스 브라우저(firefox / webkit / Mobile Chrome) 프로젝트는 제거했다.
     *
     * 셋 다 testIgnore 가 없어 멀티유저 스펙(08/09/17~23)까지 수집했고, 그 스펙들은
     * manager/engineer/client.json(multi-user-setup 산출물)을 읽는다. 단일 인증 상태로
     * 멀티유저 스펙을 중복 실행하는 구조적 결함이라 dependencies 를 더해도 초록불이
     * 되지 않아, ci-cd.yml 의 --project 선택에서 늘 빠져 있었다. 즉 "설정에는 있지만
     * 아무 데서도 돌지 않는" 상태였고, 그건 크로스 브라우저를 검증한다는 착각만 준다.
     *
     * 다시 켤 때는 dependencies 가 아니라 testIgnore 부터 맞출 것 — 멀티유저 스펙을
     * 제외하고 단일 인증으로 충분한 스펙만 수집하게 한 뒤 CI 의 --project 에 추가한다.
     */
  ],
});
