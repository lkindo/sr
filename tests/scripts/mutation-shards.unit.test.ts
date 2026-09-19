import { describe, expect, it } from 'vitest';

import {
  aggregateReports,
  assignShards,
  buildManifest,
  type MutationReportLike,
  parseShardEnv,
  type ShardManifest,
  verifyShardSet,
  type WeightedFile,
} from '../../scripts/lib/mutation-shards';

/**
 * 뮤테이션 분할 실행(scripts/stryker-ci.ts·stryker-aggregate.ts)의 순수 로직.
 *
 * 분할이 틀리면 조용히 게이트가 약해진다 — 어떤 파일이 어느 분할에도 안 들어가면 검사되지 않고, 두 분할에
 * 들어가면 시간만 늘고, 작업마다 배분이 다르면 둘 다 일어난다. 합산 점수가 Stryker 와 다르면 기준(45%)의
 * 의미가 바뀐다.
 */

const files = (entries: Array<[string, number]>): WeightedFile[] =>
  entries.map(([path, weight]) => ({ path, weight }));

describe('assignShards', () => {
  it('모든 파일을 정확히 한 번씩 배정한다 — 빠지거나 겹치는 파일이 없다', () => {
    const input = files([
      ['src/a.ts', 900],
      ['src/b.ts', 50],
      ['src/c.ts', 400],
      ['src/d.ts', 400],
      ['src/e.ts', 10],
      ['src/f.ts', 700],
      ['src/g.ts', 300],
    ]);

    const shards = assignShards(input, 3);

    expect(shards).toHaveLength(3);
    expect(shards.flat().sort()).toEqual(input.map((f) => f.path).sort());
  });

  it('무거운 파일부터 가장 가벼운 묶음에 넣어 부하를 고르게 나눈다', () => {
    const input = files([
      ['src/big.ts', 1000],
      ['src/m1.ts', 500],
      ['src/m2.ts', 500],
      ['src/s1.ts', 250],
      ['src/s2.ts', 250],
    ]);

    const loads = assignShards(input, 2).map((paths) =>
      paths.reduce((sum, p) => sum + input.find((f) => f.path === p)!.weight, 0)
    );

    expect(loads.sort()).toEqual([1250, 1250]);
  });

  it('같은 입력이면 순서가 달라도 같은 배분을 낸다 — 분할 작업마다 따로 계산하므로', () => {
    const input = files([
      ['src/x.ts', 100],
      ['src/y.ts', 100],
      ['src/z.ts', 100],
      ['src/w.ts', 300],
    ]);

    expect(assignShards([...input].reverse(), 2)).toEqual(assignShards(input, 2));
  });

  it('파일보다 분할이 많으면 남는 분할은 비어 있다', () => {
    expect(assignShards(files([['src/only.ts', 10]]), 4)).toEqual([['src/only.ts'], [], [], []]);
  });

  it('분할 수가 1 이상의 정수가 아니면 던진다', () => {
    expect(() => assignShards([], 0)).toThrow();
    expect(() => assignShards([], 1.5)).toThrow();
  });
});

describe('parseShardEnv', () => {
  it('값이 없으면 분할하지 않는다(1/1 — 로컬 실행)', () => {
    expect(parseShardEnv(undefined, undefined)).toEqual({ index: 1, total: 1 });
  });

  it('CI 가 넘긴 번호를 읽는다', () => {
    expect(parseShardEnv('3', '4')).toEqual({ index: 3, total: 4 });
  });

  it.each([
    ['0', '4'],
    ['5', '4'],
    ['1', '0'],
    ['a', '4'],
    ['2', undefined],
    [undefined, '4'],
  ])('잘못된 조합(index=%s, total=%s)은 조용히 1/1 로 바꾸지 않고 던진다', (index, total) => {
    expect(() => parseShardEnv(index, total)).toThrow();
  });
});

describe('aggregateReports', () => {
  const report = (entries: Record<string, string[]>): MutationReportLike => ({
    files: Object.fromEntries(
      Object.entries(entries).map(([path, statuses]) => [
        path,
        { mutants: statuses.map((status) => ({ status })) },
      ])
    ),
  });

  it('Stryker 와 같은 공식으로 전체 점수를 낸다: (Killed+Timeout) / (Killed+Timeout+Survived+NoCoverage)', () => {
    const totals = aggregateReports([
      report({ 'src/a.ts': ['Killed', 'Killed', 'Survived', 'Timeout'] }),
      report({ 'src/b.ts': ['Killed', 'NoCoverage', 'CompileError', 'RuntimeError', 'Ignored'] }),
    ]);

    expect(totals).toMatchObject({
      killed: 3,
      timeout: 1,
      survived: 1,
      noCoverage: 1,
      invalid: 2,
      ignored: 1,
      pending: 0,
    });
    // 검출 4 / 유효 6 — CompileError·RuntimeError·Ignored 는 점수에서 뺀다.
    expect(totals.score).toBeCloseTo((4 / 6) * 100, 10);
    expect(totals.files.map((f) => [f.path, f.score])).toEqual([
      ['src/a.ts', 75],
      ['src/b.ts', 50],
    ]);
  });

  it('분할마다 판정했다면 실패했을 PR 도 전체 점수로 판정한다', () => {
    // 약한 파일만 모인 분할은 20%(기준 45% 미달), 전체는 80%(통과).
    const weak = report({
      'src/weak.ts': ['Killed', 'Survived', 'Survived', 'Survived', 'Survived'],
    });
    const strong = report({ 'src/strong.ts': Array.from({ length: 15 }, () => 'Killed') });

    expect(aggregateReports([weak]).score).toBe(20);
    expect(aggregateReports([weak, strong]).score).toBe(80);
  });

  it('같은 파일이 두 리포트에 있으면 뮤턴트를 합친다', () => {
    const totals = aggregateReports([
      report({ 'src/a.ts': ['Killed'] }),
      report({ 'src/a.ts': ['Survived'] }),
    ]);

    expect(totals.files).toHaveLength(1);
    expect(totals.score).toBe(50);
  });

  it('유효한 뮤턴트가 없으면 점수를 내지 않는다(null)', () => {
    expect(aggregateReports([]).score).toBeNull();
    expect(aggregateReports([report({ 'src/a.ts': ['CompileError'] })]).score).toBeNull();
  });
});

/**
 * 합산 전 완결성 확인. 리포트만 보면 결과가 빠졌는지(업로드 실패·아티팩트 만료·재실행 혼선) 대상이 없었는지
 * 구분할 수 없어, 빠진 채로 통과할 수 있었다. 분할마다 남긴 배정 기록으로 막는다.
 */
describe('verifyShardSet', () => {
  const covered = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
  const rep = (...paths: string[]): MutationReportLike => ({
    files: Object.fromEntries(paths.map((path) => [path, { mutants: [{ status: 'Killed' }] }])),
  });
  const entry = (manifest: ShardManifest, report: MutationReportLike | null) => ({
    manifest,
    report,
  });
  const complete = () => [
    entry(buildManifest(1, 3, covered, ['src/a.ts']), rep('src/a.ts')),
    entry(buildManifest(2, 3, covered, ['src/b.ts', 'src/c.ts']), rep('src/b.ts', 'src/c.ts')),
    entry(buildManifest(3, 3, covered, []), null),
  ];

  it('모든 분할이 같은 목록을 빠짐·겹침 없이 나눴고 리포트가 있으면 통과한다(빈 분할은 리포트 없음)', () => {
    const result = verifyShardSet(complete());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reports).toHaveLength(2);
      expect(result.covered).toEqual(covered);
    }
  });

  it('배정 기록을 하나도 받지 못하면 실패한다 — 결과 없이 통과시키지 않는다', () => {
    expect(verifyShardSet([]).ok).toBe(false);
  });

  it('분할 하나의 결과(기록)가 빠지면 실패한다', () => {
    const result = verifyShardSet(complete().slice(0, 2));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/1\.\.3/);
  });

  it('파일을 맡은 분할의 리포트가 없으면 실패한다', () => {
    const entries = complete();
    entries[1] = entry(entries[1]!.manifest, null);

    expect(verifyShardSet(entries).ok).toBe(false);
  });

  it('분할마다 전체 목록이 다르면(커버리지 맵 불일치) 실패한다', () => {
    const entries = complete();
    entries[2] = entry(buildManifest(3, 3, ['src/a.ts', 'src/b.ts'], []), null);

    expect(verifyShardSet(entries).ok).toBe(false);
  });

  it('같은 파일을 두 분할이 맡거나 어느 분할도 맡지 않으면 실패한다', () => {
    const overlapping = complete();
    overlapping[2] = entry(buildManifest(3, 3, covered, ['src/a.ts']), rep('src/a.ts'));
    const dropped = complete();
    dropped[1] = entry(buildManifest(2, 3, covered, ['src/b.ts']), rep('src/b.ts'));

    expect(verifyShardSet(overlapping).ok).toBe(false);
    expect(verifyShardSet(dropped).ok).toBe(false);
  });

  it('리포트에 그 분할이 맡지 않은 파일이 있으면 실패한다(재실행으로 섞인 결과)', () => {
    const entries = complete();
    entries[0] = entry(entries[0]!.manifest, rep('src/a.ts', 'src/b.ts'));

    expect(verifyShardSet(entries).ok).toBe(false);
  });

  it('모든 분할이 대상 없음이면 통과하고 전체 목록은 비어 있다', () => {
    const result = verifyShardSet([
      entry(buildManifest(1, 2, [], []), null),
      entry(buildManifest(2, 2, [], []), null),
    ]);

    expect(result).toEqual({ ok: true, reports: [], covered: [] });
  });
});
