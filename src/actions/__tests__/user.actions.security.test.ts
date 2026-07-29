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

    it('should ALLOW access for an INTERNAL actor holding USER:READ', async () => {
      // Authenticated as an internal user (MANAGER) with USER:READ, reading another user
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-2', roles: ['MANAGER'], permissions: ['USER:READ'], clientIds: [] },
      });
      (hasPermissionFlag as any).mockReturnValue(true);

      const result = await getUserAction('user-1');

      expect(result.success).toBe(true);
    });

    it('should DENY an EXTERNAL actor holding USER:READ from reading a user of ANOTHER tenant', async () => {
      const { UserService } = await import('@/services/user.service');
      // 대상 사용자는 client-a 소속
      (UserService.prototype.getUserById as any).mockResolvedValue({
        ...mockUser,
        clients: [{ clientId: 'client-a' }],
      });

      // 액터는 내부 역할이 없는 외부(고객사) 사용자이며 client-b 소속
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-2', roles: [], permissions: ['USER:READ'], clientIds: ['client-b'] },
      });
      // 권한 플래그(USER:READ)는 보유 — 그럼에도 테넌트 격리로 차단되어야 한다
      (hasPermissionFlag as any).mockReturnValue(true);

      const result = await getUserAction('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('권한이 없습니다.');
        // ForbiddenError('@/lib/errors') 가 Result 로 변환된 코드
        expect(result.code).toBe('FORBIDDEN');
      }
      // 타 테넌트 사용자 정보가 절대 유출되지 않아야 한다
      expect((result as any).data).toBeUndefined();
    });

    it('should ALLOW an EXTERNAL actor holding USER:READ to read a user sharing the SAME client', async () => {
      const { UserService } = await import('@/services/user.service');
      (UserService.prototype.getUserById as any).mockResolvedValue({
        ...mockUser,
        clients: [{ clientId: 'client-a' }],
      });

      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-2', roles: [], permissions: ['USER:READ'], clientIds: ['client-a'] },
      });
      (hasPermissionFlag as any).mockReturnValue(true);

      const result = await getUserAction('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).password).toBeUndefined();
      }
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
