import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Stryker Mutation Test Runner for CI
 *
 * Runs mutation monitoring only on files changed relative to the target branch.
 * Usage: tsx scripts/stryker-ci.ts
 */

const TARGET_BRANCH = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : 'origin/main';
const SUBPROJECT_DIR = 'src';

function log(message: string) {
  console.log(`[Stryker-CI] ${message}`);
}

/**
 * --mutate 값은 경로가 아니라 "glob 패턴"으로 해석된다(Stryker 내부에서 minimatch 사용).
 *
 * Next.js 동적 라우트 경로에는 대괄호가 들어간다: src/app/api/srs/[id]/route.ts.
 * 그대로 넘기면 minimatch 가 `[id]` 를 문자 클래스(i, d 중 하나)로 읽어 어떤 파일과도 맞지 않는다.
 * 이때 Stryker 는 실패하지 않고 경고만 찍는다:
 *   WARN ProjectReader Glob pattern "src/app/api/srs/[id]/route.ts" did not result in any files.
 * 즉 API route 핸들러가 통째로 뮤테이션 대상에서 조용히 빠진다. 실측(2026-07-30) 기준
 * origin/main 대비 변경 파일 19개 중 7개(전부 동적 라우트)가 이렇게 사라지고 있었다.
 *
 * 역슬래시 이스케이프(`\[`)는 쓸 수 없다. FileMatcher 가 path.resolve() 를 먼저 호출해
 * 윈도우에서 역슬래시를 경로 구분자로 바꿔 버린다(실측: 여전히 0개 매칭).
 * 대신 문자 클래스 자체를 이용한다 — `[[]` 는 리터럴 `[`, `[]]` 는 리터럴 `]`.
 * (실측: `src/app/api/srs/[[]id[]]/route.ts` → "Found 2 of 971 file(s) to be mutated.")
 */
const GLOB_ESCAPES: Record<string, string> = {
  '[': '[[]',
  ']': '[]]',
  '*': '[*]',
  '?': '[?]',
  '{': '[{]',
  '}': '[}]',
  '(': '[(]',
  ')': '[)]',
};

function escapeGlob(filePath: string): string {
  return filePath.replace(/[[\]*?{}()]/g, (ch) => GLOB_ESCAPES[ch]);
}

/**
 * 대상 브랜치 대비 변경된 파일 목록.
 *
 * git 이 실패하면 빈 배열을 돌려주지 않고 즉시 종료한다.
 * 예전에는 catch 에서 []를 반환했고, run()이 그것을 "변경 없음"으로 해석해
 * `Skipping mutation testing.` 을 찍고 exit 0 으로 끝냈다. 즉 fetch 실패·shallow clone·
 * ref 누락 같은 인프라 사고가 "깨끗한 PR"과 구분되지 않은 채 초록불이 됐다.
 * 변경 목록을 모른다는 것은 게이트를 실행할 수 없다는 뜻이므로 빨간불이 정답이다.
 */
function getChangedFiles(): string[] {
  // 대상 브랜치 ref 확보. 이미 로컬에 있는 경우도 있으므로 fetch 실패 자체는 치명적이지 않다.
  // (진짜로 ref 가 없으면 바로 아래 diff 가 실패하고, 그때 명시적으로 종료한다.)
  try {
    execSync(`git fetch origin ${process.env.GITHUB_BASE_REF || 'main'} --depth=1`, {
      stdio: 'ignore',
    });
  } catch {
    log('대상 브랜치 fetch 실패 — 이미 로컬에 존재한다고 가정하고 diff 를 시도한다.');
  }

  const diffCommand = `git diff --name-only --diff-filter=AM ${TARGET_BRANCH}...HEAD`;

  log(`Calculating diff against ${TARGET_BRANCH}...`);

  try {
    const output = execSync(diffCommand, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return output.split('\n').filter(Boolean);
  } catch (error) {
    log(`FATAL: ${TARGET_BRANCH} 대비 변경 파일 목록을 계산하지 못했습니다.`);
    log(`  실행한 명령: ${diffCommand}`);
    log(`  원인: ${error instanceof Error ? error.message : String(error)}`);
    log('  확인할 것: actions/checkout 의 fetch-depth: 0, 그리고 대상 브랜치 ref 존재 여부.');
    log('  변경 목록을 모르면 뮤테이션 게이트를 실행할 수 없으므로 통과 처리하지 않습니다.');
    process.exit(1);
  }
}

/**
 * 변경 파일을 "테스트가 닿는 파일"과 "전혀 닿지 않는 파일"로 나눈다.
 *
 * test 잡이 올려둔 coverage-final.json 을 사용한다. 파일이 없으면(로컬 실행, 아티팩트 누락)
 * 분류를 포기하고 전부 대상으로 삼는다 — 게이트를 조용히 꺼 버리는 것보다 낫다.
 */
function splitByCoverage(files: string[]): { covered: string[]; uncovered: string[] } {
  const coveragePath = resolve(process.cwd(), 'coverage', 'coverage-final.json');

  if (!existsSync(coveragePath)) {
    log('coverage-final.json 이 없어 커버리지 기반 선별을 건너뜁니다(전체 파일 대상).');
    return { covered: files, uncovered: [] };
  }

  let coverageMap: Record<string, { s?: Record<string, number> }>;
  try {
    coverageMap = JSON.parse(readFileSync(coveragePath, 'utf8'));
  } catch (error) {
    log(`coverage-final.json 파싱 실패 — 전체 파일을 대상으로 진행합니다: ${String(error)}`);
    return { covered: files, uncovered: [] };
  }

  // 키는 절대경로다. 구분자를 정규화해 저장소 상대경로로 맞춘다.
  const hitByPath = new Map<string, boolean>();
  for (const [absPath, entry] of Object.entries(coverageMap)) {
    const normalized = absPath.replace(/\\/g, '/');
    const hasHit = Object.values(entry?.s ?? {}).some((count) => count > 0);
    hitByPath.set(normalized, hasHit);
  }

  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const file of files) {
    const suffix = file.replace(/\\/g, '/');
    let hit: boolean | undefined;
    for (const [normalized, hasHit] of hitByPath) {
      if (normalized.endsWith(`/${suffix}`)) {
        hit = hasHit;
        break;
      }
    }
    // 커버리지 맵에 아예 없는 파일 = 어떤 테스트도 로드하지 않은 파일.
    (hit ? covered : uncovered).push(file);
  }

  return { covered, uncovered };
}

function run() {
  const changedFiles = getChangedFiles();

  // Filter for Typescript files in src, excluding tests and ignored patterns
  let filesToMutate = changedFiles.filter((file) => {
    return (
      file.startsWith(SUBPROJECT_DIR) &&
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.spec.ts') &&
      !file.includes('__tests__') &&
      !file.includes('__mocks__') &&
      !file.includes('types/') &&
      !file.includes('generated/')
    );
  });

  if (filesToMutate.length === 0) {
    log('No applicable file changes detected. Skipping mutation testing.');
    process.exit(0);
  }

  const { covered, uncovered } = splitByCoverage(filesToMutate);

  // 테스트가 전혀 없는 파일은 뮤테이션 대상에서 제외한다.
  //  - 그런 파일의 뮤턴트는 전부 NoCoverage 로 mutationScore 를 끌어내려,
  //    "기존 테스트가 부실하다"와 "테스트가 아예 없다"를 구분할 수 없게 만든다.
  //  - 전부 무커버리지면 Stryker 는 점수도 내지 못하고
  //    `No tests were executed. Stryker will exit prematurely` 로 죽는다.
  //  - 테스트 부재는 커버리지 게이트(vitest thresholds)가 이미 담당한다.
  // 제외분은 반드시 눈에 보이게 남긴다. 조용히 줄이면 "전부 검사했다"로 읽힌다.
  if (uncovered.length > 0) {
    log(`뮤테이션 제외 — 테스트가 없는 변경 파일 ${uncovered.length}개:`);
    uncovered.forEach((f) => console.log(` - ${f}  (커버리지 게이트 담당)`));
  }

  if (covered.length === 0) {
    log('변경된 파일 중 테스트가 있는 파일이 없어 뮤테이션 점수를 낼 수 없습니다.');
    log('  테스트 부재 자체는 커버리지 게이트가 판정하므로 여기서는 통과 처리합니다.');
    process.exit(0);
  }

  log(`Found ${covered.length} file(s) to mutate:`);
  covered.forEach((f) => console.log(` - ${f}`));
  filesToMutate = covered;

  // 아래 이스케이프/조합으로 안전하게 표현할 수 없는 문자들.
  //  ,  → join(',') 이 한 파일을 둘로 쪼갠다.
  //  !  → Stryker 의 mutate 문법에서 부정 패턴 접두사다.
  //  "  → 쉘 인용을 깨뜨린다.
  //  \  → FileMatcher 의 path.resolve() 가 경로 구분자로 바꿔 버린다.
  // 실제로 일어날 일은 거의 없지만, 조용히 틀리는 것보다 시끄럽게 죽는 편이 낫다.
  const unsafe = filesToMutate.filter((f) => /[,!"\\]/.test(f));
  if (unsafe.length > 0) {
    log('FATAL: --mutate 패턴으로 안전하게 표현할 수 없는 문자가 경로에 있습니다:');
    unsafe.forEach((f) => console.log(` - ${f}`));
    process.exit(1);
  }

  // ── --mutate 는 "쉼표로 구분된 하나의 값"이다 ─────────────────────────────
  // Stryker CLI 정의: `-m, --mutate <filesToMutate>` + 값 파서 `val.split(',')`.
  // 즉 공백으로 이어 붙이면 첫 경로만 --mutate 로 들어가고 나머지는 `run [configFile]`의
  // 위치 인자로 흘러간다. 실측(9.5.1 / commander 14)한 결과는 다음과 같다.
  //   파일 2개 → 두 번째 경로가 configFile 로 해석되어
  //     "Invalid config file. It is missing a default export." 로 exit 1.
  //     → stryker.config.mjs 를 아예 읽지 않으므로 thresholds.break 도 사라진다.
  //   파일 3개 이상 → "error: too many arguments for 'run'. Expected 1 argument but got 2." exit 1.
  // 어느 쪽이든 점수를 내기 전에 죽으므로, 다중 파일 PR 에서 break:60 은 한 번도 평가된 적이 없다.
  // 쉼표로 이으면 하나의 값으로 파싱되고 설정 파일도 정상 로드된다(실측: 파일 3개 → 뮤턴트 190개).
  const mutatePatterns = filesToMutate.map(escapeGlob);
  const strykerCmd = `npx stryker run --mutate "${mutatePatterns.join(',')}"`;

  try {
    log('Starting Stryker...');
    log(`  ${strykerCmd}`);
    execSync(strykerCmd, { stdio: 'inherit' });
    log('Mutation testing completed successfully.');
  } catch {
    // Stryker 는 thresholds.break 미달 시에도 non-zero 로 끝난다. 여기서 삼키면 게이트가 사라진다.
    log('Mutation testing failed (실행 오류 또는 thresholds.break 미달).');
    process.exit(1);
  }
}

run();
