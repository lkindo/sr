import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAll, ServiceCategoryServiceMock } = vi.hoisted(() => {
  const mockGetAll = vi.fn();
  class ServiceCategoryServiceMock {
    getAll = mockGetAll;
  }
  return { mockGetAll, ServiceCategoryServiceMock };
});

vi.mock('@/services/service-category.service', () => ({
  ServiceCategoryService: ServiceCategoryServiceMock,
  serviceCategoryService: new ServiceCategoryServiceMock(),
}));

// Mock auth-wrapper — 세션은 각 테스트가 주입한다.
vi.mock('@/lib/auth-wrapper', () => ({
  withAuth: (handler: any) => handler,
  withAuthAndRateLimit: (handler: any) => handler,
}));

// `isInternalUser` 는 실물을 쓴다. 여기서 가짜로 덮으면 내부/외부 판정 자체가
// 테스트 안에서 뒤바뀌어, 라우트가 스코핑을 통째로 잃어도 통과해 버린다.

import { GET } from '../route';

const internalSession = { user: { id: 'admin-1', roles: ['ADMIN'], clientIds: [] } };
const externalSession = {
  user: { id: 'client-user-1', roles: ['CLIENT_ADMIN'], clientIds: ['client-A'] },
};

const call = (session: unknown) =>
  GET(
    new Request('http://localhost/api/service-categories') as NextRequest,
    {
      params: {},
      session,
    } as any
  );

describe('GET /api/service-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
  });

  it('모든 서비스 카테고리를 반환해야 함', async () => {
    const mockCategories = [
      { id: '1', name: 'Category 1', clientId: 'client1' },
      { id: '2', name: 'Category 2', clientId: 'client1' },
    ];
    mockGetAll.mockResolvedValue(mockCategories);

    const response = await call(internalSession);

    expect(await response.json()).toEqual(mockCategories);
    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  it('빈 배열을 반환할 수 있어야 함', async () => {
    const response = await call(internalSession);

    expect(await response.json()).toEqual([]);
    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  it('서비스에서 에러가 발생하면 에러를 전파해야 함', async () => {
    mockGetAll.mockRejectedValue(new Error('Database error'));

    await expect(call(internalSession)).rejects.toThrow('Database error');
  });
});

/**
 * 테넌트 스코핑 (감사 4.1).
 *
 * 예전에는 인가 검사 없는 `withAuth` 로 `getAll()` 을 인자 없이 호출해, 모든 인증
 * 사용자에게 **전 고객사의 카테고리 + SLA + 담당자 이메일**을 반환했다.
 */
describe('GET /api/service-categories — 테넌트 스코핑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
  });

  it('내부 사용자에게는 스코프를 걸지 않는다', async () => {
    await call(internalSession);

    const options = mockGetAll.mock.calls[0]![0];
    expect(options.clientIds).toBeUndefined();
    expect(options.includeHandlerEmail).toBe(true);
  });

  it('외부 사용자는 소속 고객사로 스코프된다', async () => {
    await call(externalSession);

    const options = mockGetAll.mock.calls[0]![0];
    expect(options.clientIds).toEqual(['client-A']);
  });

  it('외부 사용자에게는 담당자 이메일을 주지 않는다', async () => {
    await call(externalSession);

    expect(mockGetAll.mock.calls[0]![0].includeHandlerEmail).toBe(false);
  });

  it('소속이 없는 외부 사용자에게 전체를 주지 않는다', async () => {
    await call({ user: { id: 'u', roles: ['CLIENT_USER'], clientIds: [] } });

    const options = mockGetAll.mock.calls[0]![0];
    // `undefined`(전체)가 아니라 `[]`(없음)여야 한다.
    expect(options.clientIds).toEqual([]);
    expect(options.clientIds).not.toBeUndefined();
  });
});
