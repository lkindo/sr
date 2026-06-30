import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DuplicateError, NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { ServiceCategoryService } from '@/services/service-category.service';

vi.mock('@/lib/prisma', () => ({
  default: {
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
  },
}));

describe('ServiceCategoryService', () => {
  let service: ServiceCategoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceCategoryService();
  });

  // ==========================================================================
  // 조회 메서드
  // ==========================================================================

  describe('getAll', () => {
    it('returns categories ordered by categoryName', async () => {
      const rows = [{ id: '1' }];
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue(rows as never);

      const result = await service.getAll();

      expect(result).toBe(rows);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { categoryName: 'asc' } })
      );
    });
  });

  describe('getById', () => {
    it('returns category when found', async () => {
      const row = { id: 'abc', categoryName: 'X' };
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(row as never);

      const result = await service.getById('abc');

      expect(result).toBe(row);
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'abc' } })
      );
    });

    it('throws NotFoundError when not found', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);

      await expect(service.getById('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getByClientId', () => {
    it('queries with provided clientId', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getByClientId('client-1');

      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: 'client-1', isActive: true } })
      );
    });

    it('queries with null clientId', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getByClientId(null);

      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: null, isActive: true } })
      );
    });
  });

  describe('getActiveCategories', () => {
    it('queries only active categories', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getActiveCategories();

      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });
  });

  describe('getForSelection', () => {
    it('omits clientId filter when not provided', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getForSelection();

      const call = vi.mocked(prisma.serviceCategory.findMany).mock.calls[0][0];
      expect(call?.where).toEqual({ isActive: true });
    });

    it('includes clientId filter when provided', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getForSelection('client-9');

      const call = vi.mocked(prisma.serviceCategory.findMany).mock.calls[0][0];
      expect(call?.where).toEqual({ isActive: true, clientId: 'client-9' });
    });
  });

  describe('getAllWithStats', () => {
    it('includes _count of srs', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([] as never);

      await service.getAllWithStats();

      const call = vi.mocked(prisma.serviceCategory.findMany).mock.calls[0][0];
      expect(call?.include).toHaveProperty('_count');
    });
  });

  // ==========================================================================
  // CRUD
  // ==========================================================================

  describe('create', () => {
    const validData = {
      categoryName: 'New Category',
      slaHours: 8,
      priority: 'HIGH' as const,
      clientId: 'client-1',
    };

    it('creates a category when no duplicate exists', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null as never);
      const created = { id: 'new', categoryName: 'New Category' };
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue(created as never);

      const result = await service.create(validData);

      expect(result).toBe(created);
      expect(prisma.serviceCategory.findFirst).toHaveBeenCalledWith({
        where: { categoryName: 'New Category', clientId: 'client-1' },
      });
      expect(prisma.serviceCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryName: 'New Category', isActive: true }),
        })
      );
    });

    it('uses null clientId in duplicate check when clientId omitted', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue({ id: 'x' } as never);

      await service.create({ categoryName: 'NoClient', slaHours: 4, priority: 'MEDIUM' });

      expect(prisma.serviceCategory.findFirst).toHaveBeenCalledWith({
        where: { categoryName: 'NoClient', clientId: null },
      });
    });

    it('throws DuplicateError when a duplicate exists', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue({ id: 'dup' } as never);

      await expect(service.create(validData)).rejects.toThrow(DuplicateError);
      expect(prisma.serviceCategory.create).not.toHaveBeenCalled();
    });

    it('throws on invalid data (zod validation)', async () => {
      await expect(service.create({ categoryName: '', slaHours: -1 } as never)).rejects.toThrow();
      expect(prisma.serviceCategory.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundError when category does not exist', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);

      await expect(service.update('id1', { categoryName: 'A' })).rejects.toThrow(NotFoundError);
    });

    it('updates without duplicate check when categoryName unchanged', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        categoryName: 'Same',
        clientId: 'c1',
      } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.update('id1', { categoryName: 'Same' });

      expect(prisma.serviceCategory.findFirst).not.toHaveBeenCalled();
      expect(prisma.serviceCategory.update).toHaveBeenCalled();
    });

    it('updates without duplicate check when categoryName not provided', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        categoryName: 'Existing',
        clientId: 'c1',
      } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.update('id1', { slaHours: 12 });

      expect(prisma.serviceCategory.findFirst).not.toHaveBeenCalled();
      expect(prisma.serviceCategory.update).toHaveBeenCalled();
    });

    it('performs duplicate check when categoryName changes and finds no duplicate', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        categoryName: 'Old',
        clientId: 'c1',
      } as never);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.update('id1', { categoryName: 'New' });

      expect(prisma.serviceCategory.findFirst).toHaveBeenCalledWith({
        where: { categoryName: 'New', clientId: 'c1', id: { not: 'id1' } },
      });
      expect(prisma.serviceCategory.update).toHaveBeenCalled();
    });

    it('uses provided clientId in duplicate check', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        categoryName: 'Old',
        clientId: 'c1',
      } as never);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.update('id1', { categoryName: 'New', clientId: 'c2' });

      expect(prisma.serviceCategory.findFirst).toHaveBeenCalledWith({
        where: { categoryName: 'New', clientId: 'c2', id: { not: 'id1' } },
      });
    });

    it('throws DuplicateError when changed categoryName collides', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        categoryName: 'Old',
        clientId: 'c1',
      } as never);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue({ id: 'other' } as never);

      await expect(service.update('id1', { categoryName: 'New' })).rejects.toThrow(DuplicateError);
      expect(prisma.serviceCategory.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws NotFoundError when category does not exist', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);

      await expect(service.delete('id1')).rejects.toThrow(NotFoundError);
    });

    it('throws ReferentialIntegrityError when SRs are linked', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        _count: { srs: 3 },
      } as never);

      await expect(service.delete('id1')).rejects.toThrow(ReferentialIntegrityError);
      expect(prisma.serviceCategory.delete).not.toHaveBeenCalled();
    });

    it('deletes when no SRs are linked', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        id: 'id1',
        _count: { srs: 0 },
      } as never);
      vi.mocked(prisma.serviceCategory.delete).mockResolvedValue({ id: 'id1' } as never);

      const result = await service.delete('id1');

      expect(result).toEqual({ id: 'id1' });
      expect(prisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
    });
  });

  // ==========================================================================
  // 상태 관리
  // ==========================================================================

  describe('activate / deactivate', () => {
    it('activate throws NotFoundError when missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.activate('id1')).rejects.toThrow(NotFoundError);
    });

    it('activate updates isActive to true', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.activate('id1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
        where: { id: 'id1' },
        data: { isActive: true },
      });
    });

    it('deactivate throws NotFoundError when missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.deactivate('id1')).rejects.toThrow(NotFoundError);
    });

    it('deactivate updates isActive to false', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.deactivate('id1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
        where: { id: 'id1' },
        data: { isActive: false },
      });
    });
  });

  // ==========================================================================
  // 담당자 관리
  // ==========================================================================

  describe('assignHandler', () => {
    it('throws NotFoundError when category missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.assignHandler('id1', 'h1')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when handler missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      await expect(service.assignHandler('id1', 'h1')).rejects.toThrow(NotFoundError);
      expect(prisma.serviceCategory.update).not.toHaveBeenCalled();
    });

    it('assigns handler when both exist', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'h1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.assignHandler('id1', 'h1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'id1' }, data: { handlerId: 'h1' } })
      );
    });
  });

  describe('assignBackupHandler', () => {
    it('throws NotFoundError when category missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.assignBackupHandler('id1', 'b1')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when backup handler missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      await expect(service.assignBackupHandler('id1', 'b1')).rejects.toThrow(NotFoundError);
    });

    it('assigns backup handler when both exist', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'b1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.assignBackupHandler('id1', 'b1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'id1' }, data: { backupHandlerId: 'b1' } })
      );
    });
  });

  describe('unassignHandler', () => {
    it('throws NotFoundError when missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.unassignHandler('id1')).rejects.toThrow(NotFoundError);
    });

    it('sets handlerId to null', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.unassignHandler('id1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
        where: { id: 'id1' },
        data: { handlerId: null },
      });
    });
  });

  describe('unassignBackupHandler', () => {
    it('throws NotFoundError when missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);
      await expect(service.unassignBackupHandler('id1')).rejects.toThrow(NotFoundError);
    });

    it('sets backupHandlerId to null', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'id1' } as never);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({ id: 'id1' } as never);

      await service.unassignBackupHandler('id1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith({
        where: { id: 'id1' },
        data: { backupHandlerId: null },
      });
    });
  });

  // ==========================================================================
  // SLA 계산
  // ==========================================================================

  describe('getSLAMultiplier', () => {
    it('returns 0.5 for CRITICAL', () => {
      expect(service.getSLAMultiplier('CRITICAL')).toBe(0.5);
    });
    it('returns 0.75 for HIGH', () => {
      expect(service.getSLAMultiplier('HIGH')).toBe(0.75);
    });
    it('returns 1.0 for MEDIUM', () => {
      expect(service.getSLAMultiplier('MEDIUM')).toBe(1.0);
    });
    it('returns 1.5 for LOW', () => {
      expect(service.getSLAMultiplier('LOW')).toBe(1.5);
    });
    it('falls back to 1.0 for unknown priority', () => {
      expect(service.getSLAMultiplier('UNKNOWN' as never)).toBe(1.0);
    });
  });

  describe('calculateDueDate', () => {
    it('throws NotFoundError when category missing', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as never);

      await expect(service.calculateDueDate('cat1', 'MEDIUM')).rejects.toThrow(NotFoundError);
    });

    it('computes due date applying CRITICAL multiplier (0.5)', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ slaHours: 10 } as never);
      const start = new Date('2026-01-01T00:00:00.000Z');

      const due = await service.calculateDueDate('cat1', 'CRITICAL', start);

      // 10 * 0.5 = 5 hours
      expect(due.getTime() - start.getTime()).toBe(5 * 60 * 60 * 1000);
      // does not mutate the input
      expect(start.getTime()).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
    });

    it('computes due date applying LOW multiplier (1.5)', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ slaHours: 8 } as never);
      const start = new Date('2026-01-01T00:00:00.000Z');

      const due = await service.calculateDueDate('cat1', 'LOW', start);

      // 8 * 1.5 = 12 hours
      expect(due.getTime() - start.getTime()).toBe(12 * 60 * 60 * 1000);
    });

    it('uses current time as default start date', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ slaHours: 4 } as never);
      const before = Date.now();

      const due = await service.calculateDueDate('cat1', 'MEDIUM');

      const after = Date.now();
      // 4 hours from "now"
      expect(due.getTime()).toBeGreaterThanOrEqual(before + 4 * 60 * 60 * 1000 - 5);
      expect(due.getTime()).toBeLessThanOrEqual(after + 4 * 60 * 60 * 1000 + 5);
    });
  });

  describe('calculateDueDateFromHours', () => {
    it('applies HIGH multiplier (0.75)', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const due = service.calculateDueDateFromHours(8, 'HIGH', start);
      // 8 * 0.75 = 6 hours
      expect(due.getTime() - start.getTime()).toBe(6 * 60 * 60 * 1000);
    });

    it('applies MEDIUM multiplier (1.0)', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const due = service.calculateDueDateFromHours(5, 'MEDIUM', start);
      expect(due.getTime() - start.getTime()).toBe(5 * 60 * 60 * 1000);
    });

    it('uses current time as default start date', () => {
      const before = Date.now();
      const due = service.calculateDueDateFromHours(2, 'MEDIUM');
      const after = Date.now();
      expect(due.getTime()).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000 - 5);
      expect(due.getTime()).toBeLessThanOrEqual(after + 2 * 60 * 60 * 1000 + 5);
    });
  });
});
