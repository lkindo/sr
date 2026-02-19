import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/action-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/action-helpers')>('@/lib/action-helpers');
  return {
    ...actual,
    authenticateAndAuthorize: vi.fn(),
  };
});

vi.mock('@/services/user.service', () => {
  const UserService = vi.fn();
  UserService.prototype.changePassword = vi.fn().mockResolvedValue(undefined);
  return { UserService };
});

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { changePasswordAction } from '../user.actions';

describe('changePasswordAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (authenticateAndAuthorize as Mock).mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('should reject weak passwords (length < 8)', async () => {
    const formData = new FormData();
    formData.append('currentPassword', 'OldPass1!');
    formData.append('newPassword', 'weak');
    formData.append('confirmPassword', 'weak');

    const result = await changePasswordAction(formData);

    expect(result.success).toBe(false);
  });

  it('should reject passwords missing complexity (no uppercase)', async () => {
    const formData = new FormData();
    formData.append('currentPassword', 'OldPass1!');
    formData.append('newPassword', 'weakpassword1!');
    formData.append('confirmPassword', 'weakpassword1!');

    const result = await changePasswordAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should accept strong passwords', async () => {
    const formData = new FormData();
    formData.append('currentPassword', 'OldPass1!');
    formData.append('newPassword', 'StrongPass1!');
    formData.append('confirmPassword', 'StrongPass1!');

    const result = await changePasswordAction(formData);

    expect(result.success).toBe(true);
  });
});
