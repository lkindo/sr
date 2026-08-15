import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { ClientService } from '../client.service';

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
      // 신규 고객사는 기본 카테고리를 함께 시드한다(감사 3.18).
      // 카테고리가 0개면 그 고객사는 SR 을 한 건도 받을 수 없기 때문이다.
      create: vi.fn(),
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
    // ⚠️ 이 스텁이 없으면 audit.service 가 `client.auditLog?.create` 가드에 걸려
    // 로그를 **조용히 건너뛴다**. 그러면 감사 동작이 전혀 검증되지 않은 채 통과한다.
    auditLog: {
      create: vi.fn(),
    },
    // 고객사 생성/수정/삭제는 전부 감사 로그와 한 트랜잭션으로 묶여 있다.
    $transaction: vi.fn(),
  },
}));

describe('ClientService', () => {
  let clientService: ClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    clientService = new ClientService();
    // 트랜잭션 콜백에 같은 prisma 스텁을 넘겨 실제 호출을 관찰할 수 있게 한다.
    vi.mocked(prisma.$transaction).mockImplementation(((cb: unknown) =>
      (cb as (tx: typeof prisma) => unknown)(prisma)) as never);
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
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue({
        id: 'cat1',
        categoryName: '일반 요청',
      } as any);

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

    it('생성을 감사 로그에 남겨야 함 (행위자·기본 카테고리 포함)', async () => {
      const clientData = { code: 'CLI001', name: 'Test Client' };
      const mockCreatedClient = { id: 'client1', ...clientData };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.client.create).mockResolvedValue(mockCreatedClient as any);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue({
        id: 'cat1',
        categoryName: '일반 요청',
      } as any);

      await clientService.createClient(clientData, 'actor1', null);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'actor1',
          actionType: 'CLIENT_CREATE',
          targetEntity: 'Client',
          targetId: 'client1',
          changes: {
            after: mockCreatedClient,
            defaultServiceCategory: { id: 'cat1', categoryName: '일반 요청' },
          },
          ipAddress: null,
        },
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

    it('수정을 before/after 와 함께 감사 로그에 남겨야 함', async () => {
      const before = { id: 'client1', name: 'Old Name' };
      const after = { id: 'client1', name: 'Updated Client' };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(before as any);
      vi.mocked(prisma.client.update).mockResolvedValue(after as any);

      await clientService.updateClient('client1', { name: 'Updated Client' }, 'actor1', null);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'actor1',
          actionType: 'CLIENT_UPDATE',
          targetEntity: 'Client',
          targetId: 'client1',
          changes: { before, after },
          ipAddress: null,
        },
      });
    });

    it('활성화 토글도 CLIENT_UPDATE 로 남는다 (별도 actionType 없음)', async () => {
      const before = { id: 'client1', isActive: true };
      const after = { id: 'client1', isActive: false };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(before as any);
      vi.mocked(prisma.client.update).mockResolvedValue(after as any);

      await clientService.updateClient('client1', { isActive: false }, 'actor1', null);

      const logged = vi.mocked(prisma.auditLog.create).mock.calls[0]![0] as any;
      expect(logged.data.actionType).toBe('CLIENT_UPDATE');
      expect(logged.data.changes).toEqual({ before, after });
    });

    it('생략한 계약일은 부분 수정 중 덮어쓰지 않는다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'client1' } as any);
      vi.mocked(prisma.client.update).mockResolvedValue({ id: 'client1' } as any);

      await clientService.updateClient('client1', { name: 'Updated Client' });

      const data = vi.mocked(prisma.client.update).mock.calls[0]![0].data;
      expect(data).not.toHaveProperty('contractStartDate');
      expect(data).not.toHaveProperty('contractEndDate');
    });

    it('빈 계약일은 명시적인 삭제로 저장한다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'client1' } as any);
      vi.mocked(prisma.client.update).mockResolvedValue({ id: 'client1' } as any);

      await clientService.updateClient('client1', {
        contractStartDate: '',
        contractEndDate: '',
      });

      expect(vi.mocked(prisma.client.update).mock.calls[0]![0].data).toEqual(
        expect.objectContaining({ contractStartDate: null, contractEndDate: null })
      );
    });

    it('없는 고객사는 수정도 감사 로그도 하지 않는다', async () => {
      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);

      await expect(clientService.updateClient('nope', { name: 'x' })).rejects.toThrow();

      expect(prisma.client.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
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

    it('삭제를 before 스냅샷과 함께 감사 로그에 남겨야 함', async () => {
      const before = { id: 'client1', code: 'CLI001', name: 'Test Client' };

      vi.mocked(prisma.client.findUnique).mockResolvedValue(before as any);
      vi.mocked(prisma.userClient.count).mockResolvedValue(0);
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.serviceCategory.count).mockResolvedValue(0);
      vi.mocked(prisma.clientHandler.count).mockResolvedValue(0);
      vi.mocked(prisma.client.delete).mockResolvedValue(before as any);

      await clientService.deleteClient('client1', 'actor1', null);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'actor1',
          actionType: 'CLIENT_DELETE',
          targetEntity: 'Client',
          targetId: 'client1',
          changes: { before },
          ipAddress: null,
        },
      });
    });

    it('관련 데이터가 있으면 에러를 던져야 함', async () => {
      vi.mocked(prisma.userClient.count).mockResolvedValue(5);

      await expect(clientService.deleteClient('client1')).rejects.toThrow();
      expect(prisma.client.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
