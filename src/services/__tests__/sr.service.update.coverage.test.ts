import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, NotFoundError } from '@/lib/errors';
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
});
