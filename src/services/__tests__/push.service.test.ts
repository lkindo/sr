import { createECDH } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { PushService } from '@/services/push.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    notificationPreference: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('PushService', () => {
  let pushService: PushService;

  beforeEach(() => {
    vi.clearAllMocks();
    pushService = new PushService();
    // Spy on static method to bypass env var check during tests
    vi.spyOn(PushService, 'isConfigured').mockReturnValue(true);

    // Test environment bypass disable
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isConfigured', () => {
    // push.service는 import 시점에 VAPID 환경 변수를 모듈 상수로 캡처한다.
    // 따라서 값을 바꾼 뒤 vi.resetModules() + 동적 import로 새 모듈 인스턴스를 얻어야
    // 실제 판정 로직을 검증할 수 있다. (email.service.test.ts와 동일한 패턴)
    // isConfigured는 비밀키에서 공개점을 유도해 짝이 맞는지까지 확인하므로,
    // 길이만 맞춘 합성 문자열로는 통과할 수 없다. 실제 P-256 키쌍을 생성해 쓴다.
    function generateVapidKeyPair() {
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      return {
        publicKey: ecdh.getPublicKey().toString('base64url'), // 87자
        privateKey: ecdh.getPrivateKey().toString('base64url'), // 43자
      };
    }

    const REAL_PAIR = generateVapidKeyPair();
    const OTHER_PAIR = generateVapidKeyPair();
    const VALID_PUBLIC_KEY = REAL_PAIR.publicKey;
    const VALID_PRIVATE_KEY = REAL_PAIR.privateKey;
    const originalPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

    async function loadPushService(publicKey?: string, privateKey?: string) {
      if (publicKey === undefined) {
        delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      } else {
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicKey;
      }
      if (privateKey === undefined) {
        delete process.env.VAPID_PRIVATE_KEY;
      } else {
        process.env.VAPID_PRIVATE_KEY = privateKey;
      }

      vi.resetModules();
      const freshModule = await import('@/services/push.service');
      return freshModule.PushService;
    }

    afterEach(() => {
      if (originalPublicKey === undefined) {
        delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      } else {
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalPublicKey;
      }
      if (originalPrivateKey === undefined) {
        delete process.env.VAPID_PRIVATE_KEY;
      } else {
        process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
      }
    });

    it('환경 변수가 없으면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService(undefined, undefined);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('비밀키만 없으면 false를 반환한다 (서명 불가)', async () => {
      const FreshPushService = await loadPushService(VALID_PUBLIC_KEY, undefined);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('플레이스홀더 값이면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService(
        'your_vapid_public_key_here',
        'your_vapid_private_key_here'
      );
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('길이가 맞지 않는 공개키면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService('BShortPublicKey', VALID_PRIVATE_KEY);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('길이가 맞지 않는 비밀키면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService(VALID_PUBLIC_KEY, 'short-private-key');
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('base64url이 아닌 문자가 섞이면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService(`B!${'a'.repeat(85)}`, VALID_PRIVATE_KEY);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('유효한 키 쌍이면 true를 반환한다', async () => {
      const FreshPushService = await loadPushService(VALID_PUBLIC_KEY, VALID_PRIVATE_KEY);
      expect(FreshPushService.isConfigured()).toBe(true);
    });

    it('형식은 맞지만 짝이 아닌 키 조합이면 false를 반환한다', async () => {
      // 환경별 키를 섞거나 한쪽만 로테이션했을 때의 실제 사고 형태.
      // 길이/문자셋은 모두 통과하므로 키쌍 검증이 없으면 걸러지지 않는다.
      const FreshPushService = await loadPushService(OTHER_PAIR.publicKey, VALID_PRIVATE_KEY);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('base64url 형식이지만 곡선 위의 점이 아니면 false를 반환한다', async () => {
      const FreshPushService = await loadPushService(`B${'a'.repeat(86)}`, `k${'b'.repeat(42)}`);
      expect(FreshPushService.isConfigured()).toBe(false);
    });

    it('설정이 온전할 때만 공개키를 노출한다', async () => {
      const configured = await loadPushService(VALID_PUBLIC_KEY, VALID_PRIVATE_KEY);
      expect(configured.getPublicKey()).toBe(VALID_PUBLIC_KEY);

      const unconfigured = await loadPushService(VALID_PUBLIC_KEY, undefined);
      expect(unconfigured.getPublicKey()).toBe('');
    });
  });

  describe('sendToUser', () => {
    it('sends notification and handles success', async () => {
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
        {
          endpoint: 'ep1',
          p256dh: 'd',
          auth: 'a',
        },
      ] as any);

      const { sendNotification } = await import('web-push');
      vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: 'ok', headers: {} });

      const results = await pushService.sendToUser('u1', { title: 'T', body: 'B' });
      expect(results).toHaveLength(1);
      expect(results[0].statusCode).toBe(201);
    });

    it('removes invalid subscription on 410 error', async () => {
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
        {
          endpoint: 'ep-invalid',
          p256dh: 'd',
          auth: 'a',
        },
      ] as any);

      const { sendNotification } = await import('web-push');
      vi.mocked(sendNotification).mockRejectedValue({ statusCode: 410 });

      await pushService.sendToUser('u1', { title: 'T', body: 'B' });
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endpoint: 'ep-invalid' },
        })
      );
    });
  });

  describe('sendForEvent', () => {
    it('filters users based on default preferences when no record exists', async () => {
      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
      const spySendToUsers = vi.spyOn(pushService, 'sendToUsers').mockResolvedValue(new Map());

      // SR_CREATED default is true
      await pushService.sendForEvent('SR_CREATED', ['u1', 'u2'], { title: 'T', body: 'B' });
      expect(spySendToUsers).toHaveBeenCalledWith(['u1', 'u2'], expect.anything());
    });

    it('filters users based on explicit false preference', async () => {
      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
        { userId: 'u1', pushSRCreated: false },
      ] as any);
      const spySendToUsers = vi.spyOn(pushService, 'sendToUsers').mockResolvedValue(new Map());

      await pushService.sendForEvent('SR_CREATED', ['u1'], { title: 'T', body: 'B' });
      expect(spySendToUsers).not.toHaveBeenCalled();
    });

    it('handles default preferences for STATUS_CHANGED (should be false)', async () => {
      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
      const spySendToUsers = vi.spyOn(pushService, 'sendToUsers').mockResolvedValue(new Map());

      await pushService.sendForEvent('SR_STATUS_CHANGED', ['u1'], { title: 'T', body: 'B' });
      expect(spySendToUsers).not.toHaveBeenCalled();
    });

    it('handles all event types in preference check', async () => {
      const spySendToUsers = vi.spyOn(pushService, 'sendToUsers').mockResolvedValue(new Map());
      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
        {
          userId: 'u1',
          pushSRCreated: true,
          pushSRAssigned: true,
          pushSRStatusChanged: true,
          pushCommentAdded: true,
        },
      ] as any);

      await pushService.sendForEvent('SR_ASSIGNED', ['u1'], { title: 'T', body: 'B' });
      await pushService.sendForEvent('SR_STATUS_CHANGED', ['u1'], { title: 'T', body: 'B' });
      await pushService.sendForEvent('COMMENT_ADDED', ['u1'], { title: 'T', body: 'B' });

      expect(spySendToUsers).toHaveBeenCalledTimes(3);
    });
  });

  describe('updatePreferences', () => {
    it('calls upsert with correct parameters', async () => {
      await pushService.updatePreferences('u1', { pushSRCreated: false });
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          create: expect.objectContaining({ userId: 'u1', pushSRCreated: false }),
        })
      );
    });
  });
});
