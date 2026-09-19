import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 비활성화 경로 통일(2026-09-18 소유자 결정 D12).
 *
 * 예전에는 상세 화면의 '비활성화'(deactivateUser)만 진행 중 SR 검사를 했고, 목록 토글·일괄 비활성화·조직도
 * 토글이 쓰는 PATCH isActive:false(updateUser)는 검사 없이 통과했다. 그래서 담당자가 비활성 계정인 채 아무도
 * 처리하지 않는 SR 이 생겼다. 이제 두 경로가 같은 검사를 거치고, 감사 로그도 같은 행위 이름을 쓴다.
 */

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  srFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const client = {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    sR: { findMany: mocks.srFindMany },
    auditLog: { create: mocks.auditCreate },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(client));
  return { default: client };
});

import { UserService } from '@/services/user.service';

const service = new UserService();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({ id: 'eng-1', isActive: true, roles: [], clients: [] });
  mocks.userUpdate.mockResolvedValue({ id: 'eng-1', isActive: false });
  mocks.srFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
});

describe('활성 토글(updateUser)로 끄는 비활성화', () => {
  it('진행 중인 SR 이 배정돼 있으면 거부하고 아무것도 쓰지 않는다', async () => {
    mocks.srFindMany.mockResolvedValue([{ id: 'sr-1', srNumber: 'SR-001', status: 'IN_PROGRESS' }]);

    await expect(service.updateUser('eng-1', { isActive: false }, 'admin-1')).rejects.toThrow(
      '진행 중인 SR이 할당되어 있습니다'
    );
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('진행 중인 SR 이 없으면 비활성화하고 USER_DEACTIVATE 로 남긴다', async () => {
    await service.updateUser('eng-1', { isActive: false }, 'admin-1');

    expect(mocks.userUpdate).toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin-1', actionType: 'USER_DEACTIVATE' }),
    });
  });

  it('다시 켜는 것(재활성화)은 검사하지 않고 USER_UPDATE 로 남긴다', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'eng-1',
      isActive: false,
      roles: [],
      clients: [],
    });

    await service.updateUser('eng-1', { isActive: true }, 'admin-1');

    expect(mocks.srFindMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actionType: 'USER_UPDATE' }),
    });
  });
});
