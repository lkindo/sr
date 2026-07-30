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
  // 측정 상태(2026-07-30):
  //   실측한 것 = src/lib/{user-helpers,date-utils,permissions}.ts 3개 파일에 대해
  //   `stryker run --mutate ...` 실행 → 뮤턴트 190개, killed 187 / survived 3, 점수 98.42%
  //   (소요 4분 5초).
  //   실측하지 **않은** 것 = 리포지토리 전체 점수. 파일 3개에 4분이 걸려 전체 실행은
  //   이 환경에서 불가능했다. 위 3개는 라인 커버리지 100%인 최상위 파일이라 98.42%는
  //   전형적인 PR의 점수가 아니라 상한에 가깝다.
  //
  // 따라서 break는 측정치가 아니라 의도적으로 낮게 잡은 보수적 하한선 60이다.
  // 근거: sr.service.ts(84%) / push.service.ts(85%)처럼 커버리지가 낮은 파일을 건드리는
  // PR까지 즉시 빨간불로 만들면 게이트가 삭제당한다. 60은 "테스트가 사실상 없는 변경"만
  // 확실히 잡는 값이다.
  //
  // 올리는 방법: mutation-test 잡 로그의 실제 점수를 몇 개 PR에 걸쳐 모은 뒤,
  // 관측된 최저값보다 조금 아래로 break를 단계적으로 올린다(60 → 70 → 80).
  // 목표는 low(70)/high(90)에 맞추는 것이다.
  thresholds: {
    high: 90,
    low: 70,
    break: 60,
  },
};
export default config;
