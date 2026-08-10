import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isInternalUser } from '@/lib/policies';

import {
  createClientAction,
  deleteClientAction,
  getClientsForSelection,
  updateClientAction,
} from '../client.actions';

// Mock service registry so we control the ClientService instance used by actions.
const mockClientService = {
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
  getClientById: vi.fn(),
  getClientsForSelection: vi.fn(),
};

vi.mock('@/services/service-registry', () => ({
  services: {
    get clientService() {
      return mockClientService;
    },
  },
}));

// Fully mock action-helpers (importing the real module pulls in next-auth which
// is not loadable in this test env). We re-implement validateWithSchema with real
// zod parsing so the action's validation branches are genuinely exercised.
vi.mock('@/lib/action-helpers', async () => {
  const { z } = await import('zod');
  return {
    authenticateAndAuthorize: vi.fn(),
    getAuthenticatedSession: vi.fn(),
    validateWithSchema: (data: unknown, schema: any) => {
      try {
        return { success: true, data: schema.parse(data) };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: error.issues?.[0]?.message || '입력값 검증에 실패했습니다.',
            code: 'VALIDATION_ERROR',
          };
        }
        throw error;
      }
    },
  };
});

// Control policy decisions explicitly.
// 이 스위트는 액션의 **배선**(검증 → 서비스 호출 → Result 변환)을 다루므로 정책은
// 통과시킨다. 테넌트 경계 자체는 `client.actions.tenant.test.ts` 가 실물 정책으로 검증한다.
vi.mock('@/lib/policies', () => ({
  ensureCanReadClient: vi.fn(),
  ensureCanWriteClient: vi.fn(),
  isInternalUser: vi.fn(),
}));

function buildCreateFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    code: 'ACME',
    name: 'Acme Corp',
    industry: 'Tech',
    contactPerson: 'Jane',
    contactEmail: 'jane@acme.com',
    contactPhone: '010-1234-5678',
    address: 'Seoul',
    contractStartDate: '2025-01-01',
    contractEndDate: '2025-12-31',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) {
    fd.set(k, v);
  }
  return fd;
}

describe('client.actions coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createClientAction', () => {
    it('creates a client on the happy path', async () => {
      const created = { id: 'c1', code: 'ACME', name: 'Acme Corp' };
      mockClientService.createClient.mockResolvedValue(created);
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });

      const result = await createClientAction(buildCreateFormData());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(created);
      }
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('client:create');
      // 세션의 행위자 id 가 서비스로 내려가야 감사 로그에 누가 만들었는지 남는다.
      // (예전에는 이 액션이 authenticateAndAuthorize 의 반환값을 통째로 버렸다.)
      expect(mockClientService.createClient).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ACME', name: 'Acme Corp' }),
        'u1',
        null
      );
    });

    it('handles optional fields being empty (undefined branch)', async () => {
      mockClientService.createClient.mockResolvedValue({ id: 'c2', code: 'XY', name: 'Y' });
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });

      // Only required fields provided; optional ones empty -> undefined branches.
      const fd = new FormData();
      fd.set('code', 'XY');
      fd.set('name', 'Y');

      const result = await createClientAction(fd);

      expect(result.success).toBe(true);
      const arg = mockClientService.createClient.mock.calls[0]![0];
      expect(arg.industry).toBeUndefined();
      expect(arg.contactEmail).toBeUndefined();
    });

    it('returns validation failure when required fields are invalid', async () => {
      // code too short and name empty -> schema validation fails.
      const fd = new FormData();
      fd.set('code', 'a');
      fd.set('name', '');

      const result = await createClientAction(fd);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
      // Should not reach auth/service when validation fails.
      expect(authenticateAndAuthorize).not.toHaveBeenCalled();
      expect(mockClientService.createClient).not.toHaveBeenCalled();
    });

    it('returns validation failure for invalid email', async () => {
      const fd = buildCreateFormData({ contactEmail: 'not-an-email' });

      const result = await createClientAction(fd);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('converts authorization errors to a failure result', async () => {
      (authenticateAndAuthorize as any).mockRejectedValue(
        new ForbiddenError('고객사 생성 권한이 없습니다.')
      );

      const result = await createClientAction(buildCreateFormData());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('FORBIDDEN');
        expect(result.error).toMatch(/권한이 없습니다/);
      }
      expect(mockClientService.createClient).not.toHaveBeenCalled();
    });

    it('converts service errors to a failure result', async () => {
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });
      mockClientService.createClient.mockRejectedValue(new Error('db down'));

      const result = await createClientAction(buildCreateFormData());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('db down');
        expect(result.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('updateClientAction', () => {
    it('updates a client on the happy path', async () => {
      const updated = { id: 'c1', name: 'New Name' };
      mockClientService.updateClient.mockResolvedValue(updated);
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });

      const fd = new FormData();
      fd.set('name', 'New Name');

      const result: any = await updateClientAction('c1', fd);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(result.message).toMatch(/업데이트/);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('client:update');
      expect(mockClientService.updateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'New Name' }),
        'u1',
        null
      );
    });

    it('returns validation failure shape on invalid input', async () => {
      const fd = new FormData();
      fd.set('contactEmail', 'bad-email');

      const result: any = await updateClientAction('c1', fd);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(authenticateAndAuthorize).not.toHaveBeenCalled();
      expect(mockClientService.updateClient).not.toHaveBeenCalled();
    });

    it('converts errors thrown after validation into a result', async () => {
      (authenticateAndAuthorize as any).mockRejectedValue(
        new ForbiddenError('고객사 수정 권한이 없습니다.')
      );

      const fd = new FormData();
      fd.set('name', 'Whatever');

      const result: any = await updateClientAction('c1', fd);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  describe('deleteClientAction', () => {
    it('deletes a client on the happy path', async () => {
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });
      mockClientService.deleteClient.mockResolvedValue(undefined);

      const result: any = await deleteClientAction('c1');

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/삭제/);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('client:delete');
      expect(mockClientService.deleteClient).toHaveBeenCalledWith('c1', 'u1', null);
    });

    it('converts authorization errors into a result', async () => {
      (authenticateAndAuthorize as any).mockRejectedValue(
        new ForbiddenError('고객사 삭제 권한이 없습니다.')
      );

      const result: any = await deleteClientAction('c1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
      expect(mockClientService.deleteClient).not.toHaveBeenCalled();
    });

    it('converts service errors into a result', async () => {
      (authenticateAndAuthorize as any).mockResolvedValue({ user: { id: 'u1' } });
      mockClientService.deleteClient.mockRejectedValue(new NotFoundError('고객사', 'c1'));

      const result: any = await deleteClientAction('c1');

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });
  });

  describe('getClientsForSelection', () => {
    it('returns all clients (no filter) for internal users', async () => {
      const clients = [{ id: 'c1', name: 'C1' }];
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'u1', roles: ['ADMIN'], clientIds: [] },
      });
      (isInternalUser as any).mockReturnValue(true);
      mockClientService.getClientsForSelection.mockResolvedValue(clients);

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(clients);
      // Internal users get undefined (no client-id filter).
      // 2번째 인자는 includeId 옵션 — 수정 다이얼로그가 현재 고객사를 유지할 때만 채운다.
      expect(mockClientService.getClientsForSelection).toHaveBeenCalledWith(undefined, {
        includeId: undefined,
      });
    });

    it('filters by clientIds for external users', async () => {
      const clients = [{ id: 'c2', name: 'C2' }];
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'u2', roles: [], clientIds: ['c2'] },
      });
      (isInternalUser as any).mockReturnValue(false);
      mockClientService.getClientsForSelection.mockResolvedValue(clients);

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(true);
      expect(mockClientService.getClientsForSelection).toHaveBeenCalledWith(['c2'], {
        includeId: undefined,
      });
    });

    it('falls back to empty array when external user has no clientIds', async () => {
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'u3', roles: [] },
      });
      (isInternalUser as any).mockReturnValue(false);
      mockClientService.getClientsForSelection.mockResolvedValue([]);

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(mockClientService.getClientsForSelection).toHaveBeenCalledWith([], {
        includeId: undefined,
      });
    });

    it('includeId 를 서비스에 그대로 넘긴다 — 비활성이 된 현재 고객사를 남기기 위한 것', async () => {
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'u1', roles: ['ADMIN'], clientIds: [] },
      });
      (isInternalUser as any).mockReturnValue(true);
      mockClientService.getClientsForSelection.mockResolvedValue([]);

      await getClientsForSelection('c-inactive');

      expect(mockClientService.getClientsForSelection).toHaveBeenCalledWith(undefined, {
        includeId: 'c-inactive',
      });
    });

    it('returns a friendly error when an Error is thrown', async () => {
      (authenticateAndAuthorize as any).mockRejectedValue(new Error('Unauthorized'));

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
      expect(authenticateAndAuthorize).toHaveBeenCalled();
    });

    it('returns the default message for a non-Error rejection', async () => {
      (authenticateAndAuthorize as any).mockRejectedValue('boom');

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('고객사 목록을 불러오는데 실패했습니다.');
    });
  });
});
