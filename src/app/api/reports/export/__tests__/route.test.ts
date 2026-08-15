/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.39 회귀 테스트.
 *
 * 예전 구현은 5만 행을 한 번에 하이드레이트해 (1) Prisma 객체 배열, (2) 문자열 배열,
 * (3) join 한 거대 단일 문자열 — 세 사본을 동시에 힙에 올렸다. 컨테이너 힙이 450MB 라
 * 동시 2~3건이면 OOM-kill 이었고, 레이트리밋도 전혀 없었다.
 */

const mocks = vi.hoisted(() => ({
  getAllSRs: vi.fn(),
  rateLimitPreset: undefined as string | undefined,
}));

vi.mock('@/services/sr.service', () => ({
  srService: { getAllSRs: mocks.getAllSRs },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any, options: any) => {
    mocks.rateLimitPreset = options?.preset;
    return (request: any) => handler(request, { session: { user: SESSION_USER } });
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { logError: vi.fn(), logRequest: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let SESSION_USER: { id: string; roles: string[] } = { id: 'admin-1', roles: ['ADMIN'] };

import { GET } from '../route';

const makeSR = (i: number) => ({
  id: `sr-${i}`,
  srNumber: `SR-20260801-${String(i).padStart(4, '0')}`,
  title: `제목 ${i}`,
  status: 'COMPLETED',
  priority: 'HIGH',
  client: { name: '고객사' },
  requester: { name: '요청자' },
  assignee: { name: '담당자' },
  serviceCategory: { categoryName: '카테고리' },
  createdAt: new Date('2026-07-29T23:00:00.000Z'), // KST 로는 07-30
  completedAt: new Date('2026-07-30T02:00:00.000Z'),
});

/** findMany 를 총 `total` 행짜리 테이블처럼 동작시킨다. */
function seedRows(total: number) {
  mocks.getAllSRs.mockImplementation(async ({ skip = 0, take = 0 }: any) => {
    const end = Math.min(skip + take, total);
    if (skip >= end) return [];
    return Array.from({ length: end - skip }, (_, i) => makeSR(skip + i));
  });
}

const call = async () => {
  const response = await (GET as any)(new NextRequest('http://localhost:3000/api/reports/export'));
  const body = await response.text();
  return { response, body };
};

describe('GET /api/reports/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SESSION_USER = { id: 'admin-1', roles: ['ADMIN'] };
  });

  it('strict 레이트리밋으로 감싸져 있다', () => {
    // 예전에는 withAuthAndRateLimit 자체가 없어 인증 사용자 1명이 분당 100회까지
    // 5만 행 내보내기를 발행할 수 있었다.
    expect(mocks.rateLimitPreset).toBe('strict');
  });

  it('전체를 한 번에 읽지 않고 배치(1000행)로 나눠 읽는다', async () => {
    seedRows(2500);

    const { body } = await call();

    // 1000 + 1000 + 500 → 3회 조회
    expect(mocks.getAllSRs).toHaveBeenCalledTimes(3);
    for (const [args] of mocks.getAllSRs.mock.calls) {
      expect(args.take).toBeLessThanOrEqual(1000);
    }
    // 헤더 1줄 + 데이터 2500줄
    expect(body.trim().split('\n')).toHaveLength(2501);
  });

  it('배치가 순차적으로 skip 을 진행시킨다', async () => {
    seedRows(2500);
    await call();

    expect(mocks.getAllSRs.mock.calls.map(([a]) => a.skip)).toEqual([0, 1000, 2000]);
  });

  it('결과가 없어도 404 가 아니라 헤더만 담은 200 이다', async () => {
    seedRows(0);

    const { response, body } = await call();

    // 404 + 'No data found' 는 UI 에서 '내보내기 실패'로 표시됐다 —
    // 정직한 답("SR이 없습니다")을 하드 실패로 둔갑시켰다.
    expect(response.status).toBe(200);
    expect(body).toContain('SR 번호');
    expect(body.trim().split('\n')).toHaveLength(1);
  });

  it('캐시 금지 헤더를 설정한다', async () => {
    seedRows(1);
    const { response } = await call();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('50000행 상한을 넘겨 읽지 않는다', async () => {
    // 실제 50k 행을 만들면 전체 스위트와 병렬로 돌 때 느려서 불안정해진다.
    // 여기서 검증할 것은 "루프가 상한에서 멈추는가" 뿐이므로, 행은 최소 형태로 돌려주고
    // 요청된 take 합계만 본다(DB 는 항상 요청한 만큼 준다고 가정).
    const minimalRow = { srNumber: 'x', title: 't', status: 'COMPLETED', priority: 'LOW' };
    mocks.getAllSRs.mockImplementation(async ({ take }: any) =>
      Array.from({ length: take }, () => minimalRow)
    );

    await call();

    const totalRequested = mocks.getAllSRs.mock.calls.reduce((sum, [a]) => sum + a.take, 0);
    expect(totalRequested).toBe(50000);
    // 무한 루프에 빠지지 않고 정확히 50배치에서 멈춰야 한다.
    expect(mocks.getAllSRs).toHaveBeenCalledTimes(50);
  });

  it('날짜를 KST 기준으로 쓴다 (UTC 면 하루 밀린다)', async () => {
    seedRows(1);
    const { body } = await call();

    // createdAt 은 UTC 로 2026-07-29T23:00Z = KST 2026-07-30
    expect(body).toContain('2026. 07. 30.');
    expect(body).not.toContain('2026. 07. 29.');
  });

  it('ENGINEER 는 자신에게 배정된 SR 로만 범위가 제한된다', async () => {
    SESSION_USER = { id: 'eng-1', roles: ['ENGINEER'] };
    seedRows(1);

    await call();

    expect(mocks.getAllSRs.mock.calls[0]![0].where).toEqual({
      deletedAt: null,
      assigneeId: 'eng-1',
    });
  });

  it('ADMIN 은 전체를 대상으로 한다', async () => {
    seedRows(1);
    await call();

    // 삭제된 SR 은 ADMIN 의 전체 내보내기에서도 빠진다(db-rules §2).
    expect(mocks.getAllSRs.mock.calls[0]![0].where).toEqual({ deletedAt: null });
  });

  it('권한 없는 역할은 403', async () => {
    SESSION_USER = { id: 'u-1', roles: ['CLIENT_USER'] };

    const { response } = await call();

    expect(response.status).toBe(403);
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
  });

  it('CSV 수식 인젝션을 이스케이프한다', async () => {
    mocks.getAllSRs.mockImplementation(async ({ skip = 0 }: any) =>
      skip === 0 ? [{ ...makeSR(1), title: '=cmd|calc' }] : []
    );

    const { body } = await call();

    expect(body).toContain(`"'=cmd|calc"`);
  });
});
