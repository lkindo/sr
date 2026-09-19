import type { Prisma, SRStatus } from '@prisma/client';

import { getSRUrl } from '@/lib/app-url';
import { isReopenTransition } from '@/lib/sr-state-machine';
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
    /** 전이를 일으킨 사용자 — 본인 행동에 대한 메일은 보내지 않는다(D15). */
    actorId?: string | null;
    /** 전이 사유. 재오픈 메일에 '재오픈 사유' 로 싣는다(D15). */
    reason?: string | null;
    /** 이미 다른 메일(재오픈 알림)을 받은 사용자 — 같은 사람에게 두 통 보내지 않는다(D15). */
    excludeUserIds?: string[];
  }
): Promise<number> {
  if (!payload.requesterId) return 0;
  // 행위자 본인에게는 보내지 않는다 — 자기가 누른 전이를 메일로 알릴 이유가 없다(D15).
  if (payload.actorId && payload.requesterId === payload.actorId) return 0;
  if (payload.excludeUserIds?.includes(payload.requesterId)) return 0;
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

  const isReopen = isReopenTransition(
    (payload.previousStatus ?? 'REQUESTED') as SRStatus,
    payload.currentStatus as SRStatus
  );
  const detail =
    payload.currentStatus === 'COMPLETED' && payload.resolutionDescription
      ? { label: '완료 내용', body: payload.resolutionDescription }
      : payload.currentStatus === 'REJECTED' && payload.rejectionReason
        ? { label: '거절 사유', body: payload.rejectionReason }
        : isReopen && payload.reason
          ? { label: '재오픈 사유', body: payload.reason }
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

/**
 * 재오픈 알림을 재오픈과 같은 트랜잭션에 적재한다(2026-09-18 소유자 결정 D15).
 *
 * 예전에는 상태 변경 메일을 신청자만 받아서, 고객이나 운영 관리자가 재오픈해도 다시 일해야 하는 담당자에게는
 * 메일도 푸시도 가지 않았다(접속 중일 때만 '진행중으로 변경' 토스트 한 번).
 *  - 담당자에게 보낸다. 켜고 끄는 설정은 '배정 알림'(emailSRAssigned, 기본 켜짐)이다 — 재오픈은 일이 다시
 *    맡겨진 것이라 배정과 성격이 같다.
 *  - 행위자 본인은 제외한다(예: MANAGER 가 자기 담당 SR 을 재오픈).
 *  - 담당자가 비활성·삭제 계정이면 재배정할 활성 ADMIN·MANAGER(행위자 제외)에게 보낸다. 설정은 '새 SR 알림'
 *    (emailSRCreated)을 따른다 — 운영 관리자에게는 새로 맡길 일이 생긴 것과 같다.
 * 돌려주는 `notifiedUserIds` 는 같은 사람에게 상태 변경 메일을 한 통 더 보내지 않기 위한 목록이다.
 */
export async function enqueueSRReopenedEmails(
  tx: Tx,
  payload: SRMailPayload & {
    assigneeId: string | null | undefined;
    actorId: string | null | undefined;
    reason: string | null | undefined;
  }
): Promise<{ enqueued: number; notifiedUserIds: string[] }> {
  const link = getSRUrl(payload.srId);
  const assignee = payload.assigneeId
    ? await tx.user.findUnique({
        where: { id: payload.assigneeId },
        select: { id: true, email: true, isActive: true, notificationPreference: true },
      })
    : null;

  if (assignee?.isActive) {
    if (assignee.id === payload.actorId) return { enqueued: 0, notifiedUserIds: [] };
    const enabled = assignee.notificationPreference?.emailSRAssigned ?? true;
    if (!assignee.email || !enabled) return { enqueued: 0, notifiedUserIds: [] };
    const enqueued = await enqueueEmails(
      [
        {
          ...emailService.buildSRReopened(
            assignee.email,
            payload.srNumber,
            payload.title,
            payload.reason ?? null,
            link
          ),
          metadata: { srId: payload.srId, kind: 'sr-reopened' },
        },
      ],
      tx
    );
    return { enqueued, notifiedUserIds: [assignee.id] };
  }

  // 담당자가 없거나 비활성 — 재배정할 사람에게 알린다. 그러지 않으면 아무도 모르는 채 진행중 SR 이 남는다.
  const managers = await tx.user.findMany({
    where: {
      roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
      isActive: true,
      ...(payload.actorId ? { NOT: { id: payload.actorId } } : {}),
    },
    select: { id: true, email: true, notificationPreference: true },
  });
  const recipients = managers.filter(
    (manager) => manager.email && (manager.notificationPreference?.emailSRCreated ?? true)
  );
  const enqueued = await enqueueEmails(
    recipients.map((manager) => ({
      ...emailService.buildSRReopened(
        manager.email,
        payload.srNumber,
        payload.title,
        payload.reason ?? null,
        link,
        true
      ),
      metadata: { srId: payload.srId, kind: 'sr-reopened-reassign' },
    })),
    tx
  );
  return { enqueued, notifiedUserIds: recipients.map((manager) => manager.id) };
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
