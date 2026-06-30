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

import {
  changePasswordAction,
  getProfileAction,
  getSRHandlersForSelection,
  getUserAction,
  updateUserAction,
} from '../user.actions';

const session = { user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  (authenticateAndAuthorize as Mock).mockResolvedValue(session);
  (getAuthenticatedSession as Mock).mockResolvedValue(session);
  (requireRateLimit as Mock).mockResolvedValue(undefined);
  (ensureCanReadUser as Mock).mockReturnValue(undefined);
});

describe('updateUserAction', () => {
  it('updates the profile on valid input and returns ok', async () => {
    const updated = { id: 'user-1', name: 'New Name', email: 'new@example.com' };
    userService.updateProfile.mockResolvedValue(updated);

    const fd = new FormData();
    fd.append('name', 'New Name');
    fd.append('email', 'new@example.com');
    fd.append('image', 'https://example.com/a.png');

    const result = await updateUserAction(fd);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(updated);
    expect(authenticateAndAuthorize).toHaveBeenCalledWith('user:update');
    expect(userService.updateProfile).toHaveBeenCalledWith('user-1', {
      name: 'New Name',
      email: 'new@example.com',
      image: 'https://example.com/a.png',
    });
  });

  it('treats empty form fields as undefined (no fields provided)', async () => {
    const updated = { id: 'user-1', name: 'Existing' };
    userService.updateProfile.mockResolvedValue(updated);

    const fd = new FormData(); // nothing appended

    const result = await updateUserAction(fd);

    expect(result.success).toBe(true);
    expect(userService.updateProfile).toHaveBeenCalledWith('user-1', {
      name: undefined,
      email: undefined,
      image: undefined,
    });
  });

  it('returns validation error for invalid email (before auth)', async () => {
    const fd = new FormData();
    fd.append('email', 'not-an-email');

    const result = await updateUserAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    // validation happens before auth & service
    expect(authenticateAndAuthorize).not.toHaveBeenCalled();
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });

  it('returns ForbiddenError result when authorization fails', async () => {
    (authenticateAndAuthorize as Mock).mockRejectedValue(
      new ForbiddenError('사용자 수정 권한이 없습니다.')
    );

    const fd = new FormData();
    fd.append('name', 'Whatever');

    const result = await updateUserAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN');
      expect(result.error).toBe('사용자 수정 권한이 없습니다.');
    }
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });

  it('maps unexpected service errors to a result', async () => {
    userService.updateProfile.mockRejectedValue(new Error('db down'));

    const fd = new FormData();
    fd.append('name', 'Valid Name');

    const result = await updateUserAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.error).toBe('db down');
    }
  });
});

describe('changePasswordAction', () => {
  it('changes password on strong valid input', async () => {
    userService.changePassword.mockResolvedValue(undefined);

    const fd = new FormData();
    fd.append('currentPassword', 'OldPass1!');
    fd.append('newPassword', 'StrongPass1!');
    fd.append('confirmPassword', 'StrongPass1!');

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(true);
    expect(requireRateLimit).toHaveBeenCalledWith('strict');
    expect(authenticateAndAuthorize).toHaveBeenCalledWith('user:change_password');
    expect(userService.changePassword).toHaveBeenCalledWith('user-1', 'OldPass1!', 'StrongPass1!');
  });

  it('returns validation error when new password is weak', async () => {
    const fd = new FormData();
    fd.append('currentPassword', 'OldPass1!');
    fd.append('newPassword', 'weak');
    fd.append('confirmPassword', 'weak');

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(userService.changePassword).not.toHaveBeenCalled();
  });

  it('returns validation error when confirmation does not match', async () => {
    const fd = new FormData();
    fd.append('currentPassword', 'OldPass1!');
    fd.append('newPassword', 'StrongPass1!');
    fd.append('confirmPassword', 'Different1!');

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('handles missing fields (empty strings) via validation', async () => {
    const fd = new FormData(); // nothing appended -> all default to ''

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(userService.changePassword).not.toHaveBeenCalled();
  });

  it('propagates rate limit errors as a result', async () => {
    const { TooManyRequestsError } = await import('@/lib/errors');
    (requireRateLimit as Mock).mockRejectedValue(new TooManyRequestsError());

    const fd = new FormData();
    fd.append('currentPassword', 'OldPass1!');
    fd.append('newPassword', 'StrongPass1!');
    fd.append('confirmPassword', 'StrongPass1!');

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('TOO_MANY_REQUESTS');
  });

  it('maps service errors thrown during changePassword', async () => {
    userService.changePassword.mockRejectedValue(new Error('hash failure'));

    const fd = new FormData();
    fd.append('currentPassword', 'OldPass1!');
    fd.append('newPassword', 'StrongPass1!');
    fd.append('confirmPassword', 'StrongPass1!');

    const result = await changePasswordAction(fd);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('hash failure');
  });
});

describe('getUserAction', () => {
  it('returns the user when found and policy allows', async () => {
    const user = { id: 'user-2', name: 'Target' };
    userService.getUserById.mockResolvedValue(user);

    const result = await getUserAction('user-2');

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(user);
    expect(ensureCanReadUser).toHaveBeenCalledWith(session.user, user);
  });

  it('returns NOT_FOUND when user does not exist', async () => {
    userService.getUserById.mockResolvedValue(null);

    const result = await getUserAction('missing');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toBe('사용자를 찾을 수 없습니다.');
    }
    expect(ensureCanReadUser).not.toHaveBeenCalled();
  });

  it('rewrites the forbidden read message to a generic one', async () => {
    userService.getUserById.mockResolvedValue({ id: 'user-2' });
    (ensureCanReadUser as Mock).mockImplementation(() => {
      throw new ForbiddenError('사용자 조회 권한이 없습니다.');
    });

    const result = await getUserAction('user-2');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN');
      expect(result.error).toBe('권한이 없습니다.');
    }
  });

  it('keeps other forbidden messages unchanged', async () => {
    userService.getUserById.mockResolvedValue({ id: 'user-2' });
    (ensureCanReadUser as Mock).mockImplementation(() => {
      throw new ForbiddenError('다른 사유');
    });

    const result = await getUserAction('user-2');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN');
      expect(result.error).toBe('다른 사유');
    }
  });

  it('returns error result when not authenticated', async () => {
    (getAuthenticatedSession as Mock).mockRejectedValue(new Error('Unauthorized'));

    const result = await getUserAction('user-2');

    expect(result.success).toBe(false);
    expect(userService.getUserById).not.toHaveBeenCalled();
  });
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
