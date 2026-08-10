/* eslint-disable @typescript-eslint/no-explicit-any */
import { SRPriority } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { ServiceCategoryService } from '../service-category.service';

// 변이 메서드 3개는 감사 로그와 함께 `$transaction` 안에서 돈다(감사 로그 실패가
// 본 작업을 롤백시켜야 하므로). 모의 트랜잭션은 콜백에 같은 mockPrisma 를 넘겨
// `tx.serviceCategory.*` 가 곧 `prisma.serviceCategory.*` 가 되게 한다.
vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    serviceCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(mockPrisma)),
  };
  return { default: mockPrisma };
});

describe('ServiceCategoryService', () => {
  let service: ServiceCategoryService;

  const mockCategory = {
    id: 'cat-1',
    categoryName: 'Network Support',
    description: '네트워크 지원',
    slaHours: 24,
    priority: 'MEDIUM' as SRPriority,
    clientId: 'client-1',
    handlerId: 'user-1',
    backupHandlerId: 'user-2',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /** create/update 가 `include` 로 붙여 반환하는 관계까지 포함한 모양. */
  const mockCategoryWithRelations = {
    ...mockCategory,
    client: { id: 'client-1', name: '고객사' },
    handler: { id: 'user-1', name: '담당자', email: 'handler@example.com' },
    backupHandler: { id: 'user-2', name: '백업', email: 'backup@example.com' },
  };

  const duplicateKeyError = () =>
    new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceCategoryService();
    // clearAllMocks 가 팩토리에서 준 구현까지 지운다 — 매번 다시 심어야
    // $transaction 이 undefined 를 반환하지 않는다.
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));
  });

  describe('getAll', () => {
    it('모든 서비스 카테고리를 반환해야 함', async () => {
      const mockCategories = [mockCategory];
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue(mockCategories as any);

      const result = await service.getAll();

      expect(result).toEqual(mockCategories);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
    });

    it('빈 배열을 반환할 수 있어야 함', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
    });
  });

  describe('getByClientId', () => {
    it('고객사 ID로 카테고리 목록을 조회해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([mockCategory] as any);

      const result = await service.getByClientId('client-1');

      expect(result).toHaveLength(1);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'client-1', isActive: true },
        })
      );
    });
  });

  describe('create', () => {
    it('새 서비스 카테고리를 생성해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue(mockCategory as any);

      const result = await service.create({
        categoryName: 'Network Support',
        slaHours: 24,
        priority: 'MEDIUM',
      });

      expect(result.categoryName).toBe('Network Support');
      expect(prisma.serviceCategory.create).toHaveBeenCalled();
    });

    it('중복된 카테고리명은 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(mockCategory as any);

      await expect(
        service.create({
          categoryName: 'Network Support',
          slaHours: 24,
          priority: 'MEDIUM',
        })
      ).rejects.toThrow('이미 존재하는');
    });

    it('생성과 감사 로그가 같은 트랜잭션 안에서 일어나야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue(mockCategoryWithRelations as any);

      await service.create(
        { categoryName: 'Network Support', slaHours: 24, priority: 'MEDIUM' },
        'actor-1'
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'actor-1',
          actionType: 'SERVICE_CATEGORY_CREATE',
          targetEntity: 'ServiceCategory',
          targetId: 'cat-1',
          ipAddress: null,
        }),
      });
    });

    // 관계를 그대로 실으면 담당자 이메일이 감사 로그에 적재된다.
    it('감사 로그의 after 는 스칼라만 담아야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue(mockCategoryWithRelations as any);

      await service.create(
        { categoryName: 'Network Support', slaHours: 24, priority: 'MEDIUM' },
        'actor-1'
      );

      const { changes } = vi.mocked(prisma.auditLog.create).mock.calls[0]![0].data as any;
      expect(changes.after).toEqual({
        id: 'cat-1',
        categoryName: 'Network Support',
        description: '네트워크 지원',
        slaHours: 24,
        priority: 'MEDIUM',
        clientId: 'client-1',
        handlerId: 'user-1',
        backupHandlerId: 'user-2',
        isActive: true,
      });
      expect(JSON.stringify(changes)).not.toContain('handler@example.com');
    });

    // catch 가 $transaction 콜백 안에 있으면 롤백된 트랜잭션 위에서 진행하다
    // `Transaction already closed` 로 에러 형태가 바뀐다.
    it('경쟁에서 진 P2002 는 DuplicateError 로 표면화되어야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.create).mockRejectedValue(duplicateKeyError());

      await expect(
        service.create({ categoryName: 'Network Support', slaHours: 24, priority: 'MEDIUM' })
      ).rejects.toThrow('이미 존재하는');
    });
  });

  describe('update', () => {
    it('서비스 카테고리를 수정해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({
        ...mockCategory,
        slaHours: 48,
      } as any);

      const result = await service.update('cat-1', { slaHours: 48 });

      expect(result.slaHours).toBe(48);
      expect(prisma.serviceCategory.update).toHaveBeenCalled();
    });

    it('before/after 를 담은 감사 로그를 트랜잭션 안에서 남겨야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({
        ...mockCategoryWithRelations,
        slaHours: 48,
      } as any);

      await service.update('cat-1', { slaHours: 48 }, 'actor-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const { data } = vi.mocked(prisma.auditLog.create).mock.calls[0]![0] as any;
      expect(data).toMatchObject({
        userId: 'actor-1',
        actionType: 'SERVICE_CATEGORY_UPDATE',
        targetEntity: 'ServiceCategory',
        targetId: 'cat-1',
        ipAddress: null,
      });
      expect(data.changes.before.slaHours).toBe(24);
      expect(data.changes.after.slaHours).toBe(48);
      // 관계는 스냅샷에서 제외된다.
      expect(data.changes.after.handler).toBeUndefined();
      expect(JSON.stringify(data.changes)).not.toContain('handler@example.com');
    });

    it('경쟁에서 진 P2002 는 DuplicateError 로 표면화되어야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.update).mockRejectedValue(duplicateKeyError());

      await expect(service.update('cat-1', { categoryName: '새 이름' })).rejects.toThrow(
        '이미 존재하는'
      );
    });
  });

  describe('delete', () => {
    it('연결된 SR이 없으면 카테고리를 삭제해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 0 },
      } as any);
      vi.mocked(prisma.serviceCategory.delete).mockResolvedValue(mockCategory as any);

      await service.delete('cat-1');

      expect(prisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('연결된 SR이 있으면 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 5 },
      } as any);

      await expect(service.delete('cat-1')).rejects.toThrow('SR이 연결');
    });

    it('삭제와 감사 로그가 같은 트랜잭션 안에서 일어나야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 0 },
      } as any);
      vi.mocked(prisma.serviceCategory.delete).mockResolvedValue(mockCategory as any);

      await service.delete('cat-1', 'actor-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const { data } = vi.mocked(prisma.auditLog.create).mock.calls[0]![0] as any;
      expect(data).toMatchObject({
        userId: 'actor-1',
        actionType: 'SERVICE_CATEGORY_DELETE',
        targetEntity: 'ServiceCategory',
        targetId: 'cat-1',
        ipAddress: null,
      });
      // `_count` 는 사전 조회의 산물이지 카테고리의 상태가 아니다.
      expect(data.changes.before._count).toBeUndefined();
      expect(data.changes.before.categoryName).toBe('Network Support');
    });

    it('SR 이 연결돼 있으면 감사 로그도 남기지 않아야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 5 },
      } as any);

      await expect(service.delete('cat-1', 'actor-1')).rejects.toThrow('SR이 연결');

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('SLA 계산', () => {
    it('우선순위별 배율을 반환해야 함', () => {
      expect(service.getSLAMultiplier('CRITICAL')).toBe(0.5);
      expect(service.getSLAMultiplier('HIGH')).toBe(0.75);
      expect(service.getSLAMultiplier('MEDIUM')).toBe(1.0);
      expect(service.getSLAMultiplier('LOW')).toBe(1.5);
    });

    it('기한을 올바르게 계산해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        slaHours: 24,
      } as any);

      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = await service.calculateDueDate('cat-1', 'MEDIUM', startDate);

      // MEDIUM = 1.0 배율, 24시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('CRITICAL 우선순위는 50% 시간으로 계산해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        slaHours: 24,
      } as any);

      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = await service.calculateDueDate('cat-1', 'CRITICAL', startDate);

      // CRITICAL = 0.5 배율, 12시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(12 * 60 * 60 * 1000);
    });

    it('calculateDueDateFromHours는 DB 조회 없이 계산해야 함', () => {
      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = service.calculateDueDateFromHours(24, 'LOW', startDate);

      // LOW = 1.5 배율, 36시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(36 * 60 * 60 * 1000);
    });
  });
});
