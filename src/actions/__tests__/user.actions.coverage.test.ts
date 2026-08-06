import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Mock next-auth / next server bits used transitively
vi.mock('next/server', () => ({
  NextResponse: { json: vi.fn() },
}));

vi.mock('next-auth', () => ({
  default: vi.fn().mockReturnValue({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  }),
}));

// Mock action-helpers: keep real validateWithSchema (so we exercise real Zod
// validation branches), but stub the auth/rate-limit helpers.
vi.mock('@/lib/action-helpers', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/action-helpers')>('@/lib/action-helpers');
  return {
    ...actual,
    authenticateAndAuthorize: vi.fn(),
    getAuthenticatedSession: vi.fn(),
    requireRateLimit: vi.fn(),
  };
});

// Mock the service registry that the actions actually use.
const userService = {
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  getUserById: vi.fn(),
  getUsersWithSRHandlingPermission: vi.fn(),
};

vi.mock('@/services/service-registry', () => ({
  services: {
    get userService() {
      return userService;
    },
  },
}));

// Mock policies so we can drive ForbiddenError deterministically.
vi.mock('@/lib/policies', () => ({
  ensureCanReadUser: vi.fn(),
}));

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  requireRateLimit,
} from '@/lib/action-helpers';
import { ForbiddenError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadUser } from '@/lib/policies';

import { getProfileAction, getSRHandlersForSelection } from '../user.actions';

const session = { user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  (authenticateAndAuthorize as Mock).mockResolvedValue(session);
  (getAuthenticatedSession as Mock).mockResolvedValue(session);
  (requireRateLimit as Mock).mockResolvedValue(undefined);
  (ensureCanReadUser as Mock).mockReturnValue(undefined);
});

describe('getProfileAction', () => {
  it('returns the current user profile', async () => {
    const me = { id: 'user-1', name: 'Me' };
    userService.getUserById.mockResolvedValue(me);

    const result = await getProfileAction();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(me);
    expect(userService.getUserById).toHaveBeenCalledWith('user-1');
  });

  it('returns NOT_FOUND when profile missing', async () => {
    userService.getUserById.mockResolvedValue(null);

    const result = await getProfileAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toBe('프로필을 찾을 수 없습니다.');
    }
  });

  it('returns error result when unauthenticated', async () => {
    (getAuthenticatedSession as Mock).mockRejectedValue(new Error('Unauthorized'));

    const result = await getProfileAction();

    expect(result.success).toBe(false);
  });
});

describe('getSRHandlersForSelection', () => {
  it('returns handlers when authorized', async () => {
    const handlers = [{ id: 'h1', name: 'Handler', email: 'h@example.com' }];
    userService.getUsersWithSRHandlingPermission.mockResolvedValue(handlers);

    const result = await getSRHandlersForSelection();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(handlers);
    expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.SR.UPDATE);
  });

  it('returns error result when authorization fails', async () => {
    (authenticateAndAuthorize as Mock).mockRejectedValue(
      new ForbiddenError('SR 수정 권한이 없습니다.')
    );

    const result = await getSRHandlersForSelection();

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
    expect(userService.getUsersWithSRHandlingPermission).not.toHaveBeenCalled();
  });
});
