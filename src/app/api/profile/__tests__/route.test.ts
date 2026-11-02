import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}));

// JWT 의 이메일은 로그인 때 값이다. 그 뒤 같은 주소를 다른 계정이 쓰는 상황을 고정한다.
const session = { user: { id: 'user-1', email: 'reused@example.com' } };

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: (r: unknown, c: unknown) => Promise<Response>) => (r: unknown) =>
    handler(r, { session }),
}));

import { GET, PATCH } from '../route';

type Route = (r: NextRequest) => Promise<Response>;

const profile = {
  id: 'user-1',
  name: '사용자',
  email: 'reused@example.com',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('/api/profile 의 사용자 식별', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(profile);
    mocks.update.mockResolvedValue(profile);
  });

  it('GET 은 세션의 이메일이 아니라 사용자 id 로 찾는다', async () => {
    const response = await (GET as unknown as Route)(
      new NextRequest('http://localhost/api/profile')
    );

    expect(response.status).toBe(200);
    expect(mocks.findUnique.mock.calls[0]![0].where).toEqual({ id: 'user-1' });
  });

  it('PATCH 는 세션의 이메일이 아니라 사용자 id 로 고친다', async () => {
    const response = await (PATCH as unknown as Route)(
      new NextRequest('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: '새 이름' }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0]![0].where).toEqual({ id: 'user-1' });
  });
});
