import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ForbiddenError, UnauthorizedError } from '@/lib/errors';

// Mock auth before importing helpers
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// vi.hoisted를 사용하여 mock 함수가 vi.mock보다 먼저 사용되도록 함
const { mockRequirePermission } = vi.hoisted(() => ({
  mockRequirePermission: vi.fn(),
}));

const { mockHeadersGet, mockCheck } = vi.hoisted(() => ({
  mockHeadersGet: vi.fn(),
  mockCheck: vi.fn(),
}));

// Mock next/headers for requireRateLimit testing
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: mockHeadersGet,
  }),
}));

// Mock rate-limiter for requireRateLimit testing
vi.mock('@/lib/rate-limiter', () => ({
  rateLimiters: {
    standard: { check: mockCheck },
    strict: { check: mockCheck },
  },
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    requirePermission = mockRequirePermission;
  },
}));

// Import helpers after mocks are set up
import * as helpers from '@/lib/action-helpers';

describe('Action Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthenticatedSession', () => {
    it('throws UnauthorizedError if no session', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValue(null as any);
      await expect(helpers.getAuthenticatedSession()).rejects.toThrow(UnauthorizedError);
    });

    it('returns session if authenticated', async () => {
      const { auth } = await import('@/auth');
      const mockSession = {
        user: {
          id: 'u1',
          name: 'N',
          email: 'test@example.com',
          roles: ['ADMIN'],
          permissions: [],
          clientIds: [],
        },
        expires: '2099-01-01',
      };
      vi.mocked(auth).mockResolvedValue(mockSession as any);
      const result = await helpers.getAuthenticatedSession();
      expect(result).toEqual(mockSession);
    });
  });

  describe('requirePermission', () => {
    it('calls permission service requirePermission', async () => {
      mockRequirePermission.mockResolvedValue(undefined);
      await helpers.requirePermission('user-123', 'sr:create');
      expect(mockRequirePermission).toHaveBeenCalledWith('user-123', 'sr:create');
    });

    it('throws when permission service throws', async () => {
      mockRequirePermission.mockRejectedValue(new ForbiddenError('No permission'));
      await expect(helpers.requirePermission('user-123', 'sr:delete')).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('authenticateAndAuthorize', () => {
    it('returns session when authenticated and authorized', async () => {
      const { auth } = await import('@/auth');
      const mockSession = {
        user: {
          id: 'u1',
          name: 'Test',
          email: 'test@example.com',
          roles: ['ADMIN'],
          permissions: [],
          clientIds: [],
        },
        expires: '2099-01-01',
      };
      vi.mocked(auth).mockResolvedValue(mockSession as any);
      mockRequirePermission.mockResolvedValue(undefined);

      const result = await helpers.authenticateAndAuthorize('sr:read');

      expect(result).toEqual(mockSession);
      expect(mockRequirePermission).toHaveBeenCalledWith('u1', 'sr:read');
    });

    it('throws UnauthorizedError when not authenticated', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValue(null as any);

      await expect(helpers.authenticateAndAuthorize('sr:read')).rejects.toThrow(UnauthorizedError);
    });

    it('throws ForbiddenError when not authorized', async () => {
      const { auth } = await import('@/auth');
      const mockSession = {
        user: {
          id: 'u1',
          name: 'Test',
          email: 'test@example.com',
          roles: ['USER'],
          permissions: [],
          clientIds: [],
        },
        expires: '2099-01-01',
      };
      vi.mocked(auth).mockResolvedValue(mockSession as any);
      mockRequirePermission.mockRejectedValue(new ForbiddenError('Insufficient permissions'));

      await expect(helpers.authenticateAndAuthorize('sr:delete')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('validateWithSchema', () => {
    const schema = z.object({ id: z.string() });

    it('returns success with validated data', () => {
      const result = helpers.validateWithSchema({ id: 'abc123' }, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: 'abc123' });
      }
    });

    it('returns fail on ZodError', () => {
      const result = helpers.validateWithSchema({ id: 123 }, schema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('throws on non-ZodError', () => {
      const buggedSchema = {
        parse: () => {
          throw new Error('Bug');
        },
      } as any;
      expect(() => helpers.validateWithSchema({}, buggedSchema)).toThrow('Bug');
    });
  });

  describe('withActionErrorHandling', () => {
    it('returns result when action succeeds', async () => {
      const action = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      const result = await helpers.withActionErrorHandling(action);
      expect(result).toEqual({ success: true, data: 'result' });
    });

    it('returns fail result for ZodError', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['id'],
          message: 'Expected string',
        } as any,
      ]);
      const action = vi.fn().mockRejectedValue(zodError);

      const result = await helpers.withActionErrorHandling(action);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rethrows non-ZodError errors', async () => {
      const action = vi.fn().mockRejectedValue(new Error('Database error'));

      await expect(helpers.withActionErrorHandling(action)).rejects.toThrow('Database error');
    });
  });

  describe('requireRateLimit', () => {
    it('요청이 허용된 한도 내인 경우 에러 없이 리졸브되어야 함', async () => {
      mockHeadersGet.mockReturnValue('127.0.0.1');
      mockCheck.mockResolvedValue({ allowed: true });

      await expect(helpers.requireRateLimit('standard')).resolves.toBeUndefined();
      expect(mockCheck).toHaveBeenCalled();
    });

    it('속도 제한 초과 시 TooManyRequestsError를 발생시켜야 함', async () => {
      mockHeadersGet.mockReturnValue('12.34.56.78');
      mockCheck.mockResolvedValue({ allowed: false });

      const { TooManyRequestsError } = await import('@/lib/errors');
      await expect(helpers.requireRateLimit('strict')).rejects.toThrow(TooManyRequestsError);
    });
  });
});
