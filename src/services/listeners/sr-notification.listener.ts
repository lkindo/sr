import { domainEvents } from '@/lib/domain-events';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { backgroundTask } from '@/lib/wait-until';
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

      // 푸시 알림 — 사용자 설정을 존중한다(감사 4.3).
      // 예전에는 `sendToUsers` 를 직접 호출해 `pushSRCreated` 를 보지 않았다.
      // 설정 화면에서 토글을 끄고 저장 성공 토스트를 받아도 푸시는 계속 왔다.
      const adminIds = admins.map((u) => u.id);
      if (adminIds.length > 0) {
        promises.push(
          pushService.sendForEvent('SR_CREATED', adminIds, {
            title: '새로운 SR 등록',
            body: `${payload.srNumber}: ${payload.title}`,
            url: `/srs/${payload.srId}`,
            tag: 'sr-created',
          })
        );
      }

      // 이메일은 아웃박스에 적재한다(감사 4.2). 예전에는 여기서 SMTP 로 곧장 쐈고,
      // Promise.allSettled 가 rejection 을 삼켜 실패가 기록도 재시도도 없이 사라졌다.
      // 이메일은 SR 생성 트랜잭션 안에서 이미 아웃박스에 적재된다. 이 리스너는
      // 커밋 이후 실행해야 하는 푸시만 담당해 이메일 중복 적재를 막는다.
      backgroundTask(Promise.allSettled(promises), 'sr-notification-dispatch');
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
      const promises: Promise<unknown>[] = [];

      // 푸시 알림 — 사용자 설정을 존중한다(감사 4.3).
      // `pushSRStatusChanged` 는 스키마 기본값이 false 다. 예전 코드는 이 설정을
      // 아예 읽지 않아, 기본값이 꺼져 있는데도 전원에게 발송됐다.
      promises.push(
        pushService.sendForEvent('SR_STATUS_CHANGED', [payload.requesterId], {
          title: 'SR 상태 변경',
          body: `${payload.srNumber} 상태가 ${payload.currentStatus}로 변경되었습니다.`,
          url: `/srs/${payload.srId}`,
          tag: 'sr-status-changed',
        })
      );

      // 이메일은 상태 변경 트랜잭션 안에서 이미 아웃박스에 적재된다.
      backgroundTask(Promise.allSettled(promises), 'sr-notification-dispatch');
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

      const promises: Promise<unknown>[] = [];

      // 푸시 알림 — 사용자 설정을 존중한다(감사 4.3).
      promises.push(
        pushService.sendForEvent('SR_ASSIGNED', [payload.assigneeId], {
          title: 'SR 담당 배정',
          body: `${payload.srNumber} 담당자로 배정되었습니다.`,
          url: `/srs/${payload.srId}`,
          tag: 'sr-assigned',
        })
      );

      // 이메일은 담당자 배정 트랜잭션 안에서 이미 아웃박스에 적재된다.
      backgroundTask(Promise.allSettled(promises), 'sr-notification-dispatch');
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
