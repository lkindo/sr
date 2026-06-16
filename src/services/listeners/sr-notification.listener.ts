import { getSRUrl } from '@/lib/app-url';
import { domainEvents } from '@/lib/domain-events';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { emailService } from '@/services/email.service';
import { pushService } from '@/services/push.service';

/**
 * SR 관련 도메인 이벤트 리스너를 등록합니다.
 * 이 모듈은 애플리케이션 초기화 시 한 번만 로드되어야 합니다.
 */
export function registerSRNotificationListeners() {
  logger.info('SR Notification Listeners registered');

  // 1. SR 생성 이벤트 리스너
  domainEvents.on('sr:created', async (payload) => {
    try {
      const admins = await prisma.user.findMany({
        where: {
          roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          notificationPreference: true,
        },
      });

      const promises: Promise<unknown>[] = [];

      // 푸시 알림
      const adminIds = admins.map((u) => u.id);
      if (adminIds.length > 0) {
        promises.push(
          pushService.sendToUsers(adminIds, {
            title: '새로운 SR 등록',
            body: `${payload.srNumber}: ${payload.title}`,
            url: `/srs/${payload.srId}`,
            tag: 'sr-created',
          })
        );
      }

      // 이메일 알림
      admins.forEach((admin) => {
        const shouldSend = admin.notificationPreference?.emailSRCreated ?? true;
        if (admin.email && shouldSend) {
          promises.push(
            emailService.sendSRCreated(
              admin.email,
              payload.srNumber,
              payload.title,
              payload.requesterName,
              getSRUrl(payload.srId)
            )
          );
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(
        'Failed to handle sr:created notification',
        error instanceof Error ? error : undefined,
        {
          srId: payload.srId,
        }
      );
    }
  });

  // 2. SR 상태 변경 이벤트 리스너
  domainEvents.on('sr:status_changed', async (payload) => {
    if (!payload.requesterId) return;

    try {
      const requester = await prisma.user.findUnique({
        where: { id: payload.requesterId },
        select: { email: true, notificationPreference: true },
      });

      if (!requester) return;

      const promises: Promise<unknown>[] = [];

      // 푸시 알림
      promises.push(
        pushService.sendToUser(payload.requesterId, {
          title: 'SR 상태 변경',
          body: `${payload.srNumber} 상태가 ${payload.currentStatus}로 변경되었습니다.`,
          url: `/srs/${payload.srId}`,
          tag: 'sr-status-changed',
        })
      );

      // 이메일 알림
      const shouldSendStatusEmail = requester.notificationPreference?.emailSRStatusChanged ?? false;
      if (requester.email && shouldSendStatusEmail) {
        promises.push(
          emailService.sendSRStatusChanged(
            requester.email,
            payload.srNumber,
            payload.title,
            payload.previousStatus || '없음',
            payload.currentStatus,
            getSRUrl(payload.srId)
          )
        );
      }

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(
        'Failed to handle sr:status_changed notification',
        error instanceof Error ? error : undefined,
        {
          srId: payload.srId,
        }
      );
    }
  });

  // 3. SR 담당자 할당 이벤트 리스너
  domainEvents.on('sr:assigned', async (payload) => {
    try {
      if (!payload.assigneeId) {
        logger.info('SR 담당 해제 감지 (알림 생략)', { srId: payload.srId });
        return;
      }

      const assignee = await prisma.user.findUnique({
        where: { id: payload.assigneeId },
        select: { email: true, notificationPreference: true },
      });

      if (!assignee) return;

      const promises: Promise<unknown>[] = [];

      // 푸시 알림
      promises.push(
        pushService.sendToUser(payload.assigneeId, {
          title: 'SR 담당 배정',
          body: `${payload.srNumber} 담당자로 배정되었습니다.`,
          url: `/srs/${payload.srId}`,
          tag: 'sr-assigned',
        })
      );

      // 이메일 알림
      const shouldSendAssignEmail = assignee.notificationPreference?.emailSRAssigned ?? true;
      if (assignee.email && shouldSendAssignEmail) {
        promises.push(
          emailService.sendSRAssigned(
            assignee.email,
            payload.srNumber,
            payload.title,
            payload.assigneeName ?? '알 수 없음',
            getSRUrl(payload.srId)
          )
        );
      }

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(
        'Failed to handle sr:assigned notification',
        error instanceof Error ? error : undefined,
        {
          srId: payload.srId,
        }
      );
    }
  });
}
