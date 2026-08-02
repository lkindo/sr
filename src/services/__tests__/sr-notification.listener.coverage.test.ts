import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { domainEvents } from '@/lib/domain-events';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { emailService } from '@/services/email.service';
import { registerSRNotificationListeners } from '@/services/listeners/sr-notification.listener';
import { enqueueEmails } from '@/services/notification-outbox';
import { pushService } from '@/services/push.service';

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// buildX 는 이제 렌더만 하고, 실제 발송은 아웃박스 디스패처가 맡는다(감사 4.2).
vi.mock('@/services/email.service', () => ({
  emailService: {
    buildSRCreated: vi.fn((to: string) => ({ to, subject: 's', html: 'h' })),
    buildSRStatusChanged: vi.fn((to: string) => ({ to, subject: 's', html: 'h' })),
    buildSRAssigned: vi.fn((to: string) => ({ to, subject: 's', html: 'h' })),
  },
}));

vi.mock('@/services/notification-outbox', () => ({
  enqueueEmails: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/services/push.service', () => ({
  pushService: {
    sendToUser: vi.fn().mockResolvedValue(undefined),
    sendToUsers: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  user: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

/**
 * Emit a domain event and let all microtasks (the async handlers and their
 * Promise.allSettled calls) flush before assertions run.
 */
async function emitAndFlush(event: string, payload: unknown) {
  (domainEvents as { emit: (e: string, p: unknown) => boolean }).emit(event, payload);
  // Flush the queued microtasks created by the async handlers.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('registerSRNotificationListeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Remove any listeners registered by previous tests to avoid duplicate firing.
    domainEvents.removeAllListeners();
    registerSRNotificationListeners();
  });

  afterEach(() => {
    domainEvents.removeAllListeners();
  });

  it('logs an info message and registers the three SR listeners', () => {
    expect(logger.info).toHaveBeenCalledWith('SR Notification Listeners registered');
    expect(domainEvents.listenerCount('sr:created')).toBe(1);
    expect(domainEvents.listenerCount('sr:status_changed')).toBe(1);
    expect(domainEvents.listenerCount('sr:assigned')).toBe(1);
  });

  describe('sr:created', () => {
    const payload = {
      srId: 'sr-1',
      srNumber: 'SR-001',
      title: '테스트 제목',
      requesterId: 'req-1',
      requesterName: '요청자',
    };

    it('sends push to admins and email to those who opt in', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          email: 'admin1@example.com',
          notificationPreference: { emailSRCreated: true },
        },
        {
          id: 'admin-2',
          email: 'admin2@example.com',
          notificationPreference: { emailSRCreated: false },
        },
      ]);

      await emitAndFlush('sr:created', payload);

      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['admin-1', 'admin-2'],
        expect.objectContaining({ tag: 'sr-created', url: '/srs/sr-1' })
      );
      // Only admin-1 opted in.
      expect(emailService.buildSRCreated).toHaveBeenCalledTimes(1);
      expect(emailService.buildSRCreated).toHaveBeenCalledWith(
        'admin1@example.com',
        'SR-001',
        '테스트 제목',
        '요청자',
        expect.stringContaining('/srs/sr-1')
      );

      // 렌더만으로는 부족하다. 실제로 아웃박스 행이 적재돼야 재시작·SMTP 장애에서
      // 살아남는다 — 예전에는 여기서 곧장 SMTP 로 쏘고 실패를 삼켰다.
      expect(enqueueEmails).toHaveBeenCalledWith([
        expect.objectContaining({
          to: 'admin1@example.com',
          metadata: expect.objectContaining({ srId: 'sr-1', kind: 'sr-created' }),
        }),
      ]);
    });

    it('defaults emailSRCreated to true when preference is missing', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: 'admin1@example.com', notificationPreference: null },
      ]);

      await emitAndFlush('sr:created', payload);

      expect(emailService.buildSRCreated).toHaveBeenCalledTimes(1);
    });

    it('skips email when admin has no email address', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: null, notificationPreference: { emailSRCreated: true } },
      ]);

      await emitAndFlush('sr:created', payload);

      expect(pushService.sendToUsers).toHaveBeenCalledTimes(1);
      expect(emailService.buildSRCreated).not.toHaveBeenCalled();
    });

    it('does not send push when there are no admins', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await emitAndFlush('sr:created', payload);

      expect(pushService.sendToUsers).not.toHaveBeenCalled();
      expect(emailService.buildSRCreated).not.toHaveBeenCalled();
    });

    it('logs an error when prisma throws', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('db down'));

      await emitAndFlush('sr:created', payload);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle sr:created notification',
        expect.any(Error),
        { srId: 'sr-1' }
      );
    });
  });

  describe('sr:status_changed', () => {
    const payload = {
      srId: 'sr-2',
      srNumber: 'SR-002',
      title: '상태 제목',
      requesterId: 'req-2',
      previousStatus: 'OPEN',
      currentStatus: 'IN_PROGRESS',
    };

    it('returns early without querying when requesterId is missing', async () => {
      await emitAndFlush('sr:status_changed', { ...payload, requesterId: undefined });

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('returns early when the requester does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await emitAndFlush('sr:status_changed', payload);

      expect(pushService.sendToUser).not.toHaveBeenCalled();
      expect(emailService.buildSRStatusChanged).not.toHaveBeenCalled();
    });

    it('sends push and email when requester opts in', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'req@example.com',
        notificationPreference: { emailSRStatusChanged: true },
      });

      await emitAndFlush('sr:status_changed', payload);

      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'req-2',
        expect.objectContaining({ tag: 'sr-status-changed' })
      );
      expect(emailService.buildSRStatusChanged).toHaveBeenCalledWith(
        'req@example.com',
        'SR-002',
        '상태 제목',
        'OPEN',
        'IN_PROGRESS',
        expect.stringContaining('/srs/sr-2')
      );
    });

    it('uses "없음" when previousStatus is falsy', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'req@example.com',
        notificationPreference: { emailSRStatusChanged: true },
      });

      await emitAndFlush('sr:status_changed', { ...payload, previousStatus: null });

      expect(emailService.buildSRStatusChanged).toHaveBeenCalledWith(
        'req@example.com',
        'SR-002',
        '상태 제목',
        '없음',
        'IN_PROGRESS',
        expect.any(String)
      );
    });

    it('defaults status email to false (no email) when preference missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'req@example.com',
        notificationPreference: null,
      });

      await emitAndFlush('sr:status_changed', payload);

      expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
      expect(emailService.buildSRStatusChanged).not.toHaveBeenCalled();
    });

    it('logs an error when prisma throws', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('boom'));

      await emitAndFlush('sr:status_changed', payload);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle sr:status_changed notification',
        expect.any(Error),
        { srId: 'sr-2' }
      );
    });
  });

  describe('sr:assigned', () => {
    const payload = {
      srId: 'sr-3',
      srNumber: 'SR-003',
      title: '할당 제목',
      assigneeId: 'assignee-1',
      assigneeName: '담당자',
    };

    it('logs and skips notification when assigneeId is null (unassigned)', async () => {
      await emitAndFlush('sr:assigned', { ...payload, assigneeId: null });

      expect(logger.info).toHaveBeenCalledWith('SR 담당 해제 감지 (알림 생략)', { srId: 'sr-3' });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('returns early when the assignee does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await emitAndFlush('sr:assigned', payload);

      expect(pushService.sendToUser).not.toHaveBeenCalled();
      expect(emailService.buildSRAssigned).not.toHaveBeenCalled();
    });

    it('sends push and email when assignee opts in', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'assignee@example.com',
        notificationPreference: { emailSRAssigned: true },
      });

      await emitAndFlush('sr:assigned', payload);

      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'assignee-1',
        expect.objectContaining({ tag: 'sr-assigned' })
      );
      expect(emailService.buildSRAssigned).toHaveBeenCalledWith(
        'assignee@example.com',
        'SR-003',
        '할당 제목',
        '담당자',
        expect.stringContaining('/srs/sr-3')
      );
    });

    it('defaults assignee email to true when preference missing and uses fallback name', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'assignee@example.com',
        notificationPreference: null,
      });

      await emitAndFlush('sr:assigned', { ...payload, assigneeName: null });

      expect(emailService.buildSRAssigned).toHaveBeenCalledWith(
        'assignee@example.com',
        'SR-003',
        '할당 제목',
        '알 수 없음',
        expect.any(String)
      );
    });

    it('skips email when assignee has no email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: null,
        notificationPreference: { emailSRAssigned: true },
      });

      await emitAndFlush('sr:assigned', payload);

      expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
      expect(emailService.buildSRAssigned).not.toHaveBeenCalled();
    });

    it('logs an error when prisma throws', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('explode'));

      await emitAndFlush('sr:assigned', payload);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle sr:assigned notification',
        expect.any(Error),
        { srId: 'sr-3' }
      );
    });
  });
});
