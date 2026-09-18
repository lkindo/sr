import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SRService } from '@/services/sr.service';

/**
 * 대리 등록 (소유자 결정 2026-09-18 D3).
 *
 * 확인완료(CONFIRMED)는 신청자 본인만 한다(헌법 §1.1). 운영자가 전화·메일로 받은 고객 요청을 자기 이름으로
 * 등록하면 그 SR 은 고객이 확인할 수 없고, 운영자도 확인할 수 없어(확인은 고객의 인수 행위) 완료 상태에
 * 영원히 머물렀다. 그래서 대리 등록 때는 **실제 고객을 신청자로** 지정한다.
 *  - 내부 사용자만 지정할 수 있다.
 *  - 대상은 그 고객사에 승인된 활성 고객 사용자여야 한다(policies.eligibleRequesterWhere).
 *  - 등록한 운영자는 활동·상태 이력의 행위자로 남는다.
 */

vi.mock('@/services/sr-email-outbox', () => ({
  enqueueSRCreatedEmails: vi.fn().mockResolvedValue(0),
  enqueueSRStatusChangedEmail: vi.fn().mockResolvedValue(0),
  enqueueSRAssignedEmail: vi.fn().mockResolvedValue(0),
}));

const { mockPrisma, srCreate } = vi.hoisted(() => {
  const create = vi.fn();
  return {
    srCreate: create,
    mockPrisma: {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ $queryRaw: vi.fn().mockResolvedValue([{ seq: 1 }]), sR: { create } })
      ),
      client: { findUnique: vi.fn() },
      serviceCategory: { findUnique: vi.fn() },
      user: { findFirst: vi.fn(), findMany: vi.fn() },
      sR: { findUnique: vi.fn() },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('@/lib/domain-events', () => ({ domainEvents: { emit: vi.fn() } }));
vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: vi.fn(),
  REALTIME_EVENTS: { SR_CREATED: 'sr:created' },
}));

const INPUT = {
  title: '대리 등록 요청입니다',
  description: '고객이 전화로 알려 준 장애 내용입니다.',
  clientId: 'client-1',
  serviceCategoryId: 'cat-1',
  requestedPriority: 'MEDIUM' as const,
};

const manager = {
  id: 'mgr-1',
  email: 'mgr@example.com',
  name: 'Manager',
  image: null,
  roles: ['MANAGER'],
  permissions: ['SR:CREATE', 'SR:READ'],
  clientIds: [],
};

const customerAdmin = {
  id: 'ca-1',
  email: 'ca@example.com',
  name: 'Client Admin',
  image: null,
  roles: ['CLIENT_ADMIN'],
  permissions: ['SR:CREATE', 'SR:READ'],
  clientIds: ['client-1'],
};

const srService = new SRService();
const createdData = () => srCreate.mock.calls[0]![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', name: '가나', isActive: true });
  mockPrisma.serviceCategory.findUnique.mockResolvedValue({ id: 'cat-1', clientId: 'client-1' });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'cust-1' });
  srCreate.mockImplementation(async ({ data }) => ({ id: 'sr-1', ...data }));
  mockPrisma.sR.findUnique.mockResolvedValue({ id: 'sr-1', srNumber: 'SR-1' });
});

describe('대리 등록', () => {
  it('운영자가 고객을 지정하면 그 고객이 신청자가 되고, 운영자는 행위자로 남는다', async () => {
    await srService.createSR({ ...INPUT, requesterId: 'cust-1' }, manager);

    expect(createdData().requesterId).toBe('cust-1');
    expect(createdData().activities.create).toMatchObject({
      userId: 'mgr-1',
      description: expect.stringContaining('대리 등록'),
    });
    expect(createdData().statusHistory.create.changedBy).toBe('mgr-1');
  });

  it('대상은 이 고객사에 승인된 활성 고객 사용자 조건으로 조회한다', async () => {
    await srService.createSR({ ...INPUT, requesterId: 'cust-1' }, manager);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'cust-1',
        isActive: true,
        clients: { some: { clientId: 'client-1', status: 'APPROVED' } },
        roles: { none: { role: { name: { in: ['ADMIN', 'MANAGER', 'ENGINEER'] } } } },
      },
      select: { id: true },
    });
  });

  it('조건에 맞지 않는 사용자(다른 고객사·미승인·비활성·내부 사용자)면 거부하고 만들지 않는다', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      srService.createSR({ ...INPUT, requesterId: 'someone-else' }, manager)
    ).rejects.toThrow('신청자로 지정할 수 없는 사용자입니다');
    expect(srCreate).not.toHaveBeenCalled();
  });

  it('외부 사용자는 다른 사람을 신청자로 지정할 수 없다', async () => {
    await expect(
      srService.createSR({ ...INPUT, requesterId: 'colleague-1' }, customerAdmin)
    ).rejects.toThrow('다른 사용자를 신청자로 지정해 SR을 등록할 수 없습니다.');
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(srCreate).not.toHaveBeenCalled();
  });

  it('지정하지 않거나 자기 자신을 지정하면 등록자 본인이 신청자다(대조군)', async () => {
    await srService.createSR(INPUT, customerAdmin);
    expect(createdData().requesterId).toBe('ca-1');
    expect(createdData().activities.create.description).toBe('SR이 생성되었습니다.');

    srCreate.mockClear();
    await srService.createSR({ ...INPUT, requesterId: 'ca-1' }, customerAdmin);
    expect(createdData().requesterId).toBe('ca-1');
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('대리 등록 후보', () => {
  it('서버 검증과 같은 조건으로 고객사의 후보를 이름순으로 돌려준다', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'cust-1', name: '김고객', email: 'k@x' }]);

    const candidates = await srService.getRequesterCandidates('client-1');

    expect(candidates).toEqual([{ id: 'cust-1', name: '김고객', email: 'k@x' }]);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        clients: { some: { clientId: 'client-1', status: 'APPROVED' } },
        roles: { none: { role: { name: { in: ['ADMIN', 'MANAGER', 'ENGINEER'] } } } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  });
});
