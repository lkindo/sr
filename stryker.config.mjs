// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: {
    configFile: 'vitest.stryker.config.ts',
    // ── related 모드는 반드시 꺼야 한다 (실측 2026-07-30) ──────────────────────
    // 기본값 true. 켜져 있으면 initial dry run이 아래 경로로 **반드시** 죽는다.
    //
    //   ERROR DryRunExecutor Test runner crashed.
    //     Error: ERR_LOAD_URL Failed to load url <sandbox 루트>
    //     (resolved id: <sandbox 루트>). Does the file exist?
    //
    // 원인 사슬(전부 로컬에서 재현·계측했다):
    //  1. push.service.ts:153 `await import('web-push')` — 동적 import 의 인자는
    //     문자열 리터럴이므로 Stryker StringLiteral 뮤테이터가 `""` 뮤턴트를 만든다.
    //     계측된 코드에는 삼항의 양쪽 가지로 두 호출이 **동시에** 남는다:
    //       stryMutAct(...) ? __vite_ssr_dynamic_import__("") : __vite_ssr_dynamic_import__("web-push")
    //  2. Vite 는 그 `""` 를 transformResult.dynamicDeps 에 그대로 담는다.
    //  3. vitest 4 의 related 필터(TestSpecifications#getTestDependencies)가 각 dep 을
    //       fsPath = dep.startsWith('/@fs/') ? ... : path.join(project.config.root, dep)
    //     로 되돌린다. dep 이 빈 문자열이면 join 결과가 **프로젝트 루트 디렉터리**가 되고,
    //     디렉터리이므로 existsSync 가 통과해 transformRequest(<루트>) 까지 간다.
    //  4. Vite 가 디렉터리를 모듈로 로드하려다 ERR_LOAD_URL → 워커 크래시 → 2회 재시도 후 사망.
    //
    // 즉 sandbox 경로/`__dirname`/alias 문제가 아니다(그 가설은 반증했다 — sandbox 안에서
    // alias 는 `/src/__tests__/mocks/server-only.ts` 로 정상 해석된다). `inPlace: true` 로
    // 바꿔도 루트만 실제 작업트리로 바뀔 뿐 join('') 결과가 여전히 존재하는 디렉터리라 동일하게 죽는다.
    // 동적 import 를 가진 파일(push.service.ts, user.service.ts)이 mutate 대상에 들어가는
    // 순간 재현되므로, 파일 1개짜리 좁은 실행에서는 우연히 통과할 수 있다.
    //
    // related 를 끄는 비용은 dry run 이 "변경 파일과 관련된 테스트"가 아니라 include 전체를
    // 도는 것뿐이다. 뮤턴트 실행 자체는 perTest 커버리지로 여전히 좁혀지므로(mutantRun 은
    // testFilter 로 테스트를 직접 지정한다) 2796개 뮤턴트 실행 시간에는 영향이 없다.
    related: false,
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/types/**',
    '!src/generated/**',
    '!src/lib/registry.tsx',
    '!src/components/**',
  ],
  concurrency: 2,
  timeoutMS: 30000,
  timeoutFactor: 2.5,
  ignoreStatic: true,
  cleanTempDir: true,
  // thresholds.break가 없으면 Stryker는 뮤테이션 점수가 0이어도 exit 0으로 끝난다.
  // 즉 CI의 mutation-test 잡이 "항상 통과하는 게이트"였다. break를 넣어야 비로소 빨간불이 된다.
  //
  // break가 실제로 무엇을 잡는가: scripts/stryker-ci.ts가 PR에서 변경된 .ts 파일만 --mutate로
  // 넘기므로, 이 값은 "이번 PR이 건드린 파일들의 뮤테이션 점수"를 게이트한다.
  // 테스트가 아예 없는 파일을 수정하면 점수가 0에 수렴해 break에 걸린다(의도된 동작).
  //
  // ── 실측 기준선 (PR #247, CI 2026-07-30) ────────────────────────────────
  // 이전 break: 60 은 측정 없이 잡은 보수적 하한선이었다. 이제 실제 값이 나왔다.
  // 변경 파일 9개, 뮤턴트 2788개, 37.6분 소요:
  //   전체 49.64%  (killed 1379 / survived 1107 / no-coverage 294 / timeout 2)
  //     user.actions.ts    94.87   (survived   4)
  //     policies.ts        76.44   (survived  49)
  //     api/srs/route.ts   73.81   (survived  10)
  //     client.service.ts  54.87   (survived  67)
  //     serialization.ts   51.43   (survived  46)
  //     push.service.ts    44.02   (survived  83)
  //     env-validation.ts  30.61   (survived 325)
  //
  // 이 파일들의 라인 커버리지는 84~100% 다. 그런데 뮤턴트 절반이 살아남는다.
  // 즉 "코드를 실행하지만 동작을 검증하지 않는 테스트"가 상당수라는 뜻이다.
  // 임계값을 내리는 것은 이 사실을 인정하는 것이지 해결하는 것이 아니다 —
  // survived 뮤턴트를 죽이는 테스트 추가는 별도 작업으로 남아 있다.
  //
  // ⚠️ 이 값의 근본적 한계: scripts/stryker-ci.ts 는 PR 이 변경한 파일만 --mutate 로
  // 넘기므로 점수는 "그 PR 이 무엇을 건드렸는지"에 따라 크게 흔들린다. 위 표의
  // 스프레드가 30.61 ~ 94.87 이다. user.actions.ts 만 고친 PR 은 95 를 받고,
  // env-validation.ts 만 고친 PR 은 31 을 받는다. 단일 전역 break 로는 이 분산을
  // 다룰 수 없다 — 후자는 아무것도 악화시키지 않았는데도 빨간불이 된다.
  // 45 는 그 스프레드의 하단 일부를 감수하고 고른 값이다. 근본 해법은 파일별 기준선을
  // 저장해 비교하거나(점수 회귀 감지), 약한 파일의 테스트를 먼저 보강하는 것이다.
  //
  // 올리는 방법: 몇 개 PR 에 걸쳐 실제 점수를 모은 뒤 관측 최저값보다 조금 아래로
  // 단계적으로 올린다(45 → 60 → 70). 목표는 low(70)/high(90) 에 맞추는 것이다.
  thresholds: {
    high: 90,
    low: 70,
    break: 45,
  },
};
export default config;
