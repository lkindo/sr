import type { Prisma, PrismaClient } from '@prisma/client';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

/**
 * 알림 아웃박스.
 *
 * 예전에는 알림을 `backgroundTask(Promise.allSettled(...))` 로 곧장 SMTP 에 쐈다(감사 4.2).
 * 그 방식의 문제는 셋이다.
 *
 * 1. **실패가 보이지 않는다.** `sendMail` 이 오류를 삼키고 `Promise.allSettled` 가 rejection 을
 *    다시 삼켜, 결과가 항상 fulfilled 였다. 운영자가 "담당자에게 알림이 갔나"에 답할 수 없었다.
 * 2. **재시도가 없다.** SMTP 가 30초 끊긴 사이의 알림은 영구히 사라진다.
 * 3. **재시작이 알림을 먹는다.** 발송은 커밋 이후 fire-and-forget 이라, 그 사이에 컨테이너가
 *    죽으면(배포·재시작·OOM) 기록 없이 증발한다. `restart: always` 라 실제로 열려 있는 창이다.
 *
 * 아웃박스는 "보내야 한다"는 사실을 **행으로** 남긴다. 적재는 도메인 변경과 같은 트랜잭션에
 * 넣을 수 있고(`tx` 인자), 디스패처가 그 행을 집어 보낸 뒤 결과를 같은 행에 쓴다.
 * 실패는 `failReason` 과 `attempts` 로 남고 백오프 후 재시도되며, 상한을 넘으면 FAILED 로
 * 고정되어 dead-letter 가 된다.
 *
 * `Notification` 모델 자체는 이미 status/sentAt/failReason 으로 아웃박스로 설계돼 있었는데
 * `prisma.notification.` 을 쓰는 코드가 저장소에 0건이었다 — 설계는 옳았고 구현만 없었다.
 */

/** 재시도 상한. 넘으면 FAILED 로 고정하고 더 시도하지 않는다. */
export const MAX_ATTEMPTS = 5;

/** 시도별 대기 시간(분). 마지막 값을 넘어가는 시도는 없다(MAX_ATTEMPTS 와 길이를 맞춘다). */
const BACKOFF_MINUTES = [1, 5, 15, 60];

/** 한 번에 집는 행 수. 너무 크면 한 배치가 오래 잡히고, 작으면 처리량이 떨어진다. */
const DEFAULT_BATCH_SIZE = 20;

export interface OutboxEmail {
  to: string;
  subject: string;
  html: string;
  /** 나중에 "이 SR 알림이 갔나"를 조회할 수 있도록 남긴다. */
  metadata?: Prisma.InputJsonValue;
}

/** 트랜잭션 클라이언트도 받을 수 있도록 최소 형태만 요구한다. */
type PrismaLike = Pick<PrismaClient, 'notification'>;

/**
 * 이메일 발송을 아웃박스에 적재한다.
 *
 * 도메인 변경과 원자적으로 묶고 싶으면 `$transaction` 콜백의 `tx` 를 넘긴다.
 * 그러면 "SR 은 저장됐는데 알림 기록은 없다"가 원천적으로 불가능해진다.
 */
export async function enqueueEmails(
  emails: OutboxEmail[],
  client: PrismaLike = prisma
): Promise<number> {
  if (emails.length === 0) return 0;

  const { count } = await client.notification.createMany({
    data: emails.map((email) => ({
      type: 'EMAIL' as const,
      status: 'PENDING' as const,
      recipient: email.to,
      subject: email.subject,
      content: email.html,
      metadata: email.metadata,
      // 즉시 대상. 디스패처가 다음 순회에서 집는다.
      nextAttemptAt: new Date(),
    })),
  });

  return count;
}

/** 단건 편의 래퍼. */
export function enqueueEmail(email: OutboxEmail, client: PrismaLike = prisma): Promise<number> {
  return enqueueEmails([email], client);
}

interface ClaimedRow {
  id: string;
  recipient: string;
  subject: string | null;
  content: string;
  attempts: number;
}

/**
 * PENDING 행을 집어 발송한다.
 *
 * `FOR UPDATE SKIP LOCKED` 로 집으므로 디스패처가 여러 개 돌아도 같은 행을 두 번 보내지
 * 않는다. 지금은 앱 컨테이너가 하나뿐이라 경합이 없지만, 인스턴스를 늘렸을 때 중복 발송이
 * 나지 않도록 처음부터 이 방식으로 둔다.
 *
 * @returns 처리한 행 수(성공·실패 합계)
 */
export async function dispatchPendingNotifications(
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<{ sent: number; failed: number; deadLettered: number }> {
  const claimed = await prisma.$queryRaw<ClaimedRow[]>`
    SELECT "id", "recipient", "subject", "content", "attempts"
    FROM "notifications"
    WHERE "status" = 'PENDING'
      AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= NOW())
      AND "type" = 'EMAIL'
    ORDER BY "created_at" ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;

  if (claimed.length === 0) {
    return { sent: 0, failed: 0, deadLettered: 0 };
  }

  const { emailService } = await import('@/services/email.service');

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const row of claimed) {
    const attempts = row.attempts + 1;

    try {
      await emailService.sendMail({
        to: row.recipient,
        subject: row.subject ?? '(제목 없음)',
        html: row.content,
      });

      await prisma.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), attempts, failReason: null },
      });
      sent++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const exhausted = attempts >= MAX_ATTEMPTS;

      await prisma.notification.update({
        where: { id: row.id },
        data: {
          // 상한을 넘으면 FAILED 로 고정해 dead-letter 로 남긴다. 그 전에는 PENDING 을
          // 유지해야 다음 순회에서 다시 집힌다.
          status: exhausted ? 'FAILED' : 'PENDING',
          attempts,
          // VarChar(255) 라 넘치면 insert 가 실패해 실패 기록마저 잃는다.
          failReason: reason.slice(0, 255),
          nextAttemptAt: exhausted ? null : nextBackoff(attempts),
        },
      });

      if (exhausted) {
        deadLettered++;
        logger.error('[Outbox] 알림 발송을 포기했습니다(dead-letter).', undefined, {
          notificationId: row.id,
          recipient: row.recipient,
          attempts,
          reason,
        });
      } else {
        failed++;
        logger.warn('[Outbox] 알림 발송 실패, 재시도 예약', {
          notificationId: row.id,
          attempts,
          reason,
        });
      }
    }
  }

  return { sent, failed, deadLettered };
}

function nextBackoff(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
  return new Date(Date.now() + minutes * 60_000);
}

let dispatcherTimer: NodeJS.Timeout | null = null;

/**
 * 앱 프로세스 안에서 디스패처를 주기 실행한다.
 *
 * 별도 워커 컨테이너를 두지 않는 이유: `docker-compose.prod.yml` 은 nginx·app·db 셋뿐이고,
 * 워커를 추가하면 배포 구성과 운영 절차가 함께 늘어난다. 위 claim 이
 * `FOR UPDATE SKIP LOCKED` 라 인스턴스를 늘려도 중복 발송이 나지 않으므로, 지금 단순하게
 * 가도 나중에 막히지 않는다.
 */
export function startNotificationDispatcher(intervalMs = 30_000): void {
  if (dispatcherTimer) return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.NOTIFICATION_DISPATCHER === 'off') {
    logger.warn('[Outbox] NOTIFICATION_DISPATCHER=off — 알림이 발송되지 않습니다.');
    return;
  }

  const tick = async () => {
    try {
      const result = await dispatchPendingNotifications();
      if (result.sent || result.failed || result.deadLettered) {
        logger.info('[Outbox] 알림 디스패치', result);
      }
    } catch (error) {
      // 한 번의 실패로 타이머가 죽으면 그 뒤 알림이 전부 멈춘다.
      logger.error('[Outbox] 디스패치 순회 실패', error instanceof Error ? error : undefined);
    }
  };

  dispatcherTimer = setInterval(tick, intervalMs);
  // 프로세스 종료를 막지 않는다(테스트·마이그레이션 스크립트가 매달리지 않도록).
  dispatcherTimer.unref?.();

  logger.info('[Outbox] 알림 디스패처를 시작했습니다.', { intervalMs });
}

/** 테스트용. 타이머를 정리한다. */
export function stopNotificationDispatcher(): void {
  if (dispatcherTimer) {
    clearInterval(dispatcherTimer);
    dispatcherTimer = null;
  }
}
