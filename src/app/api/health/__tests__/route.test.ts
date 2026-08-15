import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 헬스체크는 **인증 없이 누구나** 부를 수 있다. uptime-kuma 가 이 응답만 보고
 * 서비스 생사를 판단하므로 계약이 둘이다.
 *
 * 1. DB 가 죽으면 반드시 503 이어야 한다. 200 을 주면 감시가 초록인 채로 장애가 흐른다.
 * 2. 실패 사유를 밖으로 흘리지 않는다. 드라이버 에러 메시지에는 호스트·포트·사용자명이
 *    들어 있고, 이 엔드포인트는 익명 공개다.
 */

const { mockQueryRaw, mockLoggerError } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: mockQueryRaw } }));
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET } from '../route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DB 가 응답하면 healthy 를 준다', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(typeof body.timestamp).toBe('string');
  });

  it('DB 가 죽으면 503 을 준다', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
  });

  // 익명 공개 엔드포인트다. 원인은 로그에만 남고 응답에는 나가지 않아야 한다.
  it('실패 사유를 응답에 노출하지 않는다', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 user=sr_admin'));

    const res = await GET();
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('sr_admin');
    // 대신 운영자가 볼 수 있도록 로그에는 남긴다.
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
