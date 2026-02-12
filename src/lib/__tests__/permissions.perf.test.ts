import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasAnyPermission } from '@/lib/permissions';
import prisma from '@/lib/prisma';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    userRole: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Permissions Performance Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures hasAnyPermission performance', async () => {
    const permissionsToCheck = Array.from({ length: 50 }, (_, i) => ({
      resource: `RES_${i}`,
      action: 'READ',
    }));

    // Simulate DB delay
    const DB_DELAY = 2; // 2ms per query

    // Mock count implementation with delay (simulating checkPermission)
    // We make it return 0 (false) so it keeps checking all permissions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.userRole.count as any).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, DB_DELAY));
      return 0;
    });

    // Mock findMany implementation with delay (simulating optimized check)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.userRole.findMany as any).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, DB_DELAY));
        return [];
    });

    const start = performance.now();
    await hasAnyPermission('user-1', permissionsToCheck);
    const end = performance.now();
    const duration = end - start;

    console.log(`[Benchmark] Duration for ${permissionsToCheck.length} permissions: ${duration.toFixed(2)}ms`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`[Benchmark] prisma.userRole.count called: ${(prisma.userRole.count as any).mock.calls.length} times`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`[Benchmark] prisma.userRole.findMany called: ${(prisma.userRole.findMany as any).mock.calls.length} times`);

    // Determine behavior based on call counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const countCalls = (prisma.userRole.count as any).mock.calls.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findManyCalls = (prisma.userRole.findMany as any).mock.calls.length;

    if (countCalls > 0) {
        // Current behavior: N+1
        expect(countCalls).toBe(permissionsToCheck.length);
        expect(findManyCalls).toBe(0);
        expect(duration).toBeGreaterThan(permissionsToCheck.length * DB_DELAY * 0.8);
    } else {
        // Optimized behavior
        expect(countCalls).toBe(0);
        expect(findManyCalls).toBe(1);
        expect(duration).toBeLessThan(permissionsToCheck.length * DB_DELAY); // significantly faster
    }
  });
});
