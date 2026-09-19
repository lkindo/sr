import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';

import {
  aggregateReports,
  type MutationReportLike,
  type ShardManifest,
  verifyShardSet,
} from './lib/mutation-shards';

/**
 * 분할 실행한 뮤테이션 결과를 합쳐 전체 점수로 판정한다(CI mutation-summary 작업).
 * Usage: tsx scripts/stryker-aggregate.ts <리포트 디렉터리>
 *
 * 각 분할 작업은 점수 판정을 끄고(stryker.config.mjs — MUTATION_SHARD_TOTAL > 1) 배정 기록
 * (shard-manifest.json)과 리포트(mutation.json)를 아티팩트로 올린다. 여기서는
 *  1) 배정 기록이 1..N 전부 왔는지, 모두 같은 전체 목록을 빠짐·겹침 없이 나눴는지, 파일을 맡은 분할마다 리포트가
 *     있는지 먼저 확인하고(하나라도 어긋나면 실패 — 점수를 모르는 채 통과시키지 않는다),
 *  2) 전체 점수를 stryker.config.mjs 의 BREAK_THRESHOLD 와 비교한다 — 분할하지 않던 때 Stryker 가 하던 판정과
 *     같은 공식·같은 기준이다(scripts/lib/mutation-shards.ts).
 */

function log(message: string) {
  console.log(`[Stryker-Aggregate] ${message}`);
}

function findFiles(dir: string, fileName: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...findFiles(full, fileName));
    else if (name === fileName) found.push(full);
  }
  return found.sort();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function loadBreakThreshold(): Promise<number> {
  const config = (await import(
    pathToFileURL(resolve(process.cwd(), 'stryker.config.mjs')).href
  )) as {
    BREAK_THRESHOLD?: unknown;
  };
  const value = config.BREAK_THRESHOLD;
  // 숫자가 아니면(이름이 바뀌었거나 export 가 빠짐) 비교가 늘 거짓이 되어 게이트가 꺼진다 — 여기서 막는다.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`stryker.config.mjs 의 BREAK_THRESHOLD 가 숫자가 아닙니다: ${String(value)}`);
  }
  return value;
}

async function run() {
  const dir = resolve(process.cwd(), process.argv[2] ?? 'mutation-reports');
  const breakThreshold = await loadBreakThreshold();

  // 배정 기록 하나당 같은 디렉터리의 mutation.json 이 그 분할의 리포트다(아티팩트 하나 = 디렉터리 하나,
  // 아티팩트가 하나뿐이면 download-artifact 가 디렉터리 없이 풀지만 그때도 같은 디렉터리에 함께 있다).
  const entries = findFiles(dir, 'shard-manifest.json').map((manifestPath) => {
    const reportPath = join(dirname(manifestPath), 'mutation.json');
    return {
      manifest: readJson<ShardManifest>(manifestPath),
      report: existsSync(reportPath) ? readJson<MutationReportLike>(reportPath) : null,
    };
  });

  const verified = verifyShardSet(entries);
  if (!verified.ok) {
    log('FAILED: 분할 결과가 온전하지 않아 점수를 판정할 수 없습니다.');
    verified.errors.forEach((error) => log(`  - ${error}`));
    log(
      '  대응: 실패·누락된 분할 작업을 확인하고 전체 워크플로를 다시 실행하세요(Re-run all jobs).'
    );
    process.exit(1);
  }

  if (verified.covered.length === 0) {
    // 모든 분할이 "대상 없음" 을 기록했다(변경이 없거나, 테스트가 닿는 변경 파일이 없음).
    log(`분할 ${entries.length}개 모두 뮤테이션 대상이 없었습니다 — 판정하지 않습니다.`);
    return;
  }

  const totals = aggregateReports(verified.reports);
  log(
    `분할 ${entries.length}개(리포트 ${verified.reports.length}개), 대상 파일 ${verified.covered.length}개를 합쳤습니다.`
  );
  // 약한 파일부터 보여 준다 — 테스트를 보강할 곳이다.
  const rows = [...totals.files].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  for (const f of rows) {
    const score = f.score === null ? '   -  ' : f.score.toFixed(2).padStart(6);
    console.log(
      `  ${score}%  killed ${f.killed}, timeout ${f.timeout}, survived ${f.survived}, no-coverage ${f.noCoverage}  ${f.path}`
    );
  }
  log(
    `합계: killed ${totals.killed}, timeout ${totals.timeout}, survived ${totals.survived}, no-coverage ${totals.noCoverage}` +
      ` (제외: compile/runtime error ${totals.invalid}, ignored ${totals.ignored}, pending ${totals.pending})`
  );

  if (totals.score === null) {
    log(
      '유효한 뮤턴트가 없어 점수를 낼 수 없습니다 — 판정하지 않습니다(Stryker 도 같은 경우 통과시킨다).'
    );
    return;
  }

  const score = totals.score.toFixed(2);
  if (totals.score < breakThreshold) {
    log(`FAILED: 전체 뮤테이션 점수 ${score}% 가 기준 ${breakThreshold}% 미만입니다.`);
    log(
      '  대응: 위 목록 위쪽(점수가 낮은 파일)의 Survived / NoCoverage 뮤턴트를 죽이는 테스트를 추가하세요.'
    );
    log('  상세: 각 분할 작업 로그의 clear-text 리포트, 아티팩트 mutation-report-<n>.');
    process.exit(1);
  }
  log(`전체 뮤테이션 점수 ${score}% — 기준 ${breakThreshold}% 이상입니다.`);
}

run().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
