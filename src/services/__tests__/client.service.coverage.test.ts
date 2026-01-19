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
            srs: true,
          }),
        })
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
