import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientService } from '../client.service';
import prisma from '@/lib/prisma';

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
    serviceCategory: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userClient: {
      count: vi.fn(),
    },
    sR: {
      count: vi.fn(),
    },
    clientHandler: {
      count: vi.fn(),
    },
  },
}));

describe('ClientService', () => {
  let clientService: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
  });

  describe('getClientById', () => {
    it('고객사를 조회해야 함', async () => {
      const mockClient = {
        id: 'client1',
        code: 'CLI001',
        name: 'Test Client',
      };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(mockClient as any);

      const result = await clientService.getClientById('client1');

      expect(result).toEqual(mockClient);
      expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'client1' } });
    });
  });

  describe('getAllClients', () => {
    it('모든 고객사 목록을 반환해야 함', async () => {
      const mockClients = [
        { id: 'client1', code: 'CLI001', name: 'Client 1' },
        { id: 'client2', code: 'CLI002', name: 'Client 2' },
      ];

      vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as any);

      const result = await clientService.getAllClients();

      expect(result).toEqual(mockClients);
      expect(prisma.client.findMany).toHaveBeenCalled();
    });
  });

  describe('createClient', () => {
    it('성공적으로 고객사를 생성해야 함', async () => {
      const clientData = {
        code: 'CLI001',
        name: 'Test Client',
        industry: 'IT',
      };

      const mockCreatedClient = {
        id: 'client1',
        ...clientData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.client.create).mockResolvedValue(mockCreatedClient as any);

      const result = await clientService.createClient(clientData);

      expect(result).toEqual(mockCreatedClient);
      expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { code: 'CLI001' } });
      expect(prisma.client.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'CLI001',
          name: 'Test Client',
          industry: 'IT',
          isActive: true,
        }),
      });
    });
  });

  describe('updateClient', () => {
    it('성공적으로 고객사를 수정해야 함', async () => {
      const updateData = {
        name: 'Updated Client',
        industry: 'Finance',
      };

      const mockUpdatedClient = {
        id: 'client1',
        code: 'CLI001',
        ...updateData,
        updatedAt: new Date(),
      };

      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'client1' } as any);
      vi.mocked(prisma.client.update).mockResolvedValue(mockUpdatedClient as any);

      const result = await clientService.updateClient('client1', updateData);

      expect(result).toEqual(mockUpdatedClient);
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client1' },
        data: expect.objectContaining(updateData),
      });
    });
  });

  describe('deleteClient', () => {
    it('성공적으로 고객사를 삭제해야 함', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'client1' } as any);
      vi.mocked(prisma.userClient.count).mockResolvedValue(0);
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.serviceCategory.count).mockResolvedValue(0);
      vi.mocked(prisma.clientHandler.count).mockResolvedValue(0);
      vi.mocked(prisma.client.delete).mockResolvedValue({} as any);

      await clientService.deleteClient('client1');

      expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'client1' } });
    });

    it('관련 데이터가 있으면 에러를 던져야 함', async () => {
      vi.mocked(prisma.userClient.count).mockResolvedValue(5);

      await expect(clientService.deleteClient('client1')).rejects.toThrow();
      expect(prisma.client.delete).not.toHaveBeenCalled();
    });
  });
});
