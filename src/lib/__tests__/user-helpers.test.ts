import { describe, expect, it } from 'vitest';

import { excludePassword, getUserTypeBadgeVariant, getUserTypeLabel } from '@/lib/user-helpers';

type UserRole = { role: { id: string; name: string } };
type UserClient = { client: { id: string; name: string; code: string } };
type User = {
  id: string;
  userType: 'ENGINEER' | 'CLIENT';
  roles: UserRole[];
  clients: UserClient[];
};

const makeRole = (name: string): UserRole => ({
  role: { id: `role-${name}`, name },
});

const makeClient = (code: string): UserClient => ({
  client: { id: `client-${code}`, name: `Client ${code}`, code },
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  userType: 'CLIENT',
  roles: [],
  clients: [],
  ...overrides,
});

describe('getUserTypeLabel', () => {
  it('returns 시스템 운영팀 when user has ADMIN role (highest priority)', () => {
    const user = makeUser({
      userType: 'ENGINEER',
      roles: [makeRole('ADMIN')],
      clients: [makeClient('C1')],
    });
    expect(getUserTypeLabel(user)).toBe('시스템 운영팀');
  });

  it('returns 시스템 운영팀 when ADMIN role is among multiple roles', () => {
    const user = makeUser({
      roles: [makeRole('VIEWER'), makeRole('ADMIN'), makeRole('EDITOR')],
    });
    expect(getUserTypeLabel(user)).toBe('시스템 운영팀');
  });

  it('returns 기술 지원팀 for ENGINEER without ADMIN role', () => {
    const user = makeUser({
      userType: 'ENGINEER',
      roles: [makeRole('SUPPORT')],
    });
    expect(getUserTypeLabel(user)).toBe('기술 지원팀');
  });

  it('ENGINEER takes precedence over having clients (when no admin)', () => {
    const user = makeUser({
      userType: 'ENGINEER',
      clients: [makeClient('C1')],
    });
    expect(getUserTypeLabel(user)).toBe('기술 지원팀');
  });

  it('returns 고객사 담당자 for CLIENT userType', () => {
    const user = makeUser({ userType: 'CLIENT', roles: [makeRole('USER')] });
    expect(getUserTypeLabel(user)).toBe('고객사 담당자');
  });

  it('returns 고객사 담당자 when user has clients even if not CLIENT type', () => {
    // userType is forced to a non-CLIENT, non-ENGINEER-handled path:
    // ENGINEER branch returns earlier, so use CLIENT-but-cover clients.length>0 OR branch.
    const user = makeUser({
      userType: 'CLIENT',
      clients: [makeClient('C1'), makeClient('C2')],
    });
    expect(getUserTypeLabel(user)).toBe('고객사 담당자');
  });

  it('returns 미분류 as the default fallback', () => {
    // No admin, not ENGINEER, not CLIENT, and no clients.
    // Cast to bypass the strict union for the fallback branch.
    const user = {
      id: 'user-x',
      userType: 'UNKNOWN',
      roles: [makeRole('GUEST')],
      clients: [],
    } as unknown as User;
    expect(getUserTypeLabel(user)).toBe('미분류');
  });

  it('handles empty roles array', () => {
    const user = makeUser({ userType: 'ENGINEER', roles: [] });
    expect(getUserTypeLabel(user)).toBe('기술 지원팀');
  });
});

describe('getUserTypeBadgeVariant', () => {
  it('maps 시스템 운영팀 to destructive', () => {
    expect(getUserTypeBadgeVariant('시스템 운영팀')).toBe('destructive');
  });

  it('maps 기술 지원팀 to default', () => {
    expect(getUserTypeBadgeVariant('기술 지원팀')).toBe('default');
  });

  it('maps 고객사 담당자 to outline', () => {
    expect(getUserTypeBadgeVariant('고객사 담당자')).toBe('outline');
  });

  it('maps unknown/미분류 to secondary (default case)', () => {
    expect(getUserTypeBadgeVariant('미분류')).toBe('secondary');
    expect(getUserTypeBadgeVariant('anything else')).toBe('secondary');
    expect(getUserTypeBadgeVariant('')).toBe('secondary');
  });

  it('integrates with getUserTypeLabel output', () => {
    const admin = makeUser({ roles: [makeRole('ADMIN')] });
    expect(getUserTypeBadgeVariant(getUserTypeLabel(admin))).toBe('destructive');
  });
});

describe('excludePassword', () => {
  it('removes the password field from an object', () => {
    const user = { id: '1', name: 'Alice', password: 'secret' };
    const result = excludePassword(user);
    expect(result).toEqual({ id: '1', name: 'Alice' });
    expect('password' in result).toBe(false);
  });

  it('preserves all other fields and their values', () => {
    const user = {
      id: '7',
      email: 'a@b.com',
      password: 'pw',
      nested: { foo: 'bar' },
      count: 42,
    };
    const result = excludePassword(user);
    expect(result).toEqual({
      id: '7',
      email: 'a@b.com',
      nested: { foo: 'bar' },
      count: 42,
    });
  });

  it('does not mutate the original object', () => {
    const user = { id: '1', password: 'secret' };
    excludePassword(user);
    expect(user.password).toBe('secret');
    expect('password' in user).toBe(true);
  });

  it('handles objects where password is the only field', () => {
    const user = { password: 'only' };
    const result = excludePassword(user);
    expect(result).toEqual({});
  });
});
