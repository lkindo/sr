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
    /** 완료 내용(COMPLETED) 또는 거절 사유(REJECTED). 본문에 실어 보낸다. */
    resolutionDescription?: string | null;
    rejectionReason?: string | null;
  }
): Promise<number> {
  if (!payload.requesterId) return 0;
  const requester = await tx.user.findUnique({
    where: { id: payload.requesterId },
    select: { email: true, notificationPreference: true },
  });
  if (!requester?.email) return 0;

  // 헌법 §4: 완료·거절은 **필수 알림**이다. 신청자가 처리 결과를 통보받지 못하는 상태를
  // 시스템 기본값으로 두어서는 안 된다.
  //
  // 예전에는 모든 상태 전이가 `emailSRStatusChanged` 하나로 묶여 있었고 그 기본값이
  // false 였다. 설정 화면을 한 번도 열지 않은 사용자 — 즉 사실상 전원 — 에게
  // 완료/거절 메일이 **한 통도 나가지 않았다.** 아웃박스·재시도·dead-letter 를 갖춰 놓고
  // 게이트 한 줄에 막혀 있던 셈이다.
  //
  // 나머지 전이(접수·진행중·보류·확인완료)는 정보성이므로 사용자 설정을 존중한다.
  const MANDATORY_STATUSES = new Set(['COMPLETED', 'REJECTED']);
  const isMandatory = MANDATORY_STATUSES.has(payload.currentStatus);

  if (!isMandatory) {
    const enabled = requester.notificationPreference?.emailSRStatusChanged ?? false;
    if (!enabled) return 0;
  }

  const detail =
    payload.currentStatus === 'COMPLETED' && payload.resolutionDescription
      ? { label: '완료 내용', body: payload.resolutionDescription }
      : payload.currentStatus === 'REJECTED' && payload.rejectionReason
        ? { label: '거절 사유', body: payload.rejectionReason }
        : null;

  return enqueueEmails(
    [
      {
        ...emailService.buildSRStatusChanged(
          requester.email,
          payload.srNumber,
          payload.title,
          payload.previousStatus ?? '없음',
          payload.currentStatus,
          getSRUrl(payload.srId),
          detail
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
