import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/sr-email-outbox', () => ({
  enqueueSRCreatedEmails: vi.fn().mockResolvedValue(0),
  enqueueSRStatusChangedEmail: vi.fn().mockResolvedValue(0),
  enqueueSRAssignedEmail: vi.fn().mockResolvedValue(0),
}));

// Mock prisma with the delegates updateSR touches.
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb: any) => cb(mock)),
    sR: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockPrisma: mock };
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

// Authorization is covered elsewhere; allow it here so we exercise the locking path.
vi.mock('@/lib/policies', () => ({
  ensureCanUpdateSR: vi.fn(),
  ensureCanEditSRContent: vi.fn(),
  canWriteSROperatorFields: vi.fn(() => true),
}));

vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: vi.fn(),
  REALTIME_EVENTS: { SR_UPDATED: 'sr:updated' },
}));

vi.mock('@/lib/domain-events', () => ({
  domainEvents: { emit: vi.fn() },
}));

vi.mock('@/lib/wait-until', () => ({ backgroundTask: vi.fn() }));

import { ConflictError, ForbiddenError } from '@/lib/errors';
import { ensureCanEditSRContent, ensureCanUpdateSR } from '@/lib/policies';
import { SRService } from '@/services/sr.service';

describe('SRService.updateSR — optimistic locking', () => {
  let srService: SRService;
  const sessionUser = {
    id: 'user-1',
    roles: ['ADMIN'],
    permissions: [],
    clientIds: [],
  } as any;

  const existingSR = {
    id: 'sr-1',
    version: 7,
    status: 'IN_PROGRESS',
    clientId: 'client-1',
    requesterId: 'req-1',
    assigneeId: 'user-1',
    srNumber: 'SR-1',
    title: 'Original title',
    serviceCategoryId: 'cat-1',
    actualPriority: 'MEDIUM',
    intakeAt: new Date(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
    mockPrisma.sR.findUnique.mockResolvedValue(existingSR);
  });

  it('throws ConflictError when any field was concurrently changed (version guard matches 0 rows)', async () => {
    mockPrisma.sR.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      srService.updateSR('sr-1', { title: 'Updated title here' }, sessionUser)
    ).rejects.toBeInstanceOf(ConflictError);

    // Guard ran against the snapshot version, and the real write never happened.
    expect(mockPrisma.sR.updateMany).toHaveBeenCalledWith({
      where: { id: 'sr-1', version: 7 },
      data: { version: { increment: 1 } },
    });
    expect(mockPrisma.sR.update).not.toHaveBeenCalled();
  });

  it('proceeds with the update when the guard matches (count = 1)', async () => {
    mockPrisma.sR.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.sR.update.mockResolvedValue({ ...existingSR, title: 'Updated title here' });

    const result = await srService.updateSR('sr-1', { title: 'Updated title here' }, sessionUser);

    expect(mockPrisma.sR.updateMany).toHaveBeenCalledWith({
      where: { id: 'sr-1', version: 7 },
      data: { version: { increment: 1 } },
    });
    expect(mockPrisma.sR.update).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('Updated title here');
  });

  describe('폼을 연 시점의 버전(expectedVersion)', () => {
    it('그사이 SR 이 바뀌었으면 쓰기 전에 거절한다', async () => {
      await expect(
        srService.updateSR('sr-1', { title: 'Updated title here', expectedVersion: 6 }, sessionUser)
      ).rejects.toBeInstanceOf(ConflictError);

      expect(mockPrisma.sR.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.sR.update).not.toHaveBeenCalled();
    });

    it('권한이 없으면 버전이 달라도 충돌이 아니라 권한 오류를 받는다', async () => {
      vi.mocked(ensureCanUpdateSR).mockImplementationOnce(() => {
        throw new ForbiddenError('권한 없음');
      });

      await expect(
        srService.updateSR('sr-1', { title: 'Updated title here', expectedVersion: 6 }, sessionUser)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('같으면 저장하고, SR 의 값이나 내용 수정 판정에 섞지 않는다', async () => {
      mockPrisma.sR.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.sR.update.mockResolvedValue({ ...existingSR, title: 'Updated title here' });

      await srService.updateSR(
        'sr-1',
        { title: 'Updated title here', expectedVersion: 7 },
        sessionUser
      );

      expect(mockPrisma.sR.update.mock.calls[0]![0].data).not.toHaveProperty('expectedVersion');
      expect(vi.mocked(ensureCanEditSRContent).mock.calls[0]![2]).not.toHaveProperty(
        'expectedVersion'
      );
    });
  });
});
