import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientService } from '../client.service';
import { NotFoundError, DuplicateError, ReferentialIntegrityError } from '@/lib/errors';
import { Client } from '@prisma/client';

// Mock modules - factory 함수 내부에서 mock 생성
vi.mock('@/repositories/client.repository', () => {
  const mockFindByCode = vi.fn();
  const mockFindById = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockFindAll = vi.fn();
  const mockGetRelatedDataCounts = vi.fn();

  class MockClientRepository {
    findByCode = mockFindByCode;
    findById = mockFindById;
    create = mockCreate;
    update = mockUpdate;
    delete = mockDelete;
    findAll = mockFindAll;
    getRelatedDataCounts = mockGetRelatedDataCounts;
  }

  return {
    ClientRepository: MockClientRepository,
    __mockFns: {
      mockFindByCode,
      mockFindById,
      mockCreate,
      mockUpdate,
      mockDelete,
      mockFindAll,
      mockGetRelatedDataCounts,
    },
  };
});

vi.mock('@/repositories/user.repository', () => ({
  UserRepository: class MockUserRepository {},
}));

vi.mock('@/services/user.service', () => ({
  UserService: class MockUserService {},
}));

describe('ClientService', () => {
  let clientService: ClientService;
  let mockClientRepo: any;

  beforeEach(() => {
    // Mock 함수들 리셋
    vi.clearAllMocks();

    clientService = new ClientService();
    // ClientService의 private repository에 접근
    mockClientRepo = (clientService as any).clientRepository;
  });

  describe('createClient', () => {
    const validClientData = {
      code: 'TEST001',
      name: 'Test Client',
      industry: 'IT',
      contactPerson: 'John Doe',
      contactEmail: 'test@example.com',
      contactPhone: '010-1234-5678',
      address: 'Seoul, Korea',
      contractStartDate: '2024-01-01',
      contractEndDate: '2025-12-31',
    };

    it('성공적으로 고객사를 생성해야 함', async () => {
      const expectedClient: Client = {
        id: '1',
        code: validClientData.code,
        name: validClientData.name,
        industry: validClientData.industry,
        contactPerson: validClientData.contactPerson,
        contactEmail: validClientData.contactEmail,
        contactPhone: validClientData.contactPhone,
        address: validClientData.address,
        contractStartDate: new Date(validClientData.contractStartDate),
        contractEndDate: new Date(validClientData.contractEndDate),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findByCode.mockResolvedValue(null);
      mockClientRepo.create.mockResolvedValue(expectedClient);

      const result = await clientService.createClient(validClientData);

      expect(result).toEqual(expectedClient);
      expect(mockClientRepo.findByCode).toHaveBeenCalledWith('TEST001');
      expect(mockClientRepo.create).toHaveBeenCalled();
    });

    it('중복된 코드가 있으면 DuplicateError를 던져야 함', async () => {
      const existingClient: Client = {
        id: '1',
        code: validClientData.code,
        name: 'Existing Client',
        industry: 'IT',
        contactPerson: 'Jane Doe',
        contactEmail: 'existing@example.com',
        contactPhone: '010-9999-8888',
        address: 'Busan',
        contractStartDate: null,
        contractEndDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findByCode.mockResolvedValue(existingClient);

      await expect(clientService.createClient(validClientData))
        .rejects
        .toThrow(DuplicateError);

      expect(mockClientRepo.findByCode).toHaveBeenCalledWith('TEST001');
      expect(mockClientRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateClient', () => {
    const updateData = {
      name: 'Updated Client',
      industry: 'Finance',
      contactPerson: 'Jane Smith',
      contactEmail: 'updated@example.com',
      contactPhone: '010-5555-6666',
      address: 'Incheon',
      contractStartDate: '2024-02-01',
      contractEndDate: '2026-01-31',
    };

    it('성공적으로 고객사를 수정해야 함', async () => {
      const existingClient: Client = {
        id: '1',
        code: 'TEST001',
        name: 'Test Client',
        industry: 'IT',
        contactPerson: 'John Doe',
        contactEmail: 'test@example.com',
        contactPhone: '010-1234-5678',
        address: 'Seoul',
        contractStartDate: new Date('2024-01-01'),
        contractEndDate: new Date('2025-12-31'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedClient: Client = {
        ...existingClient,
        name: updateData.name,
        industry: updateData.industry,
        contactPerson: updateData.contactPerson,
        contactEmail: updateData.contactEmail,
        contactPhone: updateData.contactPhone,
        address: updateData.address,
        contractStartDate: new Date(updateData.contractStartDate),
        contractEndDate: new Date(updateData.contractEndDate),
      };

      mockClientRepo.findById.mockResolvedValue(existingClient);
      mockClientRepo.update.mockResolvedValue(updatedClient);

      const result = await clientService.updateClient('1', updateData);

      expect(result).toEqual(updatedClient);
      expect(mockClientRepo.findById).toHaveBeenCalledWith('1');
      expect(mockClientRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
        name: updateData.name,
        industry: updateData.industry,
      }));
    });

    it('존재하지 않는 고객사를 수정하려하면 NotFoundError를 던져야 함', async () => {
      mockClientRepo.findById.mockResolvedValue(null);

      await expect(clientService.updateClient('999', updateData))
        .rejects
        .toThrow(NotFoundError);

      expect(mockClientRepo.findById).toHaveBeenCalledWith('999');
      expect(mockClientRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteClient', () => {
    it('관련 데이터가 없으면 성공적으로 삭제해야 함', async () => {
      const client: Client = {
        id: '1',
        code: 'TEST001',
        name: 'Test Client',
        industry: 'IT',
        contactPerson: 'John Doe',
        contactEmail: 'test@example.com',
        contactPhone: null,
        address: null,
        contractStartDate: null,
        contractEndDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findById.mockResolvedValue(client);
      mockClientRepo.getRelatedDataCounts.mockResolvedValue({
        srsCount: 0,
        usersCount: 0,
        serviceCategoriesCount: 0,
        clientHandlersCount: 0,
      });
      mockClientRepo.delete.mockResolvedValue(client);

      const result = await clientService.deleteClient('1');

      expect(result).toEqual(client);
      expect(mockClientRepo.getRelatedDataCounts).toHaveBeenCalledWith('1');
      expect(mockClientRepo.delete).toHaveBeenCalledWith('1');
    });

    it('존재하지 않는 고객사를 삭제하려하면 NotFoundError를 던져야 함', async () => {
      mockClientRepo.findById.mockResolvedValue(null);

      await expect(clientService.deleteClient('999'))
        .rejects
        .toThrow(NotFoundError);

      expect(mockClientRepo.getRelatedDataCounts).not.toHaveBeenCalled();
      expect(mockClientRepo.delete).not.toHaveBeenCalled();
    });

    it('관련 SR이 있으면 ReferentialIntegrityError를 던져야 함', async () => {
      const client: Client = {
        id: '1',
        code: 'TEST001',
        name: 'Test Client',
        industry: 'IT',
        contactPerson: 'John Doe',
        contactEmail: 'test@example.com',
        contactPhone: null,
        address: null,
        contractStartDate: null,
        contractEndDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findById.mockResolvedValue(client);
      mockClientRepo.getRelatedDataCounts.mockResolvedValue({
        srsCount: 5,  // SR이 5개 존재
        usersCount: 0,
        serviceCategoriesCount: 0,
        clientHandlersCount: 0,
      });

      await expect(clientService.deleteClient('1'))
        .rejects
        .toThrow(ReferentialIntegrityError);

      expect(mockClientRepo.delete).not.toHaveBeenCalled();
    });

    it('관련 사용자가 있으면 ReferentialIntegrityError를 던져야 함', async () => {
      const client: Client = {
        id: '1',
        code: 'TEST001',
        name: 'Test Client',
        industry: 'IT',
        contactPerson: 'John Doe',
        contactEmail: 'test@example.com',
        contactPhone: null,
        address: null,
        contractStartDate: null,
        contractEndDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findById.mockResolvedValue(client);
      mockClientRepo.getRelatedDataCounts.mockResolvedValue({
        srsCount: 0,
        usersCount: 3,  // 사용자 3명 존재
        serviceCategoriesCount: 0,
        clientHandlersCount: 0,
      });

      await expect(clientService.deleteClient('1'))
        .rejects
        .toThrow(ReferentialIntegrityError);

      expect(mockClientRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('getClientById', () => {
    it('성공적으로 고객사를 조회해야 함', async () => {
      const client: Client = {
        id: '1',
        code: 'TEST001',
        name: 'Test Client',
        industry: 'IT',
        contactPerson: 'John Doe',
        contactEmail: 'test@example.com',
        contactPhone: null,
        address: null,
        contractStartDate: null,
        contractEndDate: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClientRepo.findById.mockResolvedValue(client);

      const result = await clientService.getClientById('1');

      expect(result).toEqual(client);
      expect(mockClientRepo.findById).toHaveBeenCalledWith('1');
    });

    it('존재하지 않는 고객사 ID면 null을 반환해야 함', async () => {
      mockClientRepo.findById.mockResolvedValue(null);

      const result = await clientService.getClientById('999');

      expect(result).toBeNull();
    });
  });

  describe('getAllClients', () => {
    it('모든 고객사 목록을 반환해야 함', async () => {
      const clients: Client[] = [
        {
          id: '1',
          code: 'TEST001',
          name: 'Test Client 1',
          industry: 'IT',
          contactPerson: 'John Doe',
          contactEmail: 'test1@example.com',
          contactPhone: null,
          address: null,
          contractStartDate: null,
          contractEndDate: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          code: 'TEST002',
          name: 'Test Client 2',
          industry: 'Finance',
          contactPerson: 'Jane Smith',
          contactEmail: 'test2@example.com',
          contactPhone: null,
          address: null,
          contractStartDate: null,
          contractEndDate: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockClientRepo.findAll.mockResolvedValue(clients);

      const result = await clientService.getAllClients();

      expect(result).toEqual(clients);
      expect(result).toHaveLength(2);
    });

    it('고객사가 없으면 빈 배열을 반환해야 함', async () => {
      mockClientRepo.findAll.mockResolvedValue([]);

      const result = await clientService.getAllClients();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });
});
