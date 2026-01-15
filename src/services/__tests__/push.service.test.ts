import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushService } from '@/services/push.service';
import prisma from '@/lib/prisma';

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
        }
    }
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
    });

    describe('isConfigured', () => {
        it('returns true when mocked', () => {
            expect(PushService.isConfigured()).toBe(true);
        });
    });

    describe('sendToUser', () => {
        it('sends notification and handles success', async () => {
            vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([{
                endpoint: 'ep1', p256dh: 'd', auth: 'a'
            }] as any);

            const { sendNotification } = await import('web-push');
            vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: 'ok' });

            const results = await pushService.sendToUser('u1', { title: 'T', body: 'B' });
            expect(results).toHaveLength(1);
            expect(results[0].statusCode).toBe(201);
        });

        it('removes invalid subscription on 410 error', async () => {
            vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([{
                endpoint: 'ep-invalid', p256dh: 'd', auth: 'a'
            }] as any);

            const { sendNotification } = await import('web-push');
            vi.mocked(sendNotification).mockRejectedValue({ statusCode: 410 });

            await pushService.sendToUser('u1', { title: 'T', body: 'B' });
            expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { endpoint: 'ep-invalid' }
            }));
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
                { userId: 'u1', pushSRCreated: false }
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
                { userId: 'u1', pushSRCreated: true, pushSRAssigned: true, pushSRStatusChanged: true, pushCommentAdded: true }
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
            expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId: 'u1' },
                create: expect.objectContaining({ userId: 'u1', pushSRCreated: false })
            }));
        });
    });
});
