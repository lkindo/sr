import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SRRepository } from '../sr.repository';
import prisma from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    sR: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('SRRepository', () => {
  let repository: SRRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new SRRepository();
  });

  describe('findDetailsById', () => {
    it('상세 정보를 포함하여 SR을 조회해야 함', async () => {
      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        client: { id: 'client1', name: 'Test Client' },
        requester: { id: 'user1', name: 'Test User', email: 'user@example.com' },
        assignee: null,
        serviceCategory: { id: 'cat1', categoryName: 'Test Category' },
        comments: [],
        activities: [],
        attachments: [],
        _count: { comments: 0, attachments: 0 },
      };

      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);

      const result = await repository.findDetailsById('sr1');

      expect(result).toEqual(mockSR);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith({
        where: { id: 'sr1' },
        include: expect.objectContaining({
          client: true,
          requester: expect.any(Object),
          assignee: expect.any(Object),
          serviceCategory: true,
        }),
      });
    });

    it('존재하지 않는 SR은 null을 반환해야 함', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      const result = await repository.findDetailsById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('기본 정보만 포함하여 SR을 조회해야 함', async () => {
      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
      };

      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);

      const result = await repository.findById('sr1');

      expect(result).toEqual(mockSR);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith({
        where: { id: 'sr1' },
      });
    });
  });
});

