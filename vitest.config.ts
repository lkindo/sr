import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // 커버리지 분모를 "테스트가 우연히 import한 파일"이 아니라 "실제 소스 전체"로 고정한다.
      // include가 없으면 v8은 실행된 파일만 집계하므로, 테스트가 0개인 파일은 점수를 낮추는 대신
      // 아예 분모에서 사라진다(= 게이트가 순환 논리가 된다). 2026-07-30 측정 기준 include 이전에는
      // 소스 234개 중 111개(47.4%)만 분모에 들어와 있었고, API route 핸들러 41개 중 6개만 보였다.
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        // 테스트 코드 자체. 프로덕션 소스가 아니며, 분자/분모 양쪽을 부풀린다.
        // (include 이전에는 src/__tests__/mocks가 소스로 집계되고 있었다.)
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
        'src/**/mockData/**',
        // 타입 선언 전용. 런타임 코드가 0줄이라 집계 대상이 없다.
        // 주의: src/types/*.ts는 제외하지 않는다 — session.ts처럼 런타임 코드가 있는 파일이 섞여 있고,
        // 순수 타입 파일은 statement가 0개라 가중 평균에 영향을 주지 않는다.
        'src/**/*.d.ts',
        // Storybook 스토리. storybook 프로젝트가 별도로 실행하는 픽스처이지 프로덕션 코드가 아니다.
        'src/stories/**',
        'src/**/*.stories.ts',
        'src/**/*.stories.tsx',
        // Prisma가 생성하는 코드. 우리가 작성하지 않으므로 테스트 대상이 아니다.
        'src/generated/**',
        // 알려진 구멍: PrismaClient 싱글턴. import 시점에 DB 클라이언트를 생성하는 부작용이 있어
        // 단위 테스트에서 실행할 수 없다. 단 $transaction 래퍼(도메인/실시간 이벤트 flush)라는
        // 실제 로직을 품고 있으므로, 통합 테스트가 생기면 이 제외 항목을 먼저 없애야 한다.
        'src/lib/prisma.ts',
      ],
      // 참고: '**/*.config.*' 는 의도적으로 제외 목록에서 뺐다. src/auth.config.ts가 걸려드는데
      // 이 파일은 NextAuth authorized() 콜백(로그인/리다이렉트 인가 판정)을 담은 실제 소스이고
      // statement 11개 중 1개만 덮여 있다. 제외했다면 그 구멍이 그대로 감춰졌을 것이다.
      //
      // 기준선 — 2026-07-30, CI와 "동일한 명령"인 `pnpm test:coverage`(= vitest run --coverage,
      // unit + storybook 두 프로젝트 전부)로 실측:
      //   statements 41.27 / branches 35.63 / functions 41.98 / lines 40.75 (소스 232개)
      // 절대 개수: statements 3,026/7,331 · branches 1,785/5,009 · functions 710/1,691 ·
      //            lines 2,780/6,821.
      //
      // 참고로 include 도입 전에는 statements 84.39 / branches 74.77 / functions 77.17 /
      // lines 85.11 이었다(소스 111개). 84%는 코드가 좋아서가 아니라 분모가 절반이라 나온 숫자다.
      //
      // ── 왜 값을 올렸는가 ──────────────────────────────────────────────────
      // 이전 임계값(39.5/34.6/39.5/39.9)은 `--project=unit` 만 돌려 얻은 39.89/35.01/40.39/40.33
      // 기준이었다. 그러나 CI는 storybook 프로젝트까지 함께 도는 `pnpm test:coverage` 를 실행하고,
      // 그 수치는 위처럼 1.4~1.6%p 더 높다. 즉 게이트가 실제 달성치보다 그만큼 헐거웠다.
      // 옛 주석은 "테스트 없는 statement가 +73개 늘면 빨간불"이라고 적었지만, CI 실측치 기준으로
      // 다시 계산하면 +329개(functions는 +106개)까지 통과했다 — 실제보다 4~7배 헐거웠다는 뜻이다.
      //
      // ── 지금 임계값의 실제 민감도 (위 절대 개수로 계산) ───────────────────
      //   statements 40.9% -> 테스트 없는 statement가 +67개 늘면 빨간불
      //   branches   35.2% -> 테스트 없는 branch가    +62개 늘면 빨간불
      //   functions  41.6% -> 테스트 없는 function이  +15개 늘면 빨간불
      //   lines      40.4% -> 테스트 없는 line이      +60개 늘면 빨간불
      // functions 가 가장 빡빡하다. "테스트 없는 route 핸들러 한 개"(대략 함수 1~3개,
      // statement 20~40개) 수준이면 여러 번 반복될 때 functions 쪽에서 먼저 걸린다.
      // 한 번의 추가로 즉시 깨진다고까지는 말할 수 없다 — 옛 주석의 그 표현은 과장이었다.
      //
      // 값을 올릴 때는 반드시 `pnpm test:coverage` 로 재측정한 뒤 이 주석의 기준선·절대 개수·
      // 날짜를 함께 갱신할 것. 낮추는 것은 원칙적으로 금지 — 낮춰야 한다면 그게 바로 게이트가
      // 잡아낸 회귀다.
      //
      // ── 2026-08-05 래칫 ─────────────────────────────────────────────────
      // 감사 후속 작업으로 테스트가 늘면서(163 → 173 파일, 1597 → 1722 테스트)
      // `--project=unit` 실측이 다음과 같이 올랐다:
      //   statements 48.27 (3,681/7,626) · branches 41.84 (2,239/5,351) ·
      //   functions  46.91 (774/1,650)
      // 새로 덮인 것은 대부분 **인가 경로**다 — 감사가 지적한 결함들을 고치면서
      // 그 계약을 고정하는 테스트를 함께 넣었다:
      //   세션 재검증, Prisma 에러 매핑, 첨부 인가, 고객사 테넌트 경계,
      //   SR 상태 전이 사전조건, 댓글 내부노트 격리, SLA 정밀도, 액션 레이트리밋.
      //
      // 임계값은 실측보다 약 1%p 낮게 잡는다. 딱 붙이면 무해한 리팩터(테스트가 없던
      // 파일 한 개 추가 등)에도 빨간불이 떠서, 게이트를 신뢰하지 않고 숫자를 내리게 된다.
      // 이 버퍼는 CI 실측(storybook 프로젝트 포함)이 unit 단독보다 1.4~1.6%p 높다는
      // 점까지 함께 흡수한다.
      thresholds: {
        statements: 47.2,
        branches: 40.8,
        functions: 45.9,
        lines: 46.7,
      },
    },
    alias: {
      'next/server': path.resolve(dirname, './src/__tests__/mocks/next-server.ts'),
      'next/navigation': path.resolve(dirname, './src/__tests__/mocks/next-navigation.ts'),
      'next/cache': path.resolve(dirname, './src/__tests__/mocks/next-cache.ts'),
      'server-only': path.resolve(dirname, './src/__tests__/mocks/server-only.ts'),
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: [
            'src/stories/**',
            '**/node_modules/**',
            '**/dist/**',
            '**/e2e/**',
            '**/.next/**',
          ],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        // 실제 Postgres 에 붙는 통합 테스트(감사 3.37).
        //
        // 목 기반 테스트가 구조적으로 잡을 수 없는 세 부류만 다룬다:
        //   트랜잭션 롤백 / 테넌트 필터의 실제 실행 / 동시 채번 경쟁.
        //
        // **`tests/` 아래 두는 이유:** 루트 `test.include` 가 `src/**/*.test.ts` 라
        // 통합 테스트를 `src/` 안에 두면 unit 프로젝트가 jsdom + 가짜 DATABASE_URL 로
        // 함께 집어간다. 디렉터리를 분리하고 아래에서 `src/**` 를 명시 제외해
        // 두 프로젝트가 서로의 파일을 절대 집지 않게 한다.
        //
        // CI 의 test 잡은 이미 Postgres 서비스 + migrate deploy + seed 를 갖추고 있으므로
        // `pnpm test:coverage` 가 이 프로젝트도 함께 실행한다.
        extends: true,
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          exclude: ['src/**', '**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.next/**'],
          setupFiles: ['./vitest.integration.setup.ts'],
          // 같은 DB 를 공유하므로 파일 간 병렬 실행은 TRUNCATE 가 서로를 지우게 만든다.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
});
