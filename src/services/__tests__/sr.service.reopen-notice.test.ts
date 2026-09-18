import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SRService } from '@/services/sr.service';

/**
 * 재오픈 알림의 배선(2026-09-18 소유자 결정 D15).
 *
 * 재오픈되면 다시 일해야 하는 담당자에게 알린다 — 메일은 전이와 같은 트랜잭션에 적재하고, 받은 사람에게는
 * 상태 변경 메일을 한 통 더 보내지 않으며, 푸시용 이벤트에는 행위자·담당자·사유를 싣는다.
 * 수신자 규칙 자체(설정·행위자 제외·비활성 대체)는 sr-email-outbox.test.ts 가 고정한다.
 */

const mocks = vi.hoisted(() => ({
  enqueueSRReopenedEmails: vi.fn(),
  enqueueSRStatusChangedEmail: vi.fn().mockResolvedValue(0),
  emit: vi.fn(),
}));

vi.mock('@/services/sr-email-outbox', () => ({
  enqueueSRCreatedEmails: vi.fn().mockResolvedValue(0),
  enqueueSRStatusChangedEmail: mocks.enqueueSRStatusChangedEmail,
  enqueueSRAssignedEmail: vi.fn().mockResolvedValue(0),
  enqueueSRReopenedEmails: mocks.enqueueSRReopenedEmails,
}));

vi.mock('@/lib/domain-events', () => ({ domainEvents: { emit: mocks.emit } }));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    sR: { findUnique: vi.fn() },
    sRStatusHistory: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

vi.mock('@/lib/policies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/policies')>()),
  ensureCanUpdateSR: vi.fn(),
}));

const manager = {
  id: 'mgr-1',
  email: 'mgr@example.com',
  name: 'Manager',
  image: null,
  roles: ['MANAGER'],
  permissions: ['SR:UPDATE', 'SR:ASSIGN', 'SR:CONFIRM', 'SR:STATUS_CHANGE'],
  clientIds: [],
};

const completed = {
  id: 'sr-1',
  srNumber: 'SR-001',
  title: '제목',
  status: 'COMPLETED',
  clientId: 'c-1',
  requesterId: 'client-1',
  assigneeId: 'eng-1',
  completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  confirmedAt: null,
  version: 1,
};

const service = new SRService();

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.sR.findUnique.mockResolvedValue({ ...completed });
  mocks.enqueueSRReopenedEmails.mockResolvedValue({ enqueued: 1, notifiedUserIds: ['eng-1'] });
  const tx = {
    sR: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...completed, ...data })),
    },
    sRActivity: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
});

describe('재오픈 알림 배선', () => {
  it('재오픈하면 담당자 알림을 같은 트랜잭션에 적재하고, 받은 사람은 상태 변경 메일에서 뺀다', async () => {
    await service.updateSR(
      'sr-1',
      { status: 'IN_PROGRESS', changeReason: '여전히 오류가 납니다' },
      manager
    );

    expect(mocks.enqueueSRReopenedEmails).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        srId: 'sr-1',
        assigneeId: 'eng-1',
        actorId: 'mgr-1',
        reason: '여전히 오류가 납니다',
      })
    );
    expect(mocks.enqueueSRStatusChangedEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'mgr-1', excludeUserIds: ['eng-1'] })
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      'sr:status_changed',
      expect.objectContaining({
        previousStatus: 'COMPLETED',
        currentStatus: 'IN_PROGRESS',
        actorId: 'mgr-1',
        assigneeId: 'eng-1',
        reason: '여전히 오류가 납니다',
      })
    );
  });

  it('재오픈이 아닌 전이에서는 담당자 재오픈 알림을 적재하지 않는다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...completed, status: 'IN_PROGRESS' });

    await service.updateSR(
      'sr-1',
      { status: 'ON_HOLD', changeReason: '고객 응답 대기', expectedHoldReleaseDate: '2030-01-01' },
      manager
    );

    expect(mocks.enqueueSRReopenedEmails).not.toHaveBeenCalled();
    expect(mocks.enqueueSRStatusChangedEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ excludeUserIds: [] })
    );
  });
});
