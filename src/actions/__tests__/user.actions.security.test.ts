import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({
  default: vi.fn().mockReturnValue({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  }),
}));

// Mock internal modules
vi.mock('@/services/user.service', () => {
  const UserService = vi.fn();
  UserService.prototype.getUserById = vi.fn();
  UserService.prototype.getUsersWithSRHandlingPermission = vi.fn();
  return { UserService };
});

vi.mock('@/lib/action-helpers');
vi.mock('@/lib/permission-helpers'); // Mock permission helpers

// Now import the module under test
import { authenticateAndAuthorize, getAuthenticatedSession } from '@/lib/action-helpers';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';

import { getProfileAction, getSRHandlersForSelection, getUserAction } from '../user.actions';

describe('User Actions Security', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    roles: [],
    clients: [],
    // NO password here, simulating the fixed service
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const { UserService } = await import('@/services/user.service');
    (UserService.prototype.getUserById as any).mockResolvedValue(mockUser);
    (UserService.prototype.getUsersWithSRHandlingPermission as any).mockResolvedValue([
      { id: 'handler-1', name: 'Handler', email: 'handler@example.com' },
    ]);

    // Default permission mock: allow nothing
    (hasPermissionFlag as any).mockReturnValue(false);
    (PERMISSIONS as any).USER = { READ: 'USER:READ' };
    (PERMISSIONS as any).SR = { UPDATE: 'SR:UPDATE' };
  });

  describe('getUserAction', () => {
    it('should NOT return password (fix verified)', async () => {
      // Mock authenticated session
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1' },
      });

      const result = await getUserAction('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).password).toBeUndefined();
      }
    });

    it('should REJECT access without authentication (fix verified)', async () => {
      (getAuthenticatedSession as any).mockRejectedValue(new Error('Unauthorized'));

      const result = await getUserAction('user-1');

      expect(result.success).toBe(false);
    });

    it('should REJECT access if user is not authorized (fix verified)', async () => {
      // Authenticated as user-2, trying to access user-1
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-2' },
      });
      (hasPermissionFlag as any).mockReturnValue(false);

      const result = await getUserAction('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('권한이 없습니다.');
        expect(result.code).toBe('FORBIDDEN');
      }
    });

    it('should ALLOW access if user has permission (fix verified)', async () => {
      // Authenticated as user-2, trying to access user-1, BUT has permission
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-2' },
      });
      (hasPermissionFlag as any).mockReturnValue(true);

      const result = await getUserAction('user-1');

      expect(result.success).toBe(true);
    });
  });

  describe('getProfileAction', () => {
    it('should NOT return password (fix verified)', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1' },
      });

      const result = await getProfileAction();
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).password).toBeUndefined();
      }
    });
  });

  describe('getSRHandlersForSelection', () => {
    it('should REJECT access without authentication or permission', async () => {
      // authenticateAndAuthorize throws if unauthorized
      (authenticateAndAuthorize as any).mockRejectedValue(new Error('Unauthorized'));

      const result = await getSRHandlersForSelection();

      expect(result.success).toBe(false);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('SR:UPDATE');
    });

    it('should ALLOW access if authorized', async () => {
      // authenticateAndAuthorize succeeds
      (authenticateAndAuthorize as any).mockResolvedValue({
        user: { id: 'user-1' },
      });

      const result = await getSRHandlersForSelection();

      expect(result.success).toBe(true);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('SR:UPDATE');
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].email).toBe('handler@example.com');
      }
    });
  });
});
