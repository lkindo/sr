// Server-only module - not to be imported in client components
import 'server-only';

import { createECDH } from 'node:crypto';

import { isPlaceholderValue } from '@/lib/env-validation';
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
// 환경 변수가 없으면 "푸시 미설정"으로 취급한다.
// 예전에는 하드코딩된 공개키로 폴백했지만, 그 공개키에 대응하는 비밀키가 어디에도 없어
// 브라우저 구독은 성공하고 서버 발송은 전부 조용히 실패하는 함정이었다.

// docker env_file 등을 거치며 따옴표/공백이 섞여 들어오는 경우가 있어 한 번 정규화한다.
// (검증한 값과 실제 사용 값이 달라지면 안 되므로 정규화된 값을 그대로 사용한다)
function normalizeKey(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

const VAPID_PUBLIC_KEY = normalizeKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = normalizeKey(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:lkindo@gmail.com';

// VAPID 키는 base64url 문자로만 구성된다.
// P-256 공개키(65바이트) = 87자, 비밀키(32바이트) = 43자. padding('=')은 아래에서 제거 후 비교한다.
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const VAPID_PUBLIC_KEY_LENGTH = 87;
const VAPID_PRIVATE_KEY_LENGTH = 43;

/**
 * 값이 "실제로 쓸 수 있는" VAPID 키인지 확인한다.
 * 비어 있거나, 플레이스홀더이거나, 형식/길이가 맞지 않으면 사용 불가로 본다.
 */
function isUsableVapidKey(value: string, expectedLength: number): boolean {
  if (!value || isPlaceholderValue(value)) {
    return false;
  }
  const normalized = value.replace(/=+$/, '');
  return normalized.length === expectedLength && BASE64URL_PATTERN.test(normalized);
}

/**
 * 비밀키에서 P-256 공개점을 유도해 설정된 공개키와 일치하는지 확인한다.
 *
 * 길이/문자셋 검사만으로는 "형식은 멀쩡한데 짝이 안 맞는" 조합을 걸러내지 못한다.
 * 한쪽만 로테이션하거나 환경 간 키를 섞으면 구독은 성공하고 발송만 403으로 전부
 * 실패하는데, 이는 하드코딩 폴백이 만들던 것과 정확히 같은 실패 형태다.
 * base64url이지만 곡선 위의 점이 아닌 값도 여기서 함께 걸러진다.
 *
 * 결과는 모듈 수명 동안 캐시한다(키는 프로세스 중에 바뀌지 않는다).
 */
let keyPairMatches: boolean | null = null;
function vapidKeyPairMatches(): boolean {
  if (keyPairMatches !== null) {
    return keyPairMatches;
  }

  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY, 'base64url'));
    keyPairMatches = ecdh.getPublicKey().toString('base64url') === VAPID_PUBLIC_KEY;
  } catch {
    // 비밀키가 곡선에 올릴 수 없는 값이면 setPrivateKey가 throw한다 = 사용 불가.
    keyPairMatches = false;
  }

  if (!keyPairMatches) {
    logger.error(
      'VAPID 공개키와 비밀키가 서로 짝이 맞지 않습니다. 푸시 알림을 비활성화합니다. ' +
        '두 키를 같은 키쌍으로 다시 설정하세요(환경별로 별도 발급).'
    );
  }

  return keyPairMatches;
}

/**
 * 공개키/비밀키가 모두 실제로 사용 가능한지 확인한다.
 * "값이 있다"가 아니라 "서명이 가능하다"를 기준으로 판단한다.
 */
function hasUsableVapidKeys(): boolean {
  return (
    isUsableVapidKey(VAPID_PUBLIC_KEY, VAPID_PUBLIC_KEY_LENGTH) &&
    isUsableVapidKey(VAPID_PRIVATE_KEY, VAPID_PRIVATE_KEY_LENGTH) &&
    vapidKeyPairMatches()
  );
}

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
    // 사용 불가능한 자격 증명으로 web-push를 초기화하지 않는다.
    if (hasUsableVapidKeys()) {
      webPushModule.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
  }
  return webPushModule;
}

export class PushService {
  /**
   * Check if VAPID is properly configured
   *
   * 값의 존재 여부가 아니라 실제로 발송 가능한 형태인지를 확인한다.
   * (플레이스홀더/잘못된 길이는 설정되지 않은 것으로 취급)
   */
  static isConfigured(): boolean {
    return hasUsableVapidKeys();
  }

  /**
   * Get the public VAPID key for client-side subscription
   *
   * 서버가 서명할 수 없는 키는 절대 브라우저에 넘기지 않는다.
   * 설정이 온전하지 않으면 빈 문자열을 반환한다.
   */
  static getPublicKey(): string {
    return hasUsableVapidKeys() ? VAPID_PUBLIC_KEY : '';
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
  async removeSubscription(endpoint: string, userId?: string): Promise<void> {
    // userId가 주어지면 호출자 소유 구독만 삭제한다(IDOR 방지).
    // userId 미지정은 내부 정리 용도(전송 실패로 확인된 죽은 구독 제거)로만 사용한다.
    await prisma.pushSubscription.deleteMany({
      where: userId ? { endpoint, userId } : { endpoint },
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

    const resultsArray = await Promise.all(
      subscriptions.map((sub) => this.sendToSubscription(webPush, sub, payload))
    );

    for (const result of resultsArray) {
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
