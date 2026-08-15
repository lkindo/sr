import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 회원가입 화면의 고객사 선택 목록. **인증 없이** 접근 가능한 유일한 고객사 API 다.
 *
 * 그래서 두 가지가 계약이다.
 * 1. **비활성 고객사는 보이지 않는다.** 계약이 끝난 고객사가 가입 화면에 남으면
 *    엉뚱한 소속으로 가입 신청이 쌓인다.
 * 2. **필드를 좁게 고른다.** 익명에게 나가는 응답이므로 select 가 넓어지는 순간
 *    내부 메모·담당자·연락처 같은 것이 그대로 공개된다.
 */

const { mockFindMany, mockLoggerError } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: { client: { findMany: mockFindMany } } }));
// `withErrorHandler` 는 `auth-wrapper` 에 있고, 그 모듈이 `@/auth` 를 정적 import 한다.
// 이 라우트는 인증을 쓰지 않지만 모듈 그래프에는 들어오므로 next-auth 를 목으로 끊는다.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
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

/** 2026-08-15: 이 라우트는 `withErrorHandler` 를 경유한다(감사 D-11). */
const callGet = () =>
  (GET as never as (r: never, c: never) => Promise<Response>)(
    new Request('http://localhost/api/clients/public') as never,
    { params: Promise.resolve({}) } as never
  );

describe('GET /api/clients/public', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: 'c-1', name: '테스트 고객사 A', code: 'C001' }]);
  });

  it('활성 고객사만, 이름순으로 조회한다', async () => {
    const res = await callGet();

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
    );
  });

  // select 가 넓어지면 익명 사용자에게 내부 정보가 그대로 나간다.
  it('id·name·code 만 내보낸다', async () => {
    await callGet();

    const select = mockFindMany.mock.calls[0]![0].select;
    expect(Object.keys(select).sort()).toEqual(['code', 'id', 'name']);
  });

  // 유출 방지는 `handleApiError` 의 프로덕션 분기 책임이며
  // `api-error-handler.leak.test.ts` 가 고정한다. 라우트가 자체 catch 로 500 을 만들면
  // 그 중앙 통제를 우회하므로, 여기서 지키는 것은 **위임** 이다.
  it('조회가 실패하면 handleApiError 에 위임한다', async () => {
    mockFindMany.mockRejectedValue(new Error('relation "clients" does not exist'));

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
