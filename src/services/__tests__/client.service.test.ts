import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientService } from '../client.service';

// Mock repositories
const mockFindById = vi.fn();
const mockFindDetailsById = vi.fn();
const mockFindAll = vi.fn();
const mockFindByCode = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetRelatedDataCounts = vi.fn();
const mockServiceCategoryFindAll = vi.fn();

vi.mock('@/repositories/client.repository', () => ({
  ClientRepository: class MockClientRepository {
    findById = mockFindById;
    findDetailsById = mockFindDetailsById;
    findAll = mockFindAll;
    findByCode = mockFindByCode;
    create = mockCreate;
    update = mockUpdate;
    delete = mockDelete;
    getRelatedDataCounts = mockGetRelatedDataCounts;
  },
}));

vi.mock('@/repositories/service-category.repository', () => ({
  ServiceCategoryRepository: class MockServiceCategoryRepository {
    findAll = mockServiceCategoryFindAll;
  },
}));

describe('ClientService', () => {
  let clientService: ClientService;
  let mockClientRepository: any;
  let mockServiceCategoryRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
    mockClientRepository = (clientService as any).clientRepository;
    mockServiceCategoryRepository = (clientService as any).serviceCategoryRepository;
    
    // Mock 함수들을 실제 mock 함수로 설정
    mockClientRepository.findById = mockFindById;
    mockClientRepository.findDetailsById = mockFindDetailsById;
    mockClientRepository.findAll = mockFindAll;
    mockClientRepository.findByCode = mockFindByCode;
    mockClientRepository.create = mockCreate;
    mockClientRepository.update = mockUpdate;
    mockClientRepository.delete = mockDelete;
    mockClientRepository.getRelatedDataCounts = mockGetRelatedDataCounts;
    mockServiceCategoryRepository.findAll = mockServiceCategoryFindAll;
  });

  describe('getClientById', () => {
    it('고객사를 조회해야 함', async () => {
      const mockClient = {
        id: 'client1',
        code: 'CLI001',
        name: 'Test Client',
      };

      mockClientRepository.findById.mockResolvedValue(mockClient);

      const result = await clientService.getClientById('client1');

      expect(result).toEqual(mockClient);
      expect(mockClientRepository.findById).toHaveBeenCalledWith('client1');
    });
  });

  describe('getAllClients', () => {
    it('모든 고객사 목록을 반환해야 함', async () => {
      const mockClients = [
        { id: 'client1', code: 'CLI001', name: 'Client 1' },
        { id: 'client2', code: 'CLI002', name: 'Client 2' },
      ];

      mockClientRepository.findAll.mockResolvedValue(mockClients);

      const result = await clientService.getAllClients();

      expect(result).toEqual(mockClients);
      expect(mockClientRepository.findAll).toHaveBeenCalled();
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

      // findByCode는 중복 체크를 위해 null을 반환 (중복 없음)
      mockFindByCode.mockResolvedValue(null);
      mockClientRepository.create.mockResolvedValue(mockCreatedClient);

      const result = await clientService.createClient(clientData);

      expect(result).toEqual(mockCreatedClient);
      expect(mockFindByCode).toHaveBeenCalledWith('CLI001');
      expect(mockClientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CLI001',
          name: 'Test Client',
          industry: 'IT',
          isActive: true,
        })
      );
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

      mockClientRepository.update.mockResolvedValue(mockUpdatedClient);

      const result = await clientService.updateClient('client1', updateData);

      expect(result).toEqual(mockUpdatedClient);
      // updateData에 추가 필드가 포함될 수 있으므로 부분 매칭 사용
      expect(mockClientRepository.update).toHaveBeenCalledWith(
        'client1',
        expect.objectContaining(updateData)
      );
    });
  });

  describe('deleteClient', () => {
    it('성공적으로 고객사를 삭제해야 함', async () => {
      mockGetRelatedDataCounts.mockResolvedValue({
        usersCount: 0,
        srsCount: 0,
        serviceCategoriesCount: 0,
        clientHandlersCount: 0,
      });
      mockClientRepository.delete.mockResolvedValue(undefined);

      await clientService.deleteClient('client1');

      expect(mockGetRelatedDataCounts).toHaveBeenCalledWith('client1');
      expect(mockClientRepository.delete).toHaveBeenCalledWith('client1');
    });

    it('관련 데이터가 있으면 에러를 던져야 함', async () => {
      mockGetRelatedDataCounts.mockResolvedValue({
        usersCount: 5,
        srsCount: 10,
        serviceCategoriesCount: 3,
        clientHandlersCount: 2,
      });

      await expect(clientService.deleteClient('client1')).rejects.toThrow();
      expect(mockClientRepository.delete).not.toHaveBeenCalled();
    });
  });
});
