/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.17 회귀 테스트 — 라우트 게이트.
 *
 * 비밀번호 재설정은 `USER:UPDATE` 보유자(또는 ADMIN)만 할 수 있어야 한다.
 * 본인 변경은 현재 비밀번호를 요구하는 POST /api/profile/password 를 거쳐야 하며,
 * 이 라우트로 우회할 수 있으면 그 확인 절차가 무력해진다.
 */

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getUserById: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock('@/lib/api-error-handler', () => ({
  handleApiError: (error: any) =>
    NextResponse.json({ error: error.message }, { status: error.statusCode || 500 }),
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any, context: any) => {
    try {
      return await handler(req, context);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
    }
  },
}));

vi.mock('@/services/user.service', () => ({
  UserService: class {
    updateUser = mocks.updateUser;
    getUserById = mocks.getUserById;
  },
}));

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanUpdateUser: vi.fn(),
    ensureCanReadUser: vi.fn(),
  };
});

import { PATCH } from '../route';

const targetUser = { id: 'target-1', name: '대상', clients: [], roles: [] };

const VALID_PASSWORD = 'NewPass1!';

const patch = async (body: unknown, user: any) =>
  (PATCH as any)(
    new NextRequest('http://localhost:3000/api/users/target-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { session: { user }, params: Promise.resolve({ id: 'target-1' }) }
  );

const admin = {
  id: 'admin-1',
  roles: ['ADMIN'],
  permissions: ['USER:UPDATE'],
  clientIds: [],
};

const selfOnly = {
  id: 'target-1',
  roles: ['CLIENT_USER'],
  permissions: ['USER:UPDATE_SELF'],
  clientIds: [],
};

describe('PATCH /api/users/[id] — 비밀번호 재설정 게이트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue(targetUser);
    mocks.updateUser.mockResolvedValue({ id: 'target-1', name: '대상' });
  });

  it('USER:UPDATE 보유자는 비밀번호를 서비스까지 전달한다', async () => {
    const response = await patch({ password: VALID_PASSWORD }, admin);

    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ password: VALID_PASSWORD }),
      'admin-1'
    );
  });

  it('타인을 관리할 수 없는 사용자는 비밀번호 변경이 403 으로 거부된다', async () => {
    const response = await patch({ password: VALID_PASSWORD }, selfOnly);

    // 조용히 무시하고 200 을 주면 호출자가 바뀐 줄 안다.
    expect(response.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('셀프 수정에서 비밀번호를 빼면 이름/이미지 수정은 계속 동작한다', async () => {
    const response = await patch({ name: '새 이름' }, selfOnly);

    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ name: '새 이름' }),
      'target-1'
    );
  });

  it('약한 비밀번호는 스키마 검증에서 거부된다', async () => {
    const response = await patch({ password: 'weak' }, admin);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
