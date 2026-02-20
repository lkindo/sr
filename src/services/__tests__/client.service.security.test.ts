import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { ClientService } from '@/services/client.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      findUnique: vi.fn(),
    },
    serviceCategory: { findMany: vi.fn() },
  },
}));

describe('ClientService Security', () => {
  let clientService: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
  });

  describe('getClientWithDetailsAndCategories', () => {
    it('should request SAFE user fields and EXCLUDE password', async () => {
      const mockClient = {
        id: 'c1',
        users: [],
        clientHandlers: [],
      };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([]);

      await clientService.getClientWithDetailsAndCategories('c1');

      // Check that findUnique was called with correct select/include arguments
      const findUniqueCalls = vi.mocked(prisma.client.findUnique).mock.calls;
      expect(findUniqueCalls.length).toBeGreaterThan(0);

      const args = findUniqueCalls[0][0];
      expect(args).toBeDefined();

      // Verify users relation selection
      const usersInclude = args?.include?.users;
      expect(usersInclude).toBeDefined();

      const userSelect = (usersInclude as any)?.include?.user?.select;
      expect(userSelect).toBeDefined();
      expect(userSelect).toHaveProperty('id', true);
      expect(userSelect).toHaveProperty('email', true);
      expect(userSelect).not.toHaveProperty('password'); // CRITICAL: password must NOT be selected

      // Verify clientHandlers relation selection
      const handlersInclude = args?.include?.clientHandlers;
      expect(handlersInclude).toBeDefined();

      const handlerUserSelect = (handlersInclude as any)?.include?.user?.select;
      expect(handlerUserSelect).toBeDefined();
      expect(handlerUserSelect).toHaveProperty('id', true);
      expect(handlerUserSelect).not.toHaveProperty('password');

      const backupHandlerSelect = (handlersInclude as any)?.include?.backupHandler?.select;
      expect(backupHandlerSelect).toBeDefined();
      expect(backupHandlerSelect).toHaveProperty('id', true);
      expect(backupHandlerSelect).not.toHaveProperty('password');
    });
  });
});
