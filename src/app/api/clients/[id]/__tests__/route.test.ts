/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `/api/clients/[id]` 테넌트 경계 계약 (감사 3.6 / 4.1).
 *
 * 이 라우트는 감사에서 CRITICAL 로 지목된 교차 테넌트 조회 경로였다.
 * 조회 쪽은 `canReadClient` 에 테넌트 술어를 넣어 닫혔지만, **쓰기 쪽은 PATCH 에만**
 * 인라인 검사가 있었고 DELETE 에는 없었다. 규칙을 정책 계층으로 올리면서
 * 세 경로가 같은 술어를 공유하는지 여기서 고정한다.
 *
 * 정책 함수는 실물을 쓴다 — mock 으로 덮으면 라우트가 인가를 잃어도 통과한다.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClientWithDetailsAndCategories: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
}));

vi.mock('@/services/client.service', () => ({
  ClientService: class {
    getClientWithDetailsAndCategories = mocks.getClientWithDetailsAndCategories;
    updateClient = mocks.updateClient;
    deleteClient = mocks.deleteClient;
  },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler,
}));

import { PERMISSIONS } from '@/lib/permission-helpers';

import { DELETE, GET, PATCH } from '../route';

const TARGET = 'client-victim';

/** 외부 사용자. 권한 플래그는 전부 있지만 소속은 다른 고객사다. */
const outsider = {
  id: 'user-outsider',
  roles: ['CLIENT_ADMIN'],
  permissions: [PERMISSIONS.CLIENT.READ, PERMISSIONS.CLIENT.UPDATE, PERMISSIONS.CLIENT.DELETE],
  clientIds: ['client-own'],
};

/** 같은 권한을 갖고 대상 고객사에 소속된 외부 사용자. */
const member = { ...outsider, id: 'user-member', clientIds: [TARGET] };

const internal = {
  id: 'user-admin',
  roles: ['ADMIN'],
  permissions: [],
  clientIds: [],
};

const ctx = (user: unknown) => ({
  session: { user },
  params: Promise.resolve({ id: TARGET }),
});

const patchReq = () =>
  new NextRequest('http://localhost/x', {
    method: 'PATCH',
    body: JSON.stringify({ name: '변경된 고객사명' }),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClientWithDetailsAndCategories.mockResolvedValue({ id: TARGET, name: '고객사' });
  mocks.updateClient.mockResolvedValue({ id: TARGET });
  mocks.deleteClient.mockResolvedValue(undefined);
});

describe('GET — 교차 테넌트 조회 차단', () => {
  it('권한 플래그만 가진 외부 사용자를 거부한다', async () => {
    // 감사 3.6 의 핵심. CLIENT:READ 만으로 남의 고객사 전체 SR·사용자 명부를 받았다.
    await expect(
      (GET as any)(new NextRequest('http://localhost/x'), ctx(outsider))
    ).rejects.toThrow(/권한/);

    // 인가는 데이터 적재 **전에** 일어나야 한다.
    expect(mocks.getClientWithDetailsAndCategories).not.toHaveBeenCalled();
  });

  it('소속된 외부 사용자는 조회할 수 있다', async () => {
    const res = await (GET as any)(new NextRequest('http://localhost/x'), ctx(member));

    expect(res.status).toBe(200);
  });

  it('내부 사용자는 소속과 무관하게 조회할 수 있다', async () => {
    const res = await (GET as any)(new NextRequest('http://localhost/x'), ctx(internal));

    expect(res.status).toBe(200);
  });

  it('없는 고객사는 404 다', async () => {
    mocks.getClientWithDetailsAndCategories.mockResolvedValue(null);

    await expect(
      (GET as any)(new NextRequest('http://localhost/x'), ctx(internal))
    ).rejects.toThrow();
  });
});

describe('PATCH — 교차 테넌트 수정 차단', () => {
  it('권한 플래그만 가진 외부 사용자를 거부한다', async () => {
    await expect((PATCH as any)(patchReq(), ctx(outsider))).rejects.toThrow(/권한/);
    expect(mocks.updateClient).not.toHaveBeenCalled();
  });

  it('소속된 외부 사용자는 수정할 수 있다', async () => {
    const res = await (PATCH as any)(patchReq(), ctx(member));

    expect(res.status).toBe(200);
    // 행위자 id 와 ipAddress 가 서비스로 함께 내려가야 감사 로그가 누가 했는지 남긴다.
    expect(mocks.updateClient).toHaveBeenCalledWith(TARGET, expect.any(Object), member.id, null);
  });

  it('내부 사용자는 수정할 수 있다', async () => {
    const res = await (PATCH as any)(patchReq(), ctx(internal));

    expect(res.status).toBe(200);
  });
});

describe('DELETE — 교차 테넌트 삭제 차단', () => {
  it('권한 플래그만 가진 외부 사용자를 거부한다', async () => {
    // 이 검사가 없던 자리다. PATCH 에는 인라인 검사가 있었지만 DELETE 에는 없어서,
    // `CLIENT:DELETE` 를 가진 외부 사용자가 남의 고객사를 지울 수 있었다.
    await expect(
      (DELETE as any)(new NextRequest('http://localhost/x', { method: 'DELETE' }), ctx(outsider))
    ).rejects.toThrow(/권한/);

    expect(mocks.deleteClient).not.toHaveBeenCalled();
  });

  it('소속된 외부 사용자는 삭제할 수 있다', async () => {
    const res = await (DELETE as any)(
      new NextRequest('http://localhost/x', { method: 'DELETE' }),
      ctx(member)
    );

    expect(res.status).toBe(200);
    expect(mocks.deleteClient).toHaveBeenCalledWith(TARGET, member.id, null);
  });

  it('권한 자체가 없으면 소속이어도 거부한다', async () => {
    const noPermission = { ...member, permissions: [] };

    await expect(
      (DELETE as any)(
        new NextRequest('http://localhost/x', { method: 'DELETE' }),
        ctx(noPermission)
      )
    ).rejects.toThrow(/권한/);
  });
});
