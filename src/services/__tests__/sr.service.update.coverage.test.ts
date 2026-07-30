import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(prisma)),
    sR: { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    serviceCategory: { findUnique: vi.fn() },
    sRActivity: { create: vi.fn() },
    // 담당자 배정 검증(assertAssignable) 및 배정 가능 사용자 목록 조회에 사용된다.
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}));

// ensure* 만 스텁으로 대체하고 isInternalUser 는 실제 구현을 사용한다.
// (테넌트 판정을 mock 반환값으로 조작하면 이관 경계 검증이 무력화된다.)
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanUpdateSR: vi.fn(),
    ensureCanCreateSR: vi.fn(),
  };
});

describe('SRService.updateSR Branches', () => {
  let srService: SRService;

  // 내부(MANAGER) 사용자 — 테넌트 가드를 통과하므로 고객사 존재/활성 검증 분기까지 도달한다.
  const internalUser = { id: 'u1', roles: ['MANAGER'], permissions: [], clientIds: [] } as any;

  // 외부(고객사) 사용자 — 'own-c' 에만 소속. 테넌트 경계 시나리오 전용.
  const externalUser = {
    id: 'u2',
    roles: ['USER'],
    permissions: [],
    clientIds: ['own-c'],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // 배정 가능 사용자 목록 기본값(권한 카탈로그/사용자 조회) — 필요한 테스트에서만 덮어쓴다.
    vi.mocked(prisma.role.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
    srService = new SRService();
  });

  it('throws error when changing client if status is not REQUESTED', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'IN_PROGRESS',
      clientId: 'old-c',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, internalUser)).rejects.toThrow(
      /접수 후에는 고객사를 변경할 수 없습니다/
    );
  });

  it('throws NotFoundError when new client does not exist', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'old-c',
    } as any);
    vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    // 내부 사용자여야 테넌트 가드를 통과해 "고객사 미존재" 분기까지 도달한다.
    await expect(
      srService.updateSR('sr-1', { clientId: 'non-existent' }, internalUser)
    ).rejects.toThrow(NotFoundError);
  });

  it('throws error when new client is inactive', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'old-c',
    } as any);
    vi.mocked(prisma.client.findUnique).mockResolvedValue({
      id: 'new-c',
      isActive: false,
      name: 'Inactive Corp',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    // 내부 사용자여야 테넌트 가드를 통과해 "비활성 고객사" 분기까지 도달한다.
    await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, internalUser)).rejects.toThrow(
      /비활성 상태의 고객사/
    );
  });

  it('외부 사용자가 소속되지 않은 고객사로 SR을 이관하면 ForbiddenError (고객사 조회 이전에 차단)', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'own-c',
    } as any);
    vi.mocked(prisma.client.findUnique).mockResolvedValue({
      id: 'foreign-c',
      isActive: true,
      name: '남의 고객사',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    await expect(
      srService.updateSR('sr-1', { clientId: 'foreign-c' }, externalUser)
    ).rejects.toThrow(ForbiddenError);

    // 가드가 조회보다 먼저 실행되어야 타 고객사의 존재/이름이 새지 않는다.
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('외부 사용자가 소속된 고객사로의 이관은 정상 처리된다', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'old-c',
      serviceCategoryId: 'cat-1',
    } as any);
    vi.mocked(prisma.client.findUnique).mockResolvedValue({
      id: 'own-c',
      isActive: true,
      name: 'Own Corp',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    const txMock = {
      sR: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ id: 'sr-1', clientId: 'own-c' }),
      },
      sRActivity: { create: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

    await srService.updateSR('sr-1', { clientId: 'own-c' }, externalUser);

    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'own-c' } });
    expect(vi.mocked(txMock.sR.update).mock.calls[0][0].data.clientId).toBe('own-c');
  });

  it('타 고객사 전용 서비스 카테고리로 변경하면 ForbiddenError', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'IN_PROGRESS',
      clientId: 'own-c',
      serviceCategoryId: 'cat-1',
    } as any);
    vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
      clientId: 'other-c',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    await expect(
      srService.updateSR('sr-1', { serviceCategoryId: 'cat-of-other-c' }, externalUser)
    ).rejects.toThrow(ForbiddenError);

    // 경계 위반은 갱신 트랜잭션 이전에 차단되어야 한다.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws error when missing required fields for status transition', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'INTAKE' } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    await expect(
      srService.updateSR('sr-1', { status: 'IN_PROGRESS' }, { ...internalUser, roles: ['ADMIN'] })
    ).rejects.toThrow(/상태로 전환하려면 다음 필드가 필요합니다/);
  });

  it('throws error when changing assignee of COMPLETED SR', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'COMPLETED',
      assigneeId: 'old-a',
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    await expect(srService.updateSR('sr-1', { assigneeId: 'new-a' }, internalUser)).rejects.toThrow(
      /완료되거나 확정된 SR의 담당자는 변경할 수 없습니다/
    );
  });

  it('adjusts due date when actualPriority changes', async () => {
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'IN_PROGRESS',
      serviceCategoryId: 'cat-1',
      actualPriority: 'LOW',
      intakeAt: new Date('2023-10-10T00:00:00Z'),
    } as any);
    vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
      id: 'cat-1',
      slaHours: 24,
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    const txMock = {
      sR: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ id: 'sr-1' }),
      },
      sRActivity: { create: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

    await srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, internalUser);

    const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
    expect(updateData.dueDate).toBeDefined();
    // 24 * 0.5 = 12 hours added to intakeAt
    expect(updateData.dueDate.toISOString()).toBe('2023-10-10T12:00:00.000Z');
  });

  // 접수(트리아지) 필드는 운영 전용이다. 외부 사용자가 SLA 기한/우선순위/담당자를
  // 직접 바꿀 수 있으면 SLA 준수율 지표가 위조되고 담당자가 조용히 재배정된다.
  describe('운영 전용 필드 인가 및 담당자 검증', () => {
    const intakedSR = {
      id: 'sr-1',
      srNumber: 'SR-001',
      title: '제목',
      status: 'IN_PROGRESS',
      clientId: 'own-c',
      requesterId: 'u2',
      assigneeId: 'eng-1',
      serviceCategoryId: 'cat-1',
      actualPriority: 'LOW',
      dueDate: new Date('2023-10-20T00:00:00.000Z'),
      intakeAt: new Date('2023-10-10T00:00:00.000Z'),
    };

    let txMock: {
      sR: { updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      sRActivity: { create: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(intakedSR as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      txMock = {
        sR: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ ...intakedSR }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));
    });

    it('외부 사용자가 dueDate를 바꾸면 ForbiddenError이며 갱신이 실행되지 않는다', async () => {
      await expect(
        srService.updateSR('sr-1', { dueDate: '2030-01-01' }, externalUser)
      ).rejects.toThrow(ForbiddenError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txMock.sR.update).not.toHaveBeenCalled();
    });

    it('POSITIVE: 외부 사용자는 본인 고객사 SR의 제목/설명을 계속 수정할 수 있다', async () => {
      await srService.updateSR(
        'sr-1',
        { title: '수정된 제목', description: '수정된 설명입니다.' },
        externalUser
      );

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
      expect(updateData.title).toBe('수정된 제목');
      expect(updateData.description).toBe('수정된 설명입니다.');
      // 운영 전용 필드는 요청에 없었으므로 그대로 남는다.
      expect(updateData.dueDate).toBeUndefined();
      expect(updateData.assigneeId).toBeUndefined();
    });

    it('내부 사용자라도 비활성 사용자에게는 담당자를 배정할 수 없다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'inactive-1',
        name: '퇴사자',
        email: 'gone@example.com',
        isActive: false,
      } as any);

      await expect(
        srService.updateSR('sr-1', { assigneeId: 'inactive-1' }, internalUser)
      ).rejects.toThrow(BadRequestError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txMock.sR.update).not.toHaveBeenCalled();
    });

    it('내부 사용자라도 존재하지 않는 담당자는 배정할 수 없다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        srService.updateSR('sr-1', { assigneeId: 'ghost' }, internalUser)
      ).rejects.toThrow(NotFoundError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('POSITIVE: 내부 사용자는 활성 SR 처리자에게 담당자를 배정할 수 있다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'eng-2',
        name: 'Engineer 2',
        email: 'eng2@example.com',
        isActive: true,
      } as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'eng-2', name: 'Engineer 2', email: 'eng2@example.com' },
      ] as any);

      await srService.updateSR('sr-1', { assigneeId: 'eng-2' }, internalUser);

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
      expect(updateData.assigneeId).toBe('eng-2');
    });
  });
});
