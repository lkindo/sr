import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getAuthenticatedSession, 
  requirePermission, 
  authenticateAndAuthorize,
  validateWithSchema 
} from '../action-helpers';
import { UnauthorizedError } from '@/lib/errors';
import { z } from 'zod';

// Mock dependencies
const mockAuth = vi.fn();
const mockIsAuthenticatedSession = vi.fn();
const mockRequirePermissionFn = vi.fn();

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/types/session', () => ({
  isAuthenticatedSession: (session: any) => mockIsAuthenticatedSession(session),
}));

vi.mock('@/services/permission.service', () => {
  // Mock 함수를 팩토리 함수로 감싸서 호이스팅 문제 해결
  return {
    PermissionService: class MockPermissionService {
      requirePermission = (...args: any[]) => mockRequirePermissionFn(...args);
    },
  };
});

describe('action-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthenticatedSession', () => {
    it('인증된 세션을 반환해야 함', async () => {
      const mockSession = {
        user: {
          id: 'user1',
          email: 'user@example.com',
          name: 'Test User',
          image: null,
          roles: ['USER'],
          permissions: ['sr:read'],
        },
      };

      mockAuth.mockResolvedValue(mockSession);
      mockIsAuthenticatedSession.mockReturnValue(true);

      const result = await getAuthenticatedSession();

      expect(result).toEqual(mockSession);
      expect(mockIsAuthenticatedSession).toHaveBeenCalledWith(mockSession);
    });

    it('세션이 없으면 UnauthorizedError를 던져야 함', async () => {
      mockAuth.mockResolvedValue(null);
      mockIsAuthenticatedSession.mockReturnValue(false);

      await expect(getAuthenticatedSession()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('requirePermission', () => {
    it('권한이 있으면 성공해야 함', async () => {
      mockRequirePermissionFn.mockResolvedValue(undefined);

      await requirePermission('user1', 'sr:create');

      expect(mockRequirePermissionFn).toHaveBeenCalledWith('user1', 'sr:create');
    });
  });

  describe('authenticateAndAuthorize', () => {
    it('인증 및 권한 확인을 모두 수행해야 함', async () => {
      const mockSession = {
        user: {
          id: 'user1',
          email: 'user@example.com',
          name: 'Test User',
          image: null,
          roles: ['USER'],
          permissions: ['sr:create'],
        },
      };

      mockAuth.mockResolvedValue(mockSession);
      mockIsAuthenticatedSession.mockReturnValue(true);
      mockRequirePermissionFn.mockResolvedValue(undefined);

      const result = await authenticateAndAuthorize('sr:create');

      expect(result).toEqual(mockSession);
      expect(mockRequirePermissionFn).toHaveBeenCalledWith('user1', 'sr:create');
    });
  });

  describe('validateWithSchema', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    it('유효한 데이터는 성공해야 함', () => {
      const data = { name: 'Test', age: 25 };
      const result = validateWithSchema(data, testSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('유효하지 않은 데이터는 실패해야 함', () => {
      const data = { name: '', age: -1 };
      const result = validateWithSchema(data, testSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('타입이 맞지 않으면 실패해야 함', () => {
      const data = { name: 'Test', age: 'not-a-number' };
      const result = validateWithSchema(data, testSchema);

      expect(result.success).toBe(false);
    });
  });
});

