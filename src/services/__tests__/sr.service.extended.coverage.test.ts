import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// ensure* 만 스텁으로 대체하고 isInternalUser 는 실제 구현을 사용한다.
// (전체 대체(wholesale mock)를 쓰면 서비스가 사용하는 isInternalUser 가 사라져
//  "No isInternalUser export is defined on the mock" 로 테스트가 죽는다.
//  또한 내부/외부 판정을 mock 으로 조작하면 필드 단위 인가 검증이 무력화된다.)
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanUpdateSR: vi.fn(),
    ensureCanCreateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
  };
});

// 담당자 배정 가능 여부 판정은 이 스위트의 검증 대상이 아니므로 목록만 스텁한다.
// (권한/역할 기준으로 누가 배정 가능한지에 대한 실제 검증은
//  user.service.coverage.test.ts 의 "SR 담당자 자격 매트릭스" 스위트가 담당한다.)
vi.mock('@/services/user.service', () => ({
  UserService: class {
    async getUsersWithSRHandlingPermission() {
      return [
        { id: 'a1', name: 'A1', email: 'a1@test.com' },
        { id: 'a2', name: 'A2', email: 'a2@test.com' },
      ];
    }
  },
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
    buildSRStatusChanged: vi.fn().mockResolvedValue(true),
    buildSRAssigned: vi.fn().mockResolvedValue(true),
    buildSRCreated: vi.fn().mockResolvedValue(true),
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
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

      // assertAssignable 의 후보 조회(존재/활성 확인)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'a1',
        name: 'A1',
        email: 'a1@test.com',
        isActive: true,
      } as any);

      await srService.updateSR('sr-1', { status: 'IN_PROGRESS', assigneeId: 'a1' }, {
        id: 'u1',
        roles: ['ADMIN'],
      } as any);

      const { emailService } = await import('@/services/email.service');
      expect(emailService.buildSRStatusChanged).not.toHaveBeenCalled();
      expect(emailService.buildSRAssigned).not.toHaveBeenCalled();
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
        sR: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ id: 'sr-1' }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      // assertAssignable 의 후보 조회(존재/활성 확인)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'a2',
        name: 'A2',
        email: 'a2@test.com',
        isActive: true,
      } as any);

      // Use assignedToId and number estimatedHours
      // estimatedHours/assignedToId 는 운영 소유 필드이므로 내부 사용자(MANAGER)로 호출한다.
      // (외부 사용자가 이 필드를 바꾸면 거부되는지는 sr.service.test.ts 의 필드 인가 스위트가 검증)
      await srService.updateSR(
        'sr-1',
        {
          expectedCompletionDate: '2023-10-10',
          estimatedHours: 12.5,
          assignedToId: 'a2',
        },
        { id: 'u1', roles: ['MANAGER'], permissions: [], clientIds: [] } as any
      );

      let updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
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

      updateData = vi.mocked(txMock.sR.update).mock.calls[1]![0].data;
      // (두 번째 호출은 운영 소유 필드를 바꾸지 않으므로 역할 제약과 무관하다)
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
        sR: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ id: 'sr-1' }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      // actualPriority 는 운영 소유 필드이므로 내부 사용자(MANAGER)로 호출한다.
      await srService.updateSR('sr-1', { actualPriority: 'HIGH' }, {
        id: 'u1',
        roles: ['MANAGER'],
        permissions: [],
        clientIds: [],
      } as any);
      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
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
    });
  });
});
