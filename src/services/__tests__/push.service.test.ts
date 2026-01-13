import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    default: {
        pushSubscription: {
            findMany: vi.fn(),
            create: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        notificationPreference: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock server-only (no-op in tests)
vi.mock('server-only', () => ({}));

import prisma from '@/lib/prisma';

describe('PushService', () => {
    beforeEach(async () => {
        vi.clearAllMocks();

        // Set environment variables for testing
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key-that-is-long-enough';
        process.env.VAPID_PRIVATE_KEY = 'test-private-key-long-enough-for-validation';
        process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    });

    describe('isConfigured', () => {
        it('VAPID 설정이 있으면 true를 반환해야 함', async () => {
            vi.resetModules();
            const { PushService } = await import('../push.service');
            expect(PushService.isConfigured()).toBe(true);
        });
    });

    describe('getPublicKey', () => {
        it('공개 VAPID 키를 반환해야 함', async () => {
            vi.resetModules();
            const { PushService } = await import('../push.service');
            const key = PushService.getPublicKey();
            expect(typeof key).toBe('string');
            expect(key.length).toBeGreaterThan(0);
        });
    });

    describe('saveSubscription', () => {
        it('푸시 구독을 저장해야 함', async () => {
            const mockSubscription = {
                id: 'sub-1',
                userId: 'user-1',
                endpoint: 'https://push.example.com/endpoint',
                p256dh: 'test-p256dh',
                auth: 'test-auth',
            };

            vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue(mockSubscription as any);

            // Removing resetModules simplification
            const { pushService } = await import('../push.service');

            const result = await pushService.saveSubscription('user-1', {
                endpoint: 'https://push.example.com/endpoint',
                keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
            });

            expect(result).toEqual(mockSubscription);
            expect(prisma.pushSubscription.upsert).toHaveBeenCalled();
        });
    });

    describe('removeSubscription', () => {
        it('푸시 구독을 삭제해야 함', async () => {
            vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 });
            const { pushService } = await import('../push.service');

            await pushService.removeSubscription('https://push.example.com/endpoint');

            expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
                where: { endpoint: 'https://push.example.com/endpoint' },
            });
        });
    });

    // ... (intermediate tests are fine)

    describe('getOrCreatePreferences', () => {
        it('알림 설정을 가져오거나 생성해야 함', async () => {
            const mockPreference = {
                id: 'pref-1',
                userId: 'user-1',
                emailSRCreated: true,
                pushSRCreated: true,
            };
            // Mock findUnique to return null first to test creation logic if needed, 
            // or just existing preference. 
            // Service logic: findUnique, if null -> create.
            // Let's test "create if not exists" path
            vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.notificationPreference.create).mockResolvedValue(mockPreference as any);

            const { pushService } = await import('../push.service');
            const result = await pushService.getOrCreatePreferences('user-1');

            expect(result).toEqual(mockPreference);
            expect(prisma.notificationPreference.create).toHaveBeenCalled();
        });
    });

    describe('updatePreferences', () => {
        it('알림 설정을 업데이트해야 함', async () => {
            const mockUpdatedPreference = {
                id: 'pref-1',
                userId: 'user-1',
                emailSRCreated: false,
                pushSRCreated: true,
            };
            vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue(mockUpdatedPreference as any);

            const { pushService } = await import('../push.service');

            const result = await pushService.updatePreferences('user-1', {
                emailSRCreated: false,
            });

            expect(result).toEqual(mockUpdatedPreference);
        });
    });

    describe('sendToUser', () => {
        it('구독이 없으면 빈 배열을 반환해야 함', async () => {
            vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([]);

            vi.resetModules();
            const { pushService } = await import('../push.service');

            const result = await pushService.sendToUser('user-1', {
                title: 'Test',
                body: 'Test Message',
            });

            expect(result).toEqual([]);
        });
    });
});
