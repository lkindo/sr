import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PushService } from '@/services/push.service';

// Mock modules
const mockSendNotification = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    pushSubscription: {
      findMany: (...args: any[]) => mockFindMany(...args),
      deleteMany: vi.fn(),
    },
    notificationPreference: {
      findMany: vi.fn(),
    },
  },
}));

// We need to mock the web-push module completely
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: (...args: any[]) => mockSendNotification(...args),
}));

describe('PushService Concurrency Benchmark', () => {
  let pushService: PushService;

  beforeEach(() => {
    vi.clearAllMocks();
    pushService = new PushService();
    // Bypass checks
    vi.spyOn(PushService, 'isConfigured').mockReturnValue(true);
    // Force not-test environment to allow sending
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TEST_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('measures execution time for multiple subscriptions', async () => {
    const NUM_USERS = 10;
    const SUBS_PER_USER = 5;
    const LATENCY_MS = 50;

    const userIds = Array.from({ length: NUM_USERS }, (_, i) => `user-${i}`);

    // Mock subscriptions
    const allSubscriptions: any[] = [];
    userIds.forEach((userId) => {
      for (let i = 0; i < SUBS_PER_USER; i++) {
        allSubscriptions.push({
          userId,
          endpoint: `endpoint-${userId}-${i}`,
          p256dh: 'key',
          auth: 'auth',
          id: `id-${userId}-${i}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          userAgent: null,
        });
      }
    });

    mockFindMany.mockResolvedValue(allSubscriptions);

    // Mock sendNotification with delay
    mockSendNotification.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      return { statusCode: 201 };
    });

    const start = Date.now();
    await pushService.sendToUsers(userIds, { title: 'Test', body: 'Benchmark' });
    const end = Date.now();
    const duration = end - start;

    console.log(`\n\n---------------------------------------------------`);
    console.log(`Benchmark Results:`);
    console.log(`Users: ${NUM_USERS}`);
    console.log(`Subs per User: ${SUBS_PER_USER}`);
    console.log(`Latency per Req: ${LATENCY_MS}ms`);
    console.log(`Total Duration: ${duration}ms`);
    console.log(`Expected Sequential (worst case per user): ${SUBS_PER_USER * LATENCY_MS}ms`);
    console.log(`Expected Parallel: ~${LATENCY_MS}ms`);
    console.log(`---------------------------------------------------\n\n`);
  });
});
