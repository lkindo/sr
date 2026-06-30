import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: vi.fn(),
  REALTIME_EVENTS: { SR_UPDATED: 'sr:updated' },
}));

vi.mock('@/lib/domain-events', () => ({
  domainEvents: { emit: vi.fn() },
}));

vi.mock('@/lib/wait-until', () => ({ backgroundTask: vi.fn() }));

import { ConflictError } from '@/lib/errors';
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

  it('throws ConflictError when the row was concurrently changed (status guard matches 0 rows)', async () => {
    mockPrisma.sR.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      srService.updateSR('sr-1', { title: 'Updated title here' }, sessionUser)
    ).rejects.toBeInstanceOf(ConflictError);

    // Guard ran against the snapshot status, and the real write never happened.
    expect(mockPrisma.sR.updateMany).toHaveBeenCalledWith({
      where: { id: 'sr-1', status: 'IN_PROGRESS' },
      data: expect.objectContaining({ updatedAt: expect.any(Date) }),
    });
    expect(mockPrisma.sR.update).not.toHaveBeenCalled();
  });

  it('proceeds with the update when the guard matches (count = 1)', async () => {
    mockPrisma.sR.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.sR.update.mockResolvedValue({ ...existingSR, title: 'Updated title here' });

    const result = await srService.updateSR('sr-1', { title: 'Updated title here' }, sessionUser);

    expect(mockPrisma.sR.updateMany).toHaveBeenCalledWith({
      where: { id: 'sr-1', status: 'IN_PROGRESS' },
      data: expect.objectContaining({ updatedAt: expect.any(Date) }),
    });
    expect(mockPrisma.sR.update).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('Updated title here');
  });
});
