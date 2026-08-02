import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ClientService } from '@/services/client.service';

import { getClientAction } from '../client.actions';

// Mock dependencies with factory to avoid importing real modules that might trigger next-auth issues
vi.mock('@/services/client.service', () => {
  const ClientService = vi.fn();
  ClientService.prototype.getClientById = vi.fn();
  return { ClientService };
});

vi.mock('@/lib/action-helpers', () => ({
  getAuthenticatedSession: vi.fn(),
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
}));

describe('getClientAction Security', () => {
  const mockClient = {
    id: 'client-1',
    name: 'Test Client',
    code: 'TEST',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Mock ClientService to return a client by default
    (ClientService.prototype.getClientById as any).mockResolvedValue(mockClient);
  });

  it('should deny access to unauthorized user (no permission, no membership)', async () => {
    // Mock session for a user with NO permissions and NO client association
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'user-1',
        roles: [],
        permissions: [],
        clientIds: [],
      },
    });

    const result = await getClientAction('client-1');

    // CURRENTLY: This expectation will FAIL because the action allows access
    // AFTER FIX: This expectation will PASS
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/권한이 없습니다/);
      // ForbiddenError('@/lib/errors') 가 Result 로 변환된 코드
      expect(result.code).toBe('FORBIDDEN');
    }
    expect((result as any).data).toBeUndefined();
  });

  it('should ALLOW an INTERNAL user holding CLIENT.READ to read any client', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'manager-1',
        roles: ['MANAGER'], // 내부 사용자
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: [],
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockClient);
    }
  });

  it('should DENY an EXTERNAL user holding CLIENT.READ who is NOT a member (cross-tenant isolation)', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'external-1',
        roles: [], // 내부 역할 없음 = 외부(고객사) 사용자
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: ['other-client'], // 조회 대상 client-1 에 소속되지 않음
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/권한이 없습니다/);
      // ForbiddenError('@/lib/errors') 가 Result 로 변환된 코드
      expect(result.code).toBe('FORBIDDEN');
    }
    // 타 고객사 데이터가 절대 유출되지 않아야 한다
    expect((result as any).data).toBeUndefined();
  });

  it('should DENY an EXTERNAL user with CLIENT.READ and no membership info at all', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'external-2',
        roles: [],
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: [],
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN');
    }
    expect((result as any).data).toBeUndefined();
  });

  it('should allow access to user belonging to the client', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'client-user-1',
        roles: [],
        permissions: [],
        clientIds: ['client-1'],
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockClient);
    }
  });
});
