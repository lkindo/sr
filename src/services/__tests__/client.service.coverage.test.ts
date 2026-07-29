import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { ClientService } from '@/services/client.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    serviceCategory: { findMany: vi.fn(), count: vi.fn() },
    userClient: { count: vi.fn() },
    sR: { count: vi.fn() },
    clientHandler: { count: vi.fn() },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('ClientService Coverage', () => {
  let clientService: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
  });

  describe('getClientByName', () => {
    it('finds client by name', async () => {
      vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: 'c1', name: 'Test' } as any);
      const result = await clientService.getClientByName('Test');
      expect(result).toEqual({ id: 'c1', name: 'Test' });
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { name: { contains: 'Test', mode: 'insensitive' } },
      });
    });
  });

  describe('getClientByCode', () => {
    it('finds client by code', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', code: 'C1' } as any);
      const result = await clientService.getClientByCode('C1');
      expect(result).toEqual({ id: 'c1', code: 'C1' });
    });
  });

  describe('getClientDetailsById', () => {
    it('fetches detailed client info', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');
      expect(prisma.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          include: expect.objectContaining({
            users: expect.anything(),
            // 감사 3.6: 전체 SR 본문 덤프(`srs: true`) 대신 제한된 요약만 조회한다.
            srs: {
              select: {
                id: true,
                srNumber: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          }),
        })
      );
    });

    // 회귀 방지: SR 목록이 다시 무제한/전체 컬럼 조회로 되돌아가지 못하도록 고정한다.
    it('SR 조회는 명시적 select + 정렬 + take 상한으로 제한된다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');

      const args = vi.mocked(prisma.client.findUnique).mock.calls[0][0] as any;
      const srs = args.include.srs;

      // `srs: true`(전체 행 덤프)가 아니라 옵션 객체여야 한다.
      expect(srs).not.toBe(true);
      expect(typeof srs).toBe('object');

      // 상한(take)이 반드시 존재하며 유한한 값이어야 한다.
      expect(srs.take).toBe(10);
      expect(srs.orderBy).toEqual({ createdAt: 'desc' });

      // 명시적 select 여야 하며, include 로 관계를 끌어오면 안 된다.
      expect(srs.select).toBeDefined();
      expect(srs.include).toBeUndefined();
    });

    it('SR select 에 설명/처리결과/반려사유 등 민감 자유서술 컬럼이 포함되지 않는다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c1', srs: [] } as any);
      await clientService.getClientDetailsById('c1');

      const args = vi.mocked(prisma.client.findUnique).mock.calls[0][0] as any;
      const selectedKeys = Object.keys(args.include.srs.select);

      const sensitiveKeys = [
        'description',
        'resolution',
        'resolutionNote',
        'rejectionReason',
        'rejectReason',
        'holdReason',
        'attachments',
        'comments',
        'activities',
        'statusHistory',
      ];
      for (const key of sensitiveKeys) {
        expect(selectedKeys).not.toContain(key);
      }

      // 안전한 요약 컬럼만 선택되었는지도 함께 확인한다(허용 목록 밖 컬럼 차단).
      expect(selectedKeys.sort()).toEqual(
        ['createdAt', 'id', 'priority', 'srNumber', 'status', 'title'].sort()
      );
    });
  });

  describe('activateClient', () => {
    it('activates client', async () => {
      await clientService.activateClient('c1');
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { isActive: true },
      });
    });
  });

  describe('deactivateClient', () => {
    it('deactivates client', async () => {
      await clientService.deactivateClient('c1');
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { isActive: false },
      });
    });
  });

  describe('getClientsByUserId', () => {
    it('finds clients for user', async () => {
      vi.mocked(prisma.client.findMany).mockResolvedValue([]);
      await clientService.getClientsByUserId('u1');
      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: { users: { some: { userId: 'u1' } } },
      });
    });
  });

  describe('getClientWithDetailsAndCategories', () => {
    it('returns null if client not found', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
      const result = await clientService.getClientWithDetailsAndCategories('c1');
      expect(result).toBeNull();
    });

    it('filters out ADMIN users from result', async () => {
      const mockClient = {
        id: 'c1',
        users: [
          { user: { id: 'admin', roles: [{ role: { name: 'ADMIN' } }] } },
          { user: { id: 'user', roles: [{ role: { name: 'CLIENT_USER' } }] } },
        ],
      };
      vi.mocked(prisma.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([]);

      const result = await clientService.getClientWithDetailsAndCategories('c1');

      expect(result).not.toBeNull();
      expect(result?.users).toHaveLength(1);
      expect(result?.users[0].user.id).toBe('user');
    });
  });
});
