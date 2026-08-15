import { describe, expect, it } from 'vitest';

import {
  canAssignRolesToUser,
  canDeleteUser,
  canManageSensitiveUserFields,
  canUpdateUser,
  ensureClientAssignmentsWithinScope,
} from '@/lib/policies';
import type { AuthenticatedUser } from '@/types/session';

const actor = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'actor-1',
  email: 'actor@example.com',
  name: 'Actor',
  image: null,
  roles: ['MANAGER'],
  permissions: ['USER:UPDATE', 'USER:DELETE', 'ROLE:ASSIGN', 'SR:READ'],
  clientIds: [],
  ...overrides,
});

const target = (
  overrides: Partial<{
    id: string;
    clients: { clientId: string }[];
    roles: { role: { name: string } }[];
  }> = {}
) => ({
  id: 'target-1',
  clients: [],
  roles: [],
  ...overrides,
});

const role = (name: string, permissions: string[] = []) => ({
  name,
  permissions: permissions.map((permission) => {
    const [resource, action] = permission.split(':');
    return { permission: { resource: resource!, action: action! } };
  }),
});

describe('user-management authorization boundaries', () => {
  it('blocks a non-admin from updating, deleting, or resetting an ADMIN account', () => {
    const adminTarget = target({ roles: [{ role: { name: 'ADMIN' } }] });
    const manager = actor();

    expect(canUpdateUser(manager, adminTarget)).toBe(false);
    expect(canDeleteUser(manager, adminTarget)).toBe(false);
    expect(canManageSensitiveUserFields(manager, adminTarget)).toBe(false);
  });

  it('allows an ADMIN to manage another ADMIN account', () => {
    const adminTarget = target({ roles: [{ role: { name: 'ADMIN' } }] });
    const admin = actor({ roles: ['ADMIN'], permissions: [] });

    expect(canUpdateUser(admin, adminTarget)).toBe(true);
    expect(canManageSensitiveUserFields(admin, adminTarget)).toBe(true);
  });

  it('bounds delegated USER:DELETE to the actor tenant', () => {
    const clientAdmin = actor({ roles: ['CLIENT_ADMIN'], clientIds: ['client-a'] });

    expect(canDeleteUser(clientAdmin, target({ clients: [{ clientId: 'client-a' }] }))).toBe(true);
    expect(canDeleteUser(clientAdmin, target({ clients: [{ clientId: 'client-b' }] }))).toBe(false);
  });

  it('blocks non-admin self role assignment', () => {
    const manager = actor();

    expect(
      canAssignRolesToUser(manager, target({ id: manager.id }), [
        role('MANAGER', manager.permissions),
      ])
    ).toBe(false);
  });

  it('blocks assigning permissions the actor does not already hold', () => {
    const manager = actor();

    expect(
      canAssignRolesToUser(manager, target(), [
        role('POWER_USER', ['SR:READ', 'USER:DELETE', 'CLIENT:DELETE']),
      ])
    ).toBe(false);
  });

  it('allows a delegated assignment when role permissions are a subset', () => {
    const manager = actor();

    expect(
      canAssignRolesToUser(manager, target(), [role('SUPPORT', ['SR:READ', 'USER:UPDATE'])])
    ).toBe(true);
  });

  it('bounds external user creation client assignments to actor clients', () => {
    const clientAdmin = actor({ roles: ['CLIENT_ADMIN'], clientIds: ['client-a'] });

    expect(() => ensureClientAssignmentsWithinScope(clientAdmin, ['client-a'])).not.toThrow();
    expect(() => ensureClientAssignmentsWithinScope(clientAdmin, ['client-b'])).toThrow(
      '소속되지 않은 고객사'
    );
  });
});
