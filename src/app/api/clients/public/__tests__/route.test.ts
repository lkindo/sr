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
vi.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/clients/public', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: 'c-1', name: '테스트 고객사 A', code: 'C001' }]);
  });

  it('활성 고객사만, 이름순으로 조회한다', async () => {
    const res = await GET();

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
    await GET();

    const select = mockFindMany.mock.calls[0]![0].select;
    expect(Object.keys(select).sort()).toEqual(['code', 'id', 'name']);
  });

  it('조회가 실패하면 500 과 일반 문구만 준다', async () => {
    mockFindMany.mockRejectedValue(new Error('relation "clients" does not exist'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('고객사 목록을 불러올 수 없습니다.');
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
