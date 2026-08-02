import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Stryker 전용 vitest 설정.
 *
 * 이 파일의 유일한 목적은 "메인 unit 프로젝트의 빠른 부분집합"을 돌리는 것이다.
 * 테스트 선택 범위(어떤 파일을 돌릴지)만 메인과 달라야 하고, 실행 환경(environment /
 * setupFiles / alias)은 메인과 **반드시 동일**해야 한다. 환경이 갈라지면 Stryker가
 * 검증하는 스위트가 실제 스위트와 다른 물건이 되고, initial test run이 깨져서
 * 뮤테이션 게이트가 통째로 무의미해진다.
 *
 * 2026-07-30에 실제로 그 상태였다(수정 전):
 *   - environment가 'node'라서 renderHook을 쓰는 src/hooks/__tests__/use-toast.coverage.test.ts가
 *     `ReferenceError: document is not defined`로 실패했다.
 *   - bail: 1 때문에 그 첫 실패에서 즉시 중단 → 수집된 108개 파일 중 28개만 실행됐다.
 *   - 메인 설정에 있는 next/server · next/navigation · next/cache alias가 빠져 있어
 *     route 핸들러를 import하는 테스트가 실제 next 런타임을 잡게 되어 있었다.
 * 아래 값들은 그 세 가지를 메인 설정에 다시 맞춘 것이다.
 *
 * 메인과 의도적으로 다른 것은 딱 두 개다: exclude 의 'src/components/**'(속도), 그리고
 * 바로 아래 stryker-empty-dynamic-import 플러그인(계측된 코드에만 존재하는 구문을 처리한다).
 */
/**
 * 빈 문자열 동적 import(`import("")`)를 해석 가능하게 만드는 Stryker 전용 플러그인.
 *
 * 왜 필요한가 — Stryker 뮤테이터의 구멍이다(실측 2026-07-30, @stryker-mutator/instrumenter 9.5.1).
 * string-literal-mutator 의 isValidParent() 는 `import 'x'`(ImportDeclaration)와 `require('x')` 는
 * 뮤테이션에서 제외하지만, **동적 import 의 인자는 제외하지 않는다**(babel 상 callee 가
 * Identifier 가 아닌 Import 노드라 위 두 가드에 걸리지 않는다). 그래서 계측된 소스에는
 * 삼항의 양쪽 가지로 두 호출이 동시에 남는다:
 *
 *   webPushModule = await (stryMutAct_9fa48("63") ? import("") : import((stryCov_9fa48("63"), "web-push")));
 *
 * `import("")` 는 실행되지 않아도 vite:import-analysis 가 **변환 시점에** 해석을 시도하다 죽는다:
 *   Error: Failed to resolve import "" from "src/services/push.service.ts". Does the file exist?
 *     Plugin: vite:import-analysis   at normalizeUrl (vite/dist/node/chunks/config.js)
 * 또 vitest 4 의 related 필터는 같은 `""` 를 dep 으로 받아 path.join(root, "") = 프로젝트 루트를
 * 모듈로 로드하려 하고, 디렉터리라서 existsSync 를 통과해 워커가 통째로 크래시한다:
 *   Error: ERR_LOAD_URL Failed to load url <sandbox 루트> (resolved id: <sandbox 루트>).
 *
 * 대상 파일: src/services/push.service.ts:153 `await import('web-push')`,
 *           src/services/user.service.ts:478 `await import('@/lib/prisma')`.
 * 즉 동적 import 를 가진 파일이 --mutate 에 들어가는 순간 뮤테이션 게이트가 점수도 내지 못하고 죽는다.
 *
 * 왜 이렇게 고치는가 — excludedMutations: ['StringLiteral'] 로 막으면 뮤테이터 한 종류를
 * 저장소 전체에서 꺼 버리는 것이라 게이트가 크게 헐거워진다. 대신 빈 specifier 를
 * "로드되면 던지는 가상 모듈"로 해석해 준다. 해석 시점 에러는 사라지고, 뮤턴트가 실제로
 * 활성화되어 그 가지가 실행되면 원래의 `import("")` 와 똑같이 예외를 던지므로 뮤턴트는
 * 정상적으로 killed 된다. 뮤테이션 강도를 낮추지 않는다.
 *
 * 이 플러그인은 Stryker 전용 설정에만 있다. 계측되지 않은 실제 스위트에는 `import("")` 가
 * 존재하지 않으므로 vitest.config.ts 에는 넣을 이유가 없다.
 */
const EMPTY_IMPORT_SPECIFIER = 'virtual:stryker-empty-dynamic-import';
const EMPTY_IMPORT_RESOLVED_ID = `\0${EMPTY_IMPORT_SPECIFIER}`;

export default defineConfig({
  plugins: [
    {
      name: 'stryker-empty-dynamic-import',
      // vite:import-analysis 보다 먼저 해석되어야 한다.
      enforce: 'pre',
      // importer 가 있을 때만 개입한다 = "어떤 모듈이 빈 specifier 를 import 했다"는 경우뿐.
      // entry 해석처럼 importer 가 없는 호출까지 삼키면 엉뚱한 것을 가상 모듈로 바꿀 수 있다.
      resolveId(source: string, importer: string | undefined) {
        return source === '' && importer ? EMPTY_IMPORT_RESOLVED_ID : undefined;
      },
      load(id: string) {
        if (id !== EMPTY_IMPORT_RESOLVED_ID) return undefined;
        // 실행되면 던진다 = 해석 불가능한 import 의 원래 동작. 뮤턴트를 조용히 살려두지 않는다.
        return 'throw new Error(\'Stryker mutant: dynamic import("") was executed\');';
      },
    },
  ],
  test: {
    // 메인 vitest.config.ts와 동일해야 한다. 'node'로 두면 DOM을 쓰는 훅 테스트가 죽는다.
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      'src/stories/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.next/**',
      // 컴포넌트는 stryker.config.mjs의 mutate 목록에서도 제외되어 있으므로
      // 해당 테스트를 돌릴 이유가 없다(속도 목적의 유일한 의도적 축소).
      'src/components/**',
    ],
    // 메인 설정과 동일한 alias. 빠지면 route 핸들러를 import하는 테스트가 깨진다.
    //
    // __dirname 은 sandbox 안에서도 맞다 — 검증했다(2026-07-30). Stryker 는 이 설정 파일을
    // .stryker-tmp/sandbox-XXXX 로 복사한 뒤 그 복사본을 로드하므로 __dirname 이 sandbox 를
    // 가리키고, sandbox 안에서 import 는 `/src/__tests__/mocks/server-only.ts` 로 정상 해석된다
    // (vite transformResult.deps 로 확인). dry run 크래시의 원인은 alias 가 아니었으니,
    // 재발 시 여기를 상대경로나 process.cwd() 로 바꾸는 데 시간을 쓰지 말 것.
    alias: {
      'next/server': path.resolve(__dirname, './src/__tests__/mocks/next-server.ts'),
      'next/navigation': path.resolve(__dirname, './src/__tests__/mocks/next-navigation.ts'),
      'next/cache': path.resolve(__dirname, './src/__tests__/mocks/next-cache.ts'),
      'server-only': path.resolve(__dirname, './src/__tests__/mocks/server-only.ts'),
      '@': path.resolve(__dirname, './src'),
    },
    // bail 은 여기서 지정해도 의미가 없다. vitest-runner 가 createVitest 호출 시
    // `bail: options.disableBail ? 0 : 1` 로 **덮어쓴다**(vitest-test-runner.js).
    // 즉 dry run 은 항상 bail=1 이며, 계측 전에 깨지는 테스트가 하나라도 있으면
    // 거기서 끊기고 Stryker 가 "There were failed tests in the initial test run." 으로 죽는다.
    // 스위트를 초록으로 유지하는 것이 뮤테이션 게이트의 전제 조건이다.
    retry: 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
