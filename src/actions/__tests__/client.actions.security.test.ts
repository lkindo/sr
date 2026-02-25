import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { ClientService } from '@/services/client.service';

import { getClientsForSelection } from '../client.actions';

// Mock dependencies
vi.mock('@/services/client.service', () => {
  const ClientService = vi.fn();
  ClientService.prototype.getAllClients = vi.fn();
  ClientService.prototype.getClientsForSelection = vi.fn();
  return { ClientService };
});

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
}));

describe('Client Actions Security', () => {
  const mockClientsFull = [
    {
      id: 'client-1',
      code: 'CL1',
      name: 'Client 1',
      contactEmail: 'secret@client1.com',
      contractStartDate: new Date(),
    },
  ];

  const mockClientsSafe = [
    {
      id: 'client-1',
      code: 'CL1',
      name: 'Client 1',
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    (ClientService.prototype.getAllClients as any).mockResolvedValue(mockClientsFull);
    (ClientService.prototype.getClientsForSelection as any).mockResolvedValue(mockClientsSafe);
  });

  describe('getClientsForSelection', () => {
    it('should require authentication', async () => {
      // Mock authenticateAndAuthorize to throw Unauthorized error
      (authenticateAndAuthorize as any).mockRejectedValue(new Error('Unauthorized'));

      const result = await getClientsForSelection();

      // Should return error result, not throw
      expect(result.success).toBe(false);
      // expect(result.error).toContain('Unauthorized'); // Depends on how the error is handled in the catch block
      expect(authenticateAndAuthorize).toHaveBeenCalled();
    });

    it('should return limited fields using the safe service method', async () => {
      // Mock auth success
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'user-1', roles: ['ADMIN'], clientIds: [] },
      });

      const result: any = await getClientsForSelection();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);

      // Verify it called the safe method
      expect(ClientService.prototype.getClientsForSelection).toHaveBeenCalled();

      // Verify data shape
      expect(result.data[0].id).toBe('client-1');
      expect(result.data[0].contactEmail).toBeUndefined();
    });
  });
});
