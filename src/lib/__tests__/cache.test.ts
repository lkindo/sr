import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Next.js cache
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
  },
}));

describe('Cache Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Next.js unstable_cache Wrappers', () => {
    it('getCachedUsers calls prisma', async () => {
      const { getCachedUsers } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', name: 'Test' }] as any);

      const result = await getCachedUsers();
      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('getCachedClients calls prisma', async () => {
      const { getCachedClients } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: 'c1', name: 'Client' }] as any);

      const result = await getCachedClients();
      expect(result).toHaveLength(1);
      expect(prisma.client.findMany).toHaveBeenCalled();
    });
  });
});
