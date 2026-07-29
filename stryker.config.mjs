// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: {
    configFile: 'vitest.stryker.config.ts',
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
