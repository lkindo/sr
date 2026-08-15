import type { Prisma } from '@prisma/client';

import { getSRUrl } from '@/lib/app-url';
import { emailService } from '@/services/email.service';
import { enqueueEmails, type OutboxEmail } from '@/services/notification-outbox';

type Tx = Prisma.TransactionClient;

type SRMailPayload = {
  srId: string;
  srNumber: string;
  title: string;
};

/** SR 생성과 같은 트랜잭션에 운영자 이메일 아웃박스를 적재한다. */
export async function enqueueSRCreatedEmails(
  tx: Tx,
  payload: SRMailPayload & { requesterName: string }
): Promise<number> {
  const recipients = await tx.user.findMany({
    where: {
      roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
      isActive: true,
    },
    select: { email: true, notificationPreference: true },
  });

  const emails: OutboxEmail[] = recipients.flatMap((recipient) => {
    const enabled = recipient.notificationPreference?.emailSRCreated ?? true;
    if (!recipient.email || !enabled) return [];
    return [
      {
        ...emailService.buildSRCreated(
          recipient.email,
          payload.srNumber,
          payload.title,
          payload.requesterName,
          getSRUrl(payload.srId)
        ),
        metadata: { srId: payload.srId, kind: 'sr-created' },
      },
    ];
  });

  return enqueueEmails(emails, tx);
}

/** 상태 변경과 같은 트랜잭션에 요청자 이메일 아웃박스를 적재한다. */
export async function enqueueSRStatusChangedEmail(
  tx: Tx,
  payload: SRMailPayload & {
    requesterId: string | null | undefined;
    previousStatus: string | null;
    currentStatus: string;
  }
): Promise<number> {
  if (!payload.requesterId) return 0;
  const requester = await tx.user.findUnique({
    where: { id: payload.requesterId },
    select: { email: true, notificationPreference: true },
  });
  const enabled = requester?.notificationPreference?.emailSRStatusChanged ?? false;
  if (!requester?.email || !enabled) return 0;

  return enqueueEmails(
    [
      {
        ...emailService.buildSRStatusChanged(
          requester.email,
          payload.srNumber,
          payload.title,
          payload.previousStatus ?? '없음',
          payload.currentStatus,
          getSRUrl(payload.srId)
        ),
        metadata: { srId: payload.srId, kind: 'sr-status-changed' },
      },
    ],
    tx
  );
}

/** 담당자 배정과 같은 트랜잭션에 담당자 이메일 아웃박스를 적재한다. */
export async function enqueueSRAssignedEmail(
  tx: Tx,
  payload: SRMailPayload & { assigneeId: string | null | undefined; assigneeName: string }
): Promise<number> {
  if (!payload.assigneeId) return 0;
  const assignee = await tx.user.findUnique({
    where: { id: payload.assigneeId },
    select: { email: true, notificationPreference: true },
  });
  const enabled = assignee?.notificationPreference?.emailSRAssigned ?? true;
  if (!assignee?.email || !enabled) return 0;

  return enqueueEmails(
    [
      {
        ...emailService.buildSRAssigned(
          assignee.email,
          payload.srNumber,
          payload.title,
          payload.assigneeName,
          getSRUrl(payload.srId)
        ),
        metadata: { srId: payload.srId, kind: 'sr-assigned' },
      },
    ],
    tx
  );
}
