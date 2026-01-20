import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';

import { logger } from '../../lib/logger';
import prisma from '../../lib/prisma';
import { PushService, pushService } from '../push.service';

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
  default: mockDeep(),
}));

// Mock web-push
const mockWebPush = {
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
};
vi.mock('web-push', () => ({
  default: mockWebPush,
}));

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('PushService', () => {
  beforeEach(() => {
    mockReset(prisma);
    vi.clearAllMocks();
    // Default VAPID config
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  describe('saveSubscription', () => {
    it('should upsert subscription', async () => {
      const userId = 'user-1';
      const subData = {
        endpoint: 'https://push.example.com/test',
        keys: { p256dh: 'p256', auth: 'auth' },
      };

      await pushService.saveSubscription(userId, subData);

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('sendForEvent', () => {
    it('should send notification to eligible users based on preferences', async () => {
      const userIds = ['user-1', 'user-2'];
      const payload = { title: 'Test', body: 'Body' };

      // Mock preferences: user-1 disabled, user-2 enabled
      (prisma.notificationPreference.findMany as any).mockResolvedValue([
        { userId: 'user-1', pushSRCreated: false },
        { userId: 'user-2', pushSRCreated: true },
      ]);

      // Mock subscription for user-2
      (prisma.pushSubscription.findMany as any).mockResolvedValue([
        { endpoint: 'ep-2', p256dh: 'key', auth: 'auth' },
      ]);

      // Mock web-push send (success)
      mockWebPush.sendNotification.mockResolvedValue({ statusCode: 201 });

      // Force test environment check bypass for logic verification or spy internal method if possible
      // Since sendToUser checks NODE_ENV===test, we need to bypass it or mock sendToUser
      const sendToUserSpy = vi.spyOn(pushService, 'sendToUser');
      sendToUserSpy.mockImplementation(async (uid, _) => {
        if (uid === 'user-2') return [{ statusCode: 201, body: 'OK' }];
        return [];
      });

      await pushService.sendForEvent('SR_CREATED', userIds, payload);

      expect(sendToUserSpy).toHaveBeenCalledWith('user-2', payload);
      expect(sendToUserSpy).not.toHaveBeenCalledWith('user-1', payload);
    });

    it('should use default preferences if none exist', async () => {
      const userIds = ['user-3'];
      const payload = { title: 'Test', body: 'Body' };

      // No preferences found
      (prisma.notificationPreference.findMany as any).mockResolvedValue([]);

      const sendToUserSpy = vi.spyOn(pushService, 'sendToUser').mockResolvedValue([]);

      // SR_CREATED default is true
      await pushService.sendForEvent('SR_CREATED', userIds, payload);
      expect(sendToUserSpy).toHaveBeenCalledWith('user-3', payload);

      // SR_STATUS_CHANGED default is false
      sendToUserSpy.mockClear();
      await pushService.sendForEvent('SR_STATUS_CHANGED', userIds, payload);
      expect(sendToUserSpy).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it.skip('should remove invalid subscriptions (410)', async () => {
      // We need to test the internal logic of sendToUser.
      // Temporarily override NODE_ENV to non-test to invoke actual logic logic
      vi.spyOn(PushService, 'isConfigured').mockReturnValue(true);
      vi.stubEnv('NODE_ENV', 'development');

      const userId = 'user-err';
      const payload = { title: 'T', body: 'B' };

      (prisma.pushSubscription.findMany as any).mockResolvedValue([
        { endpoint: 'ep-gone', p256dh: 'k', auth: 'a' },
      ]);

      mockWebPush.sendNotification.mockRejectedValue({ statusCode: 410 });

      await pushService.sendToUser(userId, payload);

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removed invalid subscription')
      );

      vi.unstubAllEnvs();
    });
  });
});
