import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { ClientService } from '@/services/client.service';

import { getClientsForSelection } from '../client.actions';

// Mock dependencies
vi.mock('@/services/client.service', () => {
  const ClientService = vi.fn();
  ClientService.prototype.getClientsForSelection = vi.fn();
  return { ClientService };
});

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
  getAuthenticatedSession: vi.fn(),
}));

vi.mock('@/lib/policies', () => ({
  isInternalUser: (user: any) =>
    ['ADMIN', 'MANAGER', 'ENGINEER'].some((role) => user.roles.includes(role)),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Client Actions Isolation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should pass no filter for internal users (ADMIN)', async () => {
    // Mock auth for ADMIN
    (authenticateAndAuthorize as any).mockResolvedValue({
      user: {
        id: 'admin-1',
        roles: ['ADMIN'],
        clientIds: [],
      },
    });

    await getClientsForSelection();

    expect(ClientService.prototype.getClientsForSelection).toHaveBeenCalledWith(undefined);
  });

  it('should pass clientIds filter for external users (CLIENT_ADMIN)', async () => {
    // Mock auth for CLIENT_ADMIN
    (authenticateAndAuthorize as any).mockResolvedValue({
      user: {
        id: 'client-admin-1',
        roles: ['CLIENT_ADMIN'],
        clientIds: ['client-1'],
      },
    });

    await getClientsForSelection();

    // EXPECTED BEHAVIOR: called with ['client-1']
    // CURRENT BEHAVIOR (Failure): called with undefined or nothing
    expect(ClientService.prototype.getClientsForSelection).toHaveBeenCalledWith(['client-1']);
  });
});
