/**
 * 뮤테이션 테스트 분할 실행의 순수 로직 — 파일 분배와 결과 합산.
 *
 * PR 이 main 대비 바꾼 파일만 검사하는데, dev 를 main 에 모아 반영하는 PR 은 변경량이 커서 한 작업(러너 2코어,
 * concurrency 2)으로는 60분 제한을 넘는다(2026-09-19 PR #279: 뮤턴트 8,535개, 추정 78분, 71% 에서 중단).
 * 그래서 대상 파일을 여러 CI 작업에 나눠 동시에 돌린다(scripts/stryker-ci.ts). 판정은 묶음별이 아니라 전체
 * 점수로 한다(scripts/stryker-aggregate.ts) — 묶음별로 판정하면 테스트가 약한 파일이 한 묶음에 몰렸을 때
 * 전체로는 통과할 PR 이 실패한다.
 *
 * 이 모듈은 파일·프로세스를 건드리지 않는다(테스트: tests/scripts/mutation-shards.unit.test.ts).
 */

export interface WeightedFile {
  path: string;
  /** 뮤턴트 수의 대리값. 파일 크기(바이트)를 쓴다 — 뮤턴트는 코드 양에 대략 비례한다. */
  weight: number;
}

/**
 * 파일을 `total` 개 묶음으로 나눈다. 무거운 파일부터 지금 가장 가벼운 묶음에 넣는다(LPT 탐욕 배분).
 * 같은 입력이면 어느 CI 작업에서 계산해도 같은 결과가 나와야 하므로 동률은 경로 순으로 깬다.
 * 각 묶음 안의 경로는 정렬해 돌려준다(로그 비교용).
 */
export function assignShards(files: readonly WeightedFile[], total: number): string[][] {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`분할 수는 1 이상의 정수여야 합니다: ${total}`);
  }
  const sorted = [...files].sort(
    (a, b) => b.weight - a.weight || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
  const bins = Array.from({ length: total }, () => ({ paths: [] as string[], load: 0 }));
  for (const file of sorted) {
    let target = bins[0]!;
    for (const bin of bins) {
      if (bin.load < target.load) target = bin;
    }
    target.paths.push(file.path);
    target.load += Math.max(0, file.weight);
  }
  return bins.map((bin) => [...bin.paths].sort());
}

/**
 * CI 가 넘긴 분할 번호를 읽는다. 둘 다 없으면 분할하지 않는다(1/1 — 로컬 실행과 같다).
 * 잘못된 값은 조용히 1/1 로 바꾸지 않고 던진다 — 모든 작업이 같은 파일을 돌리면 시간만 늘고 게이트는 그대로다.
 */
export function parseShardEnv(
  indexRaw: string | undefined,
  totalRaw: string | undefined
): { index: number; total: number } {
  if (!indexRaw && !totalRaw) return { index: 1, total: 1 };
  const index = Number(indexRaw);
  const total = Number(totalRaw);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    total < 1 ||
    index < 1 ||
    index > total
  ) {
    throw new Error(
      `MUTATION_SHARD_INDEX/MUTATION_SHARD_TOTAL 이 올바르지 않습니다: index=${indexRaw ?? ''}, total=${totalRaw ?? ''}`
    );
  }
  return { index, total };
}

/** Stryker JSON 리포트(mutation-testing-report-schema)에서 합산에 필요한 부분. */
export interface MutationReportLike {
  files: Record<string, { mutants: ReadonlyArray<{ status: string }> }>;
}

export interface FileMutationSummary {
  path: string;
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  /** 뮤테이션 점수(%). 유효한 뮤턴트가 없으면 null. */
  score: number | null;
}

export interface MutationTotals {
  files: FileMutationSummary[];
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  /** CompileError·RuntimeError — Stryker 도 점수에서 뺀다. */
  invalid: number;
  ignored: number;
  pending: number;
  /** 전체 뮤테이션 점수(%). 유효한 뮤턴트가 없으면 null(Stryker 는 NaN — 어느 쪽이든 판정하지 않는다). */
  score: number | null;
}

/**
 * 점수 공식은 Stryker(mutation-testing-metrics countFileMetrics)와 같다:
 *   (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) × 100
 * 같은 파일이 두 리포트에 있으면(분할이 겹치는 설정 실수) 뮤턴트를 합친다.
 */
export function aggregateReports(reports: readonly MutationReportLike[]): MutationTotals {
  const byFile = new Map<string, Array<{ status: string }>>();
  for (const report of reports) {
    for (const [path, file] of Object.entries(report.files ?? {})) {
      const list = byFile.get(path) ?? [];
      list.push(...(file.mutants ?? []));
      byFile.set(path, list);
    }
  }

  const totals: MutationTotals = {
    files: [],
    killed: 0,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    invalid: 0,
    ignored: 0,
    pending: 0,
    score: null,
  };

  for (const [path, mutants] of [...byFile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const count = (status: string) => mutants.filter((m) => m.status === status).length;
    const file = {
      path,
      killed: count('Killed'),
      timeout: count('Timeout'),
      survived: count('Survived'),
      noCoverage: count('NoCoverage'),
    };
    totals.killed += file.killed;
    totals.timeout += file.timeout;
    totals.survived += file.survived;
    totals.noCoverage += file.noCoverage;
    totals.invalid += count('CompileError') + count('RuntimeError');
    totals.ignored += count('Ignored');
    totals.pending += count('Pending');
    totals.files.push({ ...file, score: scoreOf(file) });
  }

  totals.score = scoreOf(totals);
  return totals;
}

function scoreOf(c: { killed: number; timeout: number; survived: number; noCoverage: number }) {
  const detected = c.killed + c.timeout;
  const valid = detected + c.survived + c.noCoverage;
  return valid > 0 ? (detected / valid) * 100 : null;
}

/**
 * 분할 작업마다 남기는 배정 기록(reports/mutation/shard-manifest.json). 대상 파일이 없던 분할도 남긴다.
 * 합산 작업은 이것으로 "모든 분할의 결과를 받았는가, 같은 목록을 나눴는가"를 확인한다 — 리포트만 보면
 * 결과가 빠졌는지(업로드 실패·만료·재실행 혼선) 대상이 없었는지 구분할 수 없다.
 */
export interface ShardManifest {
  index: number;
  total: number;
  /** 모든 분할이 나눈 전체 대상 목록(정렬). 분할마다 같아야 한다. */
  covered: string[];
  /** 이 분할이 맡은 파일. */
  assigned: string[];
}

export function buildManifest(
  index: number,
  total: number,
  covered: readonly string[],
  assigned: readonly string[]
): ShardManifest {
  return { index, total, covered: [...covered].sort(), assigned: [...assigned].sort() };
}

/** 합산 전에 분할 결과가 온전한지 본다. 하나라도 어긋나면 점수를 내지 않고 실패한다. */
export function verifyShardSet(
  entries: ReadonlyArray<{ manifest: ShardManifest; report: MutationReportLike | null }>
):
  { ok: true; reports: MutationReportLike[]; covered: string[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (entries.length === 0) {
    return { ok: false, errors: ['분할 배정 기록(shard-manifest.json)을 하나도 받지 못했습니다.'] };
  }

  const totals = new Set(entries.map((e) => e.manifest.total));
  const total = entries[0]!.manifest.total;
  if (totals.size !== 1) errors.push(`분할 수가 기록마다 다릅니다: ${[...totals].join(', ')}`);
  const indices = entries.map((e) => e.manifest.index).sort((a, b) => a - b);
  const expected = Array.from({ length: total }, (_, i) => i + 1);
  if (indices.join(',') !== expected.join(',')) {
    errors.push(`분할 기록이 1..${total} 과 맞지 않습니다(받은 번호: ${indices.join(', ')}).`);
  }

  const coveredKeys = new Set(entries.map((e) => e.manifest.covered.join('\n')));
  if (coveredKeys.size !== 1) {
    errors.push('분할마다 나눈 전체 대상 목록이 다릅니다(커버리지 맵·변경 목록 불일치).');
  }
  const covered = entries[0]!.manifest.covered;

  const seen = new Map<string, number>();
  for (const { manifest } of entries) {
    for (const file of manifest.assigned) {
      const other = seen.get(file);
      if (other !== undefined)
        errors.push(`${file} 이 분할 ${other} 과 ${manifest.index} 에 겹칩니다.`);
      seen.set(file, manifest.index);
    }
  }
  const missing = covered.filter((file) => !seen.has(file));
  if (missing.length > 0) errors.push(`어느 분할에도 배정되지 않은 파일: ${missing.join(', ')}`);
  const extra = [...seen.keys()].filter((file) => !covered.includes(file));
  if (extra.length > 0) errors.push(`전체 목록에 없는 파일이 배정됐습니다: ${extra.join(', ')}`);

  const reports: MutationReportLike[] = [];
  for (const { manifest, report } of entries) {
    if (manifest.assigned.length === 0) {
      if (report) errors.push(`분할 ${manifest.index} 은 맡은 파일이 없는데 리포트가 있습니다.`);
      continue;
    }
    if (!report) {
      errors.push(`분할 ${manifest.index} 의 리포트(mutation.json)가 없습니다.`);
      continue;
    }
    const assigned = new Set(manifest.assigned);
    const outside = Object.keys(report.files ?? {})
      .map((path) => path.replace(/\\/g, '/'))
      .filter((path) => !assigned.has(path));
    if (outside.length > 0) {
      errors.push(
        `분할 ${manifest.index} 의 리포트에 맡지 않은 파일이 있습니다: ${outside.join(', ')}`
      );
    }
    reports.push(report);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, reports, covered };
}
