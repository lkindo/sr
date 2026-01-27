import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { PushService } from '@/services/push.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    pushSubscription: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('PushService Performance', () => {
  let pushService: PushService;

  beforeEach(() => {
    vi.clearAllMocks();
    pushService = new PushService();
    vi.spyOn(PushService, 'isConfigured').mockReturnValue(true);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_MODE', 'false');
  });

  it('sendToUsers performs 1 query (Optimized)', async () => {
    const userIds = ['user1', 'user2', 'user3'];

    // Mock response for findMany to simulate subscriptions for each user
    vi.mocked(prisma.pushSubscription.findMany).mockImplementation(async (args: any) => {
      // Optimized batch query
      if (args?.where?.userId?.in) {
        const ids = args.where.userId.in as string[];
        return ids.map((id) => ({
          endpoint: `endpoint-${id}`,
          p256dh: '65-byte-key-placeholder-which-is-long-enough-for-mocking-purposes-here',
          auth: 'auth',
          userId: id,
        })) as any;
      }
      // Single query fallback
      if (typeof args?.where?.userId === 'string') {
        return [
          {
            endpoint: `endpoint-${args.where.userId}`,
            p256dh: '65-byte-key-placeholder-which-is-long-enough-for-mocking-purposes-here',
            auth: 'auth',
            userId: args.where.userId,
          },
        ] as any;
      }
      return [];
    });

    const { sendNotification } = await import('web-push');
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: 'ok', headers: {} });

    await pushService.sendToUsers(userIds, { title: 'Test', body: 'Body' });

    // EXPECTATION: In the optimized code, findMany should be called 1 time
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledTimes(1);

    // Also verify the call arguments
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: userIds } },
      })
    );
  });
});
