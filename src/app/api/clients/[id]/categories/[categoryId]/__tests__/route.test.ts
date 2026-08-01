/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.18 — 서비스 카테고리 편집/삭제 라우트.
 *
 * 이 라우트가 없어서 카테고리는 생성만 가능했고(그 생성조차 UI 가 없었다),
 * 잘못 만든 카테고리를 앱 안에서 고칠 방법이 없었다.
 *
 * 경로 파라미터가 두 개(clientId, categoryId)라 IDOR 표면이 생긴다 —
 * 다른 고객사의 categoryId 를 끼워 넣어 수정·삭제하지 못하게 막아야 한다.
 */

const mocks = vi.hoisted(() => ({
  clientFindUnique: vi.fn(),
  categoryFindUnique: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: { findUnique: mocks.clientFindUnique },
    serviceCategory: { findUnique: mocks.categoryFindUnique },
  },
}));

vi.mock('@/services/service-category.service', () => ({
  serviceCategoryService: { update: mocks.update, delete: mocks.remove },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
    }
  },
}));

import { DELETE, PATCH } from '../route';

const ADMIN = { id: 'admin-1', roles: ['ADMIN'], permissions: ['CLIENT:UPDATE'], clientIds: [] };
const CLIENT_ADMIN = {
  id: 'ca-1',
  roles: ['CLIENT_ADMIN'],
  permissions: ['CLIENT:UPDATE'],
  clientIds: ['client-1'],
};

const ctx = (user: any, clientId = 'client-1', categoryId = 'cat-1') => ({
  session: { user },
  params: Promise.resolve({ id: clientId, categoryId }),
});

const patch = (body: unknown, user: any = ADMIN, clientId = 'client-1', categoryId = 'cat-1') =>
  (PATCH as any)(
    new NextRequest('http://localhost:3000/api/clients/client-1/categories/cat-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    ctx(user, clientId, categoryId)
  );

const del = (user: any = ADMIN, clientId = 'client-1', categoryId = 'cat-1') =>
  (DELETE as any)(
    new NextRequest('http://localhost:3000/api/clients/client-1/categories/cat-1', {
      method: 'DELETE',
    }),
    ctx(user, clientId, categoryId)
  );

describe('PATCH/DELETE /api/clients/[id]/categories/[categoryId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientFindUnique.mockResolvedValue({ id: 'client-1', name: '고객사' });
    mocks.categoryFindUnique.mockResolvedValue({ id: 'cat-1', clientId: 'client-1' });
    mocks.update.mockResolvedValue({ id: 'cat-1', categoryName: '수정됨' });
    mocks.remove.mockResolvedValue({ id: 'cat-1' });
  });

  it('카테고리를 수정한다', async () => {
    const response = await patch({ categoryName: '수정됨', slaHours: 8 });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      'cat-1',
      expect.objectContaining({ categoryName: '수정됨', slaHours: 8 })
    );
  });

  it('바디의 clientId 는 무시한다 (카테고리를 타 고객사로 옮길 수 없다)', async () => {
    await patch({ categoryName: 'x', clientId: 'other-client' });

    const passed = mocks.update.mock.calls[0][1];
    expect(passed.clientId).toBeUndefined();
  });

  it('다른 고객사의 카테고리는 404 로 막는다', async () => {
    // categoryId 는 존재하지만 clientId 가 다르다.
    mocks.categoryFindUnique.mockResolvedValue({ id: 'cat-1', clientId: 'other-client' });

    const response = await patch({ categoryName: 'x' });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('존재하지 않는 고객사면 404', async () => {
    mocks.clientFindUnique.mockResolvedValue(null);

    const response = await patch({ categoryName: 'x' });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('소속되지 않은 외부 사용자는 403', async () => {
    const outsider = { ...CLIENT_ADMIN, clientIds: ['other-client'] };

    const response = await patch({ categoryName: 'x' }, outsider);

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('자기 고객사의 CLIENT_ADMIN 은 수정할 수 있다', async () => {
    const response = await patch({ categoryName: 'x' }, CLIENT_ADMIN);

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('잘못된 값은 검증에서 거부한다', async () => {
    const response = await patch({ slaHours: -5 });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('카테고리를 삭제한다', async () => {
    const response = await del();

    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith('cat-1');
  });

  it('삭제도 타 고객사 카테고리는 404 로 막는다', async () => {
    mocks.categoryFindUnique.mockResolvedValue({ id: 'cat-1', clientId: 'other-client' });

    const response = await del();

    expect(response.status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('SR 이 연결된 카테고리 삭제 실패 사유를 그대로 전달한다', async () => {
    // 서비스가 참조 무결성으로 막는다. 사용자는 "비활성화하라"는 안내를 봐야 한다.
    const err: any = new Error(
      '이 카테고리에 3개의 SR이 연결되어 있습니다. 삭제 대신 비활성화를 사용하세요.'
    );
    err.statusCode = 409;
    mocks.remove.mockRejectedValue(err);

    const response = await del();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('비활성화');
  });
});
