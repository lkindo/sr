import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientService } from '@/services/client.service';
import { registerSRNotificationListeners } from '@/services/listeners/sr-notification.listener';
import { PermissionService } from '@/services/permission.service';
import { RoleService } from '@/services/role.service';
import { services } from '@/services/service-registry';
import { SRService } from '@/services/sr.service';
import { UserService } from '@/services/user.service';

// The constructor of ServiceRegistry registers domain-event listeners as a
// side effect. Mock that out so importing the registry does not wire real
// listeners / heavy dependencies into the test process.
vi.mock('@/services/listeners/sr-notification.listener', () => ({
  registerSRNotificationListeners: vi.fn(),
}));

describe('service-registry', () => {
  beforeEach(() => {
    // Reset cached singletons before each test so idempotency checks are clean.
    services.clear();
  });

  it('registers SR notification listeners exactly once on module load', () => {
    // The singleton `services` instance is created at import time, so its
    // constructor should have invoked the listener registration once.
    expect(registerSRNotificationListeners).toHaveBeenCalledTimes(1);
  });

  it('exposes a userService that is the correct type', () => {
    expect(services.userService).toBeInstanceOf(UserService);
  });

  it('exposes a clientService that is the correct type', () => {
    expect(services.clientService).toBeInstanceOf(ClientService);
  });

  it('exposes an srService that is the correct type', () => {
    expect(services.srService).toBeInstanceOf(SRService);
  });

  it('exposes a roleService that is the correct type', () => {
    expect(services.roleService).toBeInstanceOf(RoleService);
  });

  it('exposes a permissionService that is the correct type', () => {
    expect(services.permissionService).toBeInstanceOf(PermissionService);
  });

  it('returns the same singleton instance on repeated access (getOrCreate caching)', () => {
    const first = services.userService;
    const second = services.userService;
    expect(first).toBe(second);

    const srFirst = services.srService;
    const srSecond = services.srService;
    expect(srFirst).toBe(srSecond);
  });

  it('caches every accessor independently', () => {
    const user = services.userService;
    const client = services.clientService;
    const sr = services.srService;
    const role = services.roleService;
    const permission = services.permissionService;

    expect(services.userService).toBe(user);
    expect(services.clientService).toBe(client);
    expect(services.srService).toBe(sr);
    expect(services.roleService).toBe(role);
    expect(services.permissionService).toBe(permission);
  });

  it('clear() evicts cached instances so new ones are created afterwards', () => {
    const before = services.userService;
    services.clear();
    const after = services.userService;
    expect(after).not.toBe(before);
    expect(after).toBeInstanceOf(UserService);
  });

  it('setMockInstance() overrides the resolved instance for a given key', () => {
    const fakeUserService = { findById: vi.fn() } as unknown as UserService;
    services.setMockInstance('userService', fakeUserService);

    expect(services.userService).toBe(fakeUserService);
  });

  it('setMockInstance() override is dropped after clear()', () => {
    const fake = { marker: 'mock' } as unknown as ClientService;
    services.setMockInstance('clientService', fake);
    expect(services.clientService).toBe(fake);

    services.clear();
    const real = services.clientService;
    expect(real).not.toBe(fake);
    expect(real).toBeInstanceOf(ClientService);
  });
});
