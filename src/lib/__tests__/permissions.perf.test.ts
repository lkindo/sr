import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasAllPermissions } from '@/lib/permissions';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  checkRole: vi.fn(),
  getUserPermissions: vi.fn(),
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: vi.fn().mockImplementation(function (this: any) {
    return mocks;
  }),
}));

describe('hasAllPermissions Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should measure execution time for hasAllPermissions with multiple permissions', async () => {
    // Simulate DB latency
    const DB_LATENCY = 10;

    mocks.checkPermission.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, DB_LATENCY));
      return true;
    });

    mocks.checkRole.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, DB_LATENCY));
      return false; // Assume not admin for this test case to trigger permissions check
    });

    mocks.getUserPermissions.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, DB_LATENCY * 1.5)); // Slightly longer query
      // Return enough permissions to cover the test case
      return Array.from({ length: 10 }, (_, i) => ({
        resource: 'RES',
        action: `ACT_${i}`,
        description: `Permission ${i}`
      }));
    });

    const permissionsToCheck = Array.from({ length: 5 }, (_, i) => ({
      resource: 'RES',
      action: `ACT_${i}`
    }));

    const start = performance.now();
    const result = await hasAllPermissions('user-perf', permissionsToCheck);
    const end = performance.now();
    const duration = end - start;

    expect(result).toBe(true);

    // Performance assertions
    expect(mocks.checkPermission).not.toHaveBeenCalled();
    expect(mocks.checkRole).toHaveBeenCalledTimes(1);
    expect(mocks.getUserPermissions).toHaveBeenCalledTimes(1);

    console.log(`\n---------------------------------------------------`);
    console.log(`Duration: ${duration.toFixed(2)}ms`);
    console.log(`checkPermission calls: ${mocks.checkPermission.mock.calls.length}`);
    console.log(`checkRole calls: ${mocks.checkRole.mock.calls.length}`);
    console.log(`getUserPermissions calls: ${mocks.getUserPermissions.mock.calls.length}`);
    console.log(`---------------------------------------------------\n`);
  });
});
