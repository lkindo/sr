import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// jsdom 이 **실제로 필요한** 파일만 추린 목록. 추정이 아니라 실측이다 —
// 2026-08-10 에 `src/**/*.test.ts` 149개 전량을 environment:'node' 로 돌린 결과
// 정확히 11개만 실패했고(테스트 1,486개 통과), 그 11개가 아래 두 글롭으로 떨어진다:
//   - src/hooks/__tests__/*.test.ts 10개 전부 (전원 renderHook 사용)
//   - src/lib/__tests__/logger.coverage.test.ts (파일 주석이 window 의존을 명시)
// `.test.tsx` 46개는 컴포넌트 렌더이므로 자명하게 jsdom 이다.
//
// 나머지 138개가 jsdom 을 지불할 이유가 없다. 통제 실험(동일 35파일, environment 만 교체):
//   node  : wall 25.84s  / environment   0.037s
//   jsdom : wall 197.18s / environment 851.40s   ← 7.6배
// 파일당 jsdom environment 비용은 이 저장소에서 약 9.4초이고, 195파일 × 9.4s 는
// 분리 전 실측 누적치(environment 2,724s)와 일치한다.
//
// 왜 이 방법뿐인가: `environmentMatchGlobs` 는 vitest 3 에서 제거되어 현재 배포물에
// 심볼 자체가 없다(대체제가 바로 이 projects 분리다). unit 프로젝트가 `environment` 를
// 명시하고 있어 CLI `--environment=node` 도 무시된다(실측 확인).
//
// fail-loud: 앞으로 누군가 src/services/** 테스트에 renderHook 을 쓰면 node 프로젝트에서
// `ReferenceError: document is not defined` 로 즉시 시끄럽게 실패한다. 조용히 통과하는
// 실패 양식이 아니다.
const DOM_TEST_GLOBS = [
  'src/**/*.test.tsx',
  'src/hooks/**/*.test.ts',
  'src/lib/__tests__/logger.coverage.test.ts',
];

const COMMON_TEST_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.next/**'];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // ⚠️ 루트에 `include` / `environment` / `setupFiles` 를 두지 않는다.
    //
    // 루트 값은 `extends: true` 인 프로젝트에 **상속되어 프로젝트의 include 와 합쳐진다.**
    // 실측으로 확인했다: unit-dom 의 include 를 DOM 글롭 3개로 좁혔는데도 파일 211개를
    // 수집했다(기대 57개). 아래 integration 프로젝트가 `exclude: ['src/**']` 를 굳이
    // 명시해 온 것도 같은 상속 때문이다 — 그 주석이 증상을 기록해 두었다.
    //
    // 그래서 파일 수집에 관여하는 세 옵션은 **프로젝트마다 자기 것을 명시**한다.
    // 여기 남는 것은 프로젝트가 공유해야 하는 것(coverage, alias, globals)뿐이다.
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
      // `--project=unit` 실측이 statements 48.27 / branches 41.84 / functions 46.91 로 올랐고,
      // 임계값을 실측보다 약 1%p 낮은 47.2 / 40.8 / 45.9 / 46.7 로 잡았다.
      //
      // ── 2026-08-06 Phase 1 Dead Code 제거 ───────────────────────────────
      // 프로덕션 호출자가 0인 소스(권한 계층·서비스 메서드 17개·server action 5개·ProfileDialog·
      // StatsCard·REST RBAC 라우트·죽은 export)와 그 코드만 부양하던 테스트를 함께 지웠다.
      // 분모(소스)와 분자(그 소스를 덮던 테스트)가 같이 줄어드는 작업이라 수치가 흔들릴 수
      // 있는데, 실측 결과는 오히려 올랐다:
      //   statements 48.71 · branches 41.72 · functions 46.39 · lines 48.53
      //   (`SKIP_DB_TESTS=true pnpm test:coverage`, unit + storybook, 161파일 1555테스트)
      // 지운 것이 전부 dead code 였다는 뜻이다 — 커버돼 있던 분자를 통째로 들어냈다면
      // 비율이 떨어졌을 것이다. **그래서 임계값은 그대로 둔다.**
      //
      // 참고: 이 작업 중 한 번 45.5/38.6/43.7/45.2 로 내린 커밋이 있었는데, 원인은
      // dead code 삭제가 아니라 **살아 있는 코드의 테스트 100개를 함께 지운 것**이었다.
      // 위 "낮추는 것은 금지" 규칙이 정확히 그 회귀를 잡아낸 사례다. 임계값을 내려서
      // 통과시키고 싶어질 때는 먼저 지운 테스트가 죽은 코드만 덮고 있었는지 확인할 것.
      //
      // ── 2026-08-07 Phase 3 분해·타입 정리 후 재측정 ──────────────────────
      //   statements 48.82 · branches 41.75 · functions 46.84 · lines 48.64
      //   (`pnpm test:coverage`, 164파일 1569테스트)
      // Phase 3 는 삭제가 아니라 이동/좁히기라 분모가 거의 그대로다. 위 1%p 버퍼 정책이
      // 여전히 성립하므로 **임계값은 그대로 둔다.**
      //
      // ── 2026-08-08 훅·API 라우트 커버리지 보강 후 재측정 ─────────────────
      //   statements 57.01 · branches 47.21 · functions 53.26 · lines 57.57
      //   (`SKIP_DB_TESTS=true vitest run --coverage --project unit`)
      // 0% 였던 훅 5종(43.98% → 91.67%)과 미테스트 API 라우트 10종(56.6% → 70.9%)을
      // 덮었다. 분모는 그대로이고 분자만 늘어난 작업이라 수치가 온전히 올랐다.
      // 위 1%p 버퍼 정책대로 임계값을 올린다 — 올린 만큼이 앞으로의 하한이 된다.
      //
      // 페이지·레이아웃(src/app/**/page.tsx 등)은 여전히 0.4% 다. 데이터 조회 + JSX
      // 조합이라 단위 테스트 가치가 낮고 E2E 가 이미 덮는다. **커버리지 include 에서
      // 빼지는 않는다** — 분모를 줄이면 위 주석이 경고한 순환 논리가 그대로 재현된다.
      //
      // ── 2026-08-08 다이얼로그 4종 보강 후 재측정 ─────────────────────────
      //   statements 60.54 · branches 50.70 · functions 55.95 · lines 61.11
      // UserDialog·ClientDialog·AssignRolesDialog·ServiceCategoryDialog 를 덮어
      // src/components 36.0% → 47.9%. 전부 사용자 입력이 서버로 넘어가는 경계라,
      // 남은 컴포넌트(표현 위주)보다 투자 대비 효과가 크다.
      //
      // ── 2026-08-10 대규모 보강 후 재측정 ────────────────────────────────
      //   statements 80.71 (5733/7103) · branches 72.53 (3644/5024)
      //   functions  74.73 (1260/1686) · lines    81.17 (5484/6756)
      //   (`SKIP_DB_TESTS=true vitest run --project=unit --project=unit-dom --coverage`,
      //    228파일 2558테스트 전원 통과)
      //
      // 무엇이 올렸나. 세 가지 작업이 겹쳤다:
      //   1. **화면 단위 테스트 15개 신설** — React Query 이관과 함께 `(dashboard)` 페이지
      //      10개에 처음으로 단위 테스트가 생겼다. 위 2026-08-08 주석이 "0.4% 라 가치가 낮다"
      //      고 적었던 바로 그 구간인데, 이관으로 조회·변이가 훅으로 빠지면서 테스트가
      //      가능해졌다. 그 판단은 이관 전 구조에서만 맞았다.
      //   2. **무테스트 고분기 모듈 15개 보강** — intake 라우트(분기 12/146 → 130/146),
      //      Sidebar(0/42 → 41/42), proxy+auth.config(0/43 → 43/43), users/clients/srs 표현
      //      컴포넌트, PermissionGuard, PWARegistration, LoginForm.
      //   3. **api-client 신설과 그 테스트** — 컴포넌트 26개가 의존하는 단일 진입점이라
      //      계약을 문장 단위로 고정했다.
      //
      // 분모(5,024 분기)는 Storybook 제거로 소폭 줄었을 뿐 페이지·레이아웃을 exclude 하지
      // 않았다 — 위 22~25행과 146~148행이 금지한 분모 축소는 하지 않았다.
      //
      // 임계값은 관례대로 실측보다 약 1%p 낮게 잡는다. 이 값이 앞으로의 하한이다.
      thresholds: {
        statements: 79.5,
        branches: 71.5,
        functions: 73.5,
        lines: 80.0,
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
        // DOM 을 쓰지 않는 유닛 테스트(138파일). 이름을 `unit` 으로 유지하는 이유는
        // `--project=unit` 을 적어 둔 기존 명령·문서·훅 주석을 깨지 않기 위해서다.
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          // `tests/**/*.unit.test.ts` 도 집는다.
          //
          // 통합 테스트 인프라 중 **부수 효과가 없는 순수 모듈**(현재는 db-guard)은
          // DB 없이 검증되어야 한다. 그 가드가 지키는 상황이 정확히 "테스트 DB 가 없는
          // 환경" 이라, 검증이 DB 를 요구하면 정작 필요한 곳에서 돌지 않는다.
          // 아래 integration 프로젝트는 같은 패턴을 exclude 해서 중복 실행을 막는다.
          include: ['src/**/*.test.ts', 'tests/**/*.unit.test.ts'],
          // DOM 글롭을 빼서 아래 unit-dom 과 서로소가 되게 한다. 두 프로젝트의 합집합은
          // 분리 전 include 와 정확히 같다 — 어느 파일도 빠지거나 중복되지 않으므로
          // 커버리지 분자·분모가 그대로다.
          exclude: [...COMMON_TEST_EXCLUDE, ...DOM_TEST_GLOBS],
          setupFiles: ['./vitest.setup.node.ts'],
          // 부하 시 타임아웃에 대한 안전망. 이 프로젝트에서 가장 느린 테스트가
          // 10ms 미만이므로 비용은 0이고, CI 의 CPU 경합으로 5초 기본값을 스치는
          // 사고만 막는다. (플레이키의 실제 원인은 테스트 본문 내 동적 import 였고,
          // 그건 sr.service.test.ts 에서 static import 로 옮겨 이미 고쳤다.)
          testTimeout: 15_000,
        },
      },
      {
        // DOM 이 필요한 유닛 테스트(57파일). 여기만 jsdom + @testing-library 비용을 낸다.
        extends: true,
        test: {
          name: 'unit-dom',
          globals: true,
          environment: 'jsdom',
          include: DOM_TEST_GLOBS,
          exclude: COMMON_TEST_EXCLUDE,
          setupFiles: ['./vitest.setup.ts'],
          testTimeout: 15_000,
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
          // `*.unit.test.ts` 는 unit 프로젝트가 가져간다(위 주석 참조).
          // 여기서 빼지 않으면 DB 가 필요 없는 파일이 DB 셋업을 기다리다 함께 죽는다.
          exclude: [
            'src/**',
            '**/*.unit.test.ts',
            '**/node_modules/**',
            '**/dist/**',
            '**/e2e/**',
            '**/.next/**',
          ],
          setupFiles: ['./vitest.integration.setup.ts'],
          // 같은 DB 를 공유하므로 파일 간 병렬 실행은 TRUNCATE 가 서로를 지우게 만든다.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
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
