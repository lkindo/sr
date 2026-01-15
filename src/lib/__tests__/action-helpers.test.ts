import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as helpers from '@/lib/action-helpers';
import { UnauthorizedError } from '@/lib/errors';
import { z } from 'zod';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/services/permission.service');

describe('Action Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthenticatedSession', () => {
    it('throws UnauthorizedError if no session', async () => {
      const { auth } = await import('@/auth');
      vi.mocked(auth).mockResolvedValue(null);
      await expect(helpers.getAuthenticatedSession()).rejects.toThrow(UnauthorizedError);
    });

    it('returns session if authenticated', async () => {
      const { auth } = await import('@/auth');
      const mockSession = { user: { id: 'u1', name: 'N', role_names: ['ADMIN'] } };
      vi.mocked(auth).mockResolvedValue(mockSession as any);
      const result = await helpers.getAuthenticatedSession();
      expect(result).toEqual(mockSession);
    });
  });

  describe('validateWithSchema', () => {
    const schema = z.object({ id: z.string() });

    it('returns fail on ZodError', () => {
      const result = helpers.validateWithSchema({ id: 123 }, schema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('throws on non-ZodError', () => {
      const buggedSchema = { parse: () => { throw new Error('Bug'); } } as any;
      expect(() => helpers.validateWithSchema({}, buggedSchema)).toThrow('Bug');
    });
  });
});
