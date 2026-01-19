import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors';
import { ensureCanCreateSR, ensureCanDeleteSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
    sR: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    sRActivity: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRComment: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRAttachment: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRStatusHistory: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    client: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    serviceCategory: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as any;
  return { mockPrisma: mock };
});

vi.mock('@/lib/policies', () => ({
  ensureCanUpdateSR: vi.fn(),
  ensureCanCreateSR: vi.fn(),
  ensureCanDeleteSR: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('@/services/push.service', () => ({
  pushService: {
    sendToUser: vi.fn().mockResolvedValue(undefined),
    sendToUsers: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/services/email.service', () => ({
  emailService: {
    sendSRStatusChanged: vi.fn().mockResolvedValue(true),
    sendSRAssigned: vi.fn().mockResolvedValue(true),
    sendSRCreated: vi.fn().mockResolvedValue(true),
  },
}));

describe('SRService Extended Branches', () => {
  let srService: SRService;

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();

    // Set default mock values for all tests
    vi.mocked(prisma.client.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Client 1',
      isActive: true,
    } as any);
    vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
      id: 'sc-1',
      categoryName: 'C1',
      slaHours: 24,
    } as any);
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);
    vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
    vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);
  });

  describe('updateSR Notifications', () => {
    it('skips emails if preferences are false', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue({
        id: 'sr-1',
        status: 'INTAKE',
        requesterId: 'req-1',
        assigneeId: null,
      } as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      const txMock = {
        sR: {
          update: vi.fn().mockResolvedValue({
            id: 'sr-1',
            srNumber: 'SR-1',
            title: 'T',
            requester: {
              email: 'req@test.com',
              notificationPreference: { emailSRStatusChanged: false },
            },
            assignee: {
              name: 'A',
              email: 'a@test.com',
              notificationPreference: { emailSRAssigned: false },
            },
          }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      await srService.updateSR('sr-1', { status: 'IN_PROGRESS', assigneeId: 'a1' }, {
        id: 'u1',
        roles: ['ADMIN'],
      } as any);

      const { emailService } = await import('@/services/email.service');
      expect(emailService.sendSRStatusChanged).not.toHaveBeenCalled();
      expect(emailService.sendSRAssigned).not.toHaveBeenCalled();
    });
  });

  describe('deleteSR', () => {
    it('throws NotFoundError if SR missing', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
      await expect(srService.deleteSR('none', {} as any)).rejects.toThrow(NotFoundError);
    });

    it('deletes SR and related data in transaction', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1' } as any);
      vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

      const txMock = {
        sR: { delete: vi.fn() },
        sRActivity: { deleteMany: vi.fn() },
        sRComment: { deleteMany: vi.fn() },
        sRAttachment: { deleteMany: vi.fn() },
        sRStatusHistory: { deleteMany: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      await srService.deleteSR('sr-1', { id: 'u1' } as any);

      expect(txMock.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
    });
  });

  describe('updateSR Date and Type Branches', () => {
    it('updates fields to non-null and null, handles assignedToId', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue({
        id: 'sr-1',
        status: 'IN_PROGRESS',
      } as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      const txMock = {
        sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      // Use assignedToId and number estimatedHours
      await srService.updateSR(
        'sr-1',
        {
          expectedCompletionDate: '2023-10-10',
          estimatedHours: 12.5,
          assignedToId: 'a2',
        },
        { id: 'u1' } as any
      );

      let updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
      expect(updateData.expectedCompletionDate).toBeInstanceOf(Date);
      expect(updateData.estimatedHours).toBe(12.5);
      expect(updateData.assigneeId).toBe('a2');

      // To null
      await srService.updateSR(
        'sr-1',
        {
          expectedCompletionDate: null,
          intakeNotes: '',
        },
        { id: 'u1' } as any
      );

      updateData = vi.mocked(txMock.sR.update).mock.calls[1][0].data;
      expect(updateData.expectedCompletionDate).toBeNull();
      expect(updateData.intakeNotes).toBeNull();
    });

    it('adjusts due date based on priority even if intakeAt is null', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue({
        id: 'sr-1',
        status: 'IN_PROGRESS',
        actualPriority: 'MEDIUM',
        serviceCategoryId: 'sc-1',
        intakeAt: null,
      } as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'sc-1',
        slaHours: 24,
      } as any);

      const txMock = {
        sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      await srService.updateSR('sr-1', { actualPriority: 'HIGH' }, { id: 'u1' } as any);
      const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
      expect(updateData.dueDate).toBeInstanceOf(Date);
    });
  });

  // Note: createSR branch tests are covered in sr.service.test.ts
  // The complex transaction mocking required makes them difficult to test here.

  // Note: updateSR client change branch tests are covered in sr.service.test.ts
  // (see updateSR edge cases tests at lines 599-621)

  describe('Direct Prisma Proxy Methods', () => {
    it('proxies correctly', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
      await srService.getAllSRs({ take: 1 });
      expect(prisma.sR.findMany).toHaveBeenCalled();

      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      await srService.countSRs();
      expect(prisma.sR.count).toHaveBeenCalled();

      vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: '1' } as any);
      await srService.getSRById('1');
      expect(prisma.sR.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });

      vi.mocked(prisma.sRStatusHistory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
      await srService.getStatusHistory('1');
      expect(prisma.sRStatusHistory.findMany).toHaveBeenCalled();
    });
  });
});
