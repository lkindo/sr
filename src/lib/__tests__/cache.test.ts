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

const getUsersWithSRHandlingPermission = vi.hoisted(() => vi.fn());

vi.mock('@/services/user.service', () => ({
  UserService: class {
    getUsersWithSRHandlingPermission = getUsersWithSRHandlingPermission;
  },
}));

describe('Cache Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedAssignableUsers', () => {
    it('배정 검증과 같은 원천(getUsersWithSRHandlingPermission)을 쓴다', async () => {
      const { getCachedAssignableUsers } = await import('../cache');
      getUsersWithSRHandlingPermission.mockResolvedValue([
        { id: 'u1', name: 'Engineer', email: 'e@corp.com' },
      ]);

      const result = await getCachedAssignableUsers();

      expect(getUsersWithSRHandlingPermission).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('이메일을 클라이언트로 내보내지 않는다', async () => {
      const { getCachedAssignableUsers } = await import('../cache');
      getUsersWithSRHandlingPermission.mockResolvedValue([
        { id: 'u1', name: 'Engineer', email: 'e@corp.com' },
      ]);

      const result = await getCachedAssignableUsers();

      // 드롭다운은 id 와 name 만 렌더링한다. 예전에는 전 사용자의 이메일이
      // RSC 페이로드로 브라우저까지 갔다(감사 4.2).
      expect(result[0]).toEqual({ id: 'u1', name: 'Engineer' });
      expect(result[0]).not.toHaveProperty('email');
    });
  });

  describe('getCachedClients', () => {
    it('인자가 없으면 전체를 조회한다(내부 사용자)', async () => {
      const { getCachedClients } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: 'c1', name: 'Client' }] as never);

      const result = await getCachedClients();

      expect(result).toHaveLength(1);
      const where = vi.mocked(prisma.client.findMany).mock.calls[0]![0]!.where!;
      expect(where.id).toBeUndefined();
    });

    it('clientIds 가 주어지면 그 고객사로 제한한다', async () => {
      const { getCachedClients } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.client.findMany).mockResolvedValue([] as never);

      await getCachedClients(['client-A']);

      const where = vi.mocked(prisma.client.findMany).mock.calls[0]![0]!.where!;
      expect(where.id).toEqual({ in: ['client-A'] });
    });

    it('빈 배열은 전체가 아니라 빈 결과다', async () => {
      const { getCachedClients } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');

      const result = await getCachedClients([]);

      // 이 구분이 핵심이다. `[]` 를 falsy 로 취급해 필터를 빼면
      // 소속 없는 외부 사용자가 전 고객사 목록을 받는다.
      expect(result).toEqual([]);
      expect(prisma.client.findMany).not.toHaveBeenCalled();
    });
  });
});
