/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 서버 액션의 고객사 테넌트 경계 (감사 4.1).
 *
 * `updateClientAction` / `deleteClientAction` 은 `authenticateAndAuthorize` 로 **권한
 * 플래그만** 확인하고 서비스로 직행했다. 대응 REST 라우트의 PATCH 에는 소속 검사가
 * 있었지만 액션에는 없어서, `CLIENT:UPDATE` 를 가진 외부 사용자가 남의 고객사를
 * 수정·삭제할 수 있었다.
 *
 * 형제 파일 `client.actions.coverage.test.ts` 와 달리 **정책을 mock 하지 않는다.**
 * 그쪽은 배선을 보고, 이 파일은 경계 자체를 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateAndAuthorize: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
}));

// action-helpers 는 통째로 mock 한다 — 실물을 import 하면 next-auth 체인이 딸려 와
// 이 테스트 환경에서 로드되지 않는다(형제 파일도 같은 이유로 같은 방식이다).
// `validateWithSchema` 는 실제 zod 파싱을 그대로 써서 검증 분기를 진짜로 태운다.
vi.mock('@/lib/action-helpers', async () => {
  const { z } = await import('zod');
  return {
    authenticateAndAuthorize: mocks.authenticateAndAuthorize,
    getAuthenticatedSession: vi.fn(),
    validateWithSchema: (data: unknown, schema: any) => {
      try {
        return { success: true, data: schema.parse(data) };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: error.issues?.[0]?.message || '입력값 검증에 실패했습니다.',
            code: 'VALIDATION_ERROR',
          };
        }
        throw error;
      }
    },
  };
});

vi.mock('@/services/service-registry', () => ({
  services: {
    clientService: {
      updateClient: mocks.updateClient,
      deleteClient: mocks.deleteClient,
    },
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { PERMISSIONS } from '@/lib/permission-helpers';

import { deleteClientAction, updateClientAction } from '../client.actions';

const TARGET = 'client-victim';

const outsider = {
  id: 'user-outsider',
  roles: ['CLIENT_ADMIN'],
  permissions: [PERMISSIONS.CLIENT.UPDATE, PERMISSIONS.CLIENT.DELETE],
  clientIds: ['client-own'],
};

const member = { ...outsider, id: 'user-member', clientIds: [TARGET] };
const internal = { id: 'user-admin', roles: ['ADMIN'], permissions: [], clientIds: [] };

const form = () => {
  const fd = new FormData();
  fd.set('name', '변경된 고객사명');
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateClient.mockResolvedValue({ id: TARGET });
  mocks.deleteClient.mockResolvedValue(undefined);
});

describe('updateClientAction', () => {
  it('소속되지 않은 고객사는 수정할 수 없다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: outsider });

    const result: any = await updateClientAction(TARGET, form());

    expect(result.success).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    expect(mocks.updateClient).not.toHaveBeenCalled();
  });

  it('소속된 고객사는 수정할 수 있다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: member });

    const result: any = await updateClientAction(TARGET, form());

    expect(result.success).toBe(true);
    expect(mocks.updateClient).toHaveBeenCalledWith(TARGET, expect.any(Object), member.id, null);
  });

  it('내부 사용자는 소속과 무관하게 수정할 수 있다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: internal });

    const result: any = await updateClientAction(TARGET, form());

    expect(result.success).toBe(true);
  });
});

describe('deleteClientAction', () => {
  it('소속되지 않은 고객사는 삭제할 수 없다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: outsider });

    const result: any = await deleteClientAction(TARGET);

    expect(result.success).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    expect(mocks.deleteClient).not.toHaveBeenCalled();
  });

  it('소속된 고객사는 삭제할 수 있다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: member });

    const result: any = await deleteClientAction(TARGET);

    expect(result.success).toBe(true);
    expect(mocks.deleteClient).toHaveBeenCalledWith(TARGET, member.id, null);
  });

  it('내부 사용자는 삭제할 수 있다', async () => {
    mocks.authenticateAndAuthorize.mockResolvedValue({ user: internal });

    const result: any = await deleteClientAction(TARGET);

    expect(result.success).toBe(true);
  });

  it('소속 정보가 아예 없는 외부 사용자도 거부한다', async () => {
    // clientIds 가 undefined 인 토큰(조회 실패 등)을 "전체 허용"으로 읽으면 안 된다.
    mocks.authenticateAndAuthorize.mockResolvedValue({
      user: { id: 'u', roles: ['CLIENT_USER'], permissions: [], clientIds: undefined },
    });

    const result: any = await deleteClientAction(TARGET);

    expect(result.success).toBe(false);
    expect(mocks.deleteClient).not.toHaveBeenCalled();
  });
});
