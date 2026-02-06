import { beforeEach,describe, expect, it, vi } from 'vitest';

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

  it('should deny access to unauthorized user', async () => {
    // Mock session for a user with NO permissions and NO client association
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'user-1',
        permissions: [],
        clientIds: [],
      },
    });

    const result = await getClientAction('client-1');

    // CURRENTLY: This expectation will FAIL because the action allows access
    // AFTER FIX: This expectation will PASS
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/권한이 없습니다/);
  });

  it('should allow access to user with CLIENT.READ permission', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'admin-1',
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: [],
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockClient);
  });

  it('should allow access to user belonging to the client', async () => {
    (getAuthenticatedSession as any).mockResolvedValue({
      user: {
        id: 'client-user-1',
        permissions: [],
        clientIds: ['client-1'],
      },
    });

    const result = await getClientAction('client-1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockClient);
  });
});
