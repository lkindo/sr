// Server-only module - not to be imported in client components
import 'server-only';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

// Define types inline to avoid import conflicts with browser PushSubscription
interface DBPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DBNotificationPreference {
  id: string;
  userId: string;
  emailSRCreated: boolean;
  emailSRAssigned: boolean;
  emailSRStatusChanged: boolean;
  emailCommentAdded: boolean;
  pushSRCreated: boolean;
  pushSRAssigned: boolean;
  pushSRStatusChanged: boolean;
  pushCommentAdded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// WebPush subscription interface (matches web-push library expectations)
interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// VAPID configuration
// Fallback 값 추가 - 환경 변수 인식 문제 우회
const VAPID_PUBLIC_KEY_FALLBACK =
  'BMy2SareYpfTG73Ts9NjlQVhbwStorMrw_v2XrZi1JYA_V6vrL4iuVBAoBV1FUOPFLfsa-qsQ5O5Zvggv9DlMc4';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY_FALLBACK;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:lkindo@gmail.com';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type NotificationEventType =
  | 'SR_CREATED'
  | 'SR_ASSIGNED'
  | 'SR_STATUS_CHANGED'
  | 'COMMENT_ADDED';

// Lazy load web-push to avoid bundling issues
let webPushModule: typeof import('web-push') | null = null;
async function getWebPush() {
  if (!webPushModule) {
    webPushModule = await import('web-push');
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webPushModule.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
  }
  return webPushModule;
}

export class PushService {
  /**
   * Check if VAPID is properly configured
   */
  static isConfigured(): boolean {
    return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  }

  /**
   * Get the public VAPID key for client-side subscription
   */
  static getPublicKey(): string {
    return VAPID_PUBLIC_KEY;
  }

  /**
   * Save a push subscription for a user
   */
  async saveSubscription(
    userId: string,
    subscription: PushSubscriptionData,
    userAgent?: string
  ): Promise<DBPushSubscription> {
    return prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Remove a push subscription by endpoint
   */
  async removeSubscription(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });
  }

  /**
   * Remove all push subscriptions for a user
   */
  async removeUserSubscriptions(userId: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<DBPushSubscription[]> {
    return prisma.pushSubscription.findMany({
      where: { userId },
    });
  }

  /**
   * Helper to send to a single subscription
   */
  private async sendToSubscription(
    webPush: any,
    sub: DBPushSubscription,
    payload: PushPayload
  ): Promise<{ statusCode: number; body: string } | null> {
    try {
      const webPushSub: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      const result = await webPush.sendNotification(webPushSub, JSON.stringify(payload));
      return result;
    } catch (error: unknown) {
      const webPushError = error as { statusCode?: number };
      logger.error(`[PushService] Failed to send to ${sub.endpoint}:`, error as Error);

      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
        await this.removeSubscription(sub.endpoint);
        logger.info(`[PushService] Removed invalid subscription: ${sub.endpoint}`);
      }
      return null;
    }
  }

  /**
   * Send push notification to a specific user
   */
  async sendToUser(
    userId: string,
    payload: PushPayload
  ): Promise<{ statusCode: number; body: string }[]> {
    if (!PushService.isConfigured()) {
      logger.warn('[PushService] VAPID not configured, skipping push notification');
      return [];
    }

    // 테스트 환경에서는 발송 건너뛰기
    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
      return [];
    }

    const webPush = await getWebPush();
    const subscriptions = await this.getUserSubscriptions(userId);
    const results: { statusCode: number; body: string }[] = [];

    for (const sub of subscriptions) {
      const result = await this.sendToSubscription(webPush, sub, payload);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(
    userIds: string[],
    payload: PushPayload
  ): Promise<Map<string, { statusCode: number; body: string }[]>> {
    const results = new Map<string, { statusCode: number; body: string }[]>();

    if (!PushService.isConfigured()) {
      logger.warn('[PushService] VAPID not configured, skipping push notification');
      return results;
    }

    // 테스트 환경에서는 발송 건너뛰기
    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true') {
      return results;
    }

    const webPush = await getWebPush();

    // Batch fetch subscriptions
    const allSubscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });

    // Group by userId
    const subsByUser = new Map<string, DBPushSubscription[]>();
    for (const sub of allSubscriptions) {
      const userSubs = subsByUser.get(sub.userId) ?? [];
      userSubs.push(sub);
      subsByUser.set(sub.userId, userSubs);
    }

    await Promise.all(
      userIds.map(async (userId) => {
        const subscriptions = subsByUser.get(userId) ?? [];
        const userResults: { statusCode: number; body: string }[] = [];

        const resultsArray = await Promise.all(
          subscriptions.map((sub) => this.sendToSubscription(webPush, sub, payload))
        );

        for (const result of resultsArray) {
          if (result) {
            userResults.push(result);
          }
        }
        results.set(userId, userResults);
      })
    );

    return results;
  }

  /**
   * Send push notification based on event type, respecting user preferences
   */
  async sendForEvent(
    eventType: NotificationEventType,
    targetUserIds: string[],
    payload: PushPayload
  ): Promise<void> {
    if (!PushService.isConfigured()) {
      return;
    }

    // Get notification preferences for target users
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: { in: targetUserIds } },
    });

    const prefMap = new Map<string, DBNotificationPreference>();
    for (const pref of preferences) {
      prefMap.set(pref.userId, pref);
    }

    // Filter users based on their preferences
    const eligibleUserIds = targetUserIds.filter((userId) => {
      const pref = prefMap.get(userId);

      // If no preference record, use defaults (defined in schema)
      if (!pref) {
        // Default values from schema
        switch (eventType) {
          case 'SR_CREATED':
          case 'SR_ASSIGNED':
            return true; // Default: true
          case 'SR_STATUS_CHANGED':
          case 'COMMENT_ADDED':
            return false; // Default: false
          default:
            return true;
        }
      }

      // Check user preference based on event type
      switch (eventType) {
        case 'SR_CREATED':
          return pref.pushSRCreated;
        case 'SR_ASSIGNED':
          return pref.pushSRAssigned;
        case 'SR_STATUS_CHANGED':
          return pref.pushSRStatusChanged;
        case 'COMMENT_ADDED':
          return pref.pushCommentAdded;
        default:
          return true;
      }
    });

    if (eligibleUserIds.length === 0) {
      logger.info('[PushService] No eligible users for event:', { eventType });
      return;
    }

    await this.sendToUsers(eligibleUserIds, payload);
  }

  /**
   * Get or create notification preferences for a user
   */
  async getOrCreatePreferences(userId: string): Promise<DBNotificationPreference> {
    let preferences = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return preferences;
  }

  /**
   * Update notification preferences for a user
   */
  async updatePreferences(
    userId: string,
    updates: Partial<Omit<DBNotificationPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<DBNotificationPreference> {
    return prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...updates,
      },
      update: updates,
    });
  }
}

// Export singleton instance
export const pushService = new PushService();
