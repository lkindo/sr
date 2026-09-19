import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueEmails: vi.fn().mockResolvedValue(1),
  buildCreated: vi.fn((to: string) => ({ to, subject: 'created', html: 'html' })),
  buildStatus: vi.fn((to: string) => ({ to, subject: 'status', html: 'html' })),
  buildAssigned: vi.fn((to: string) => ({ to, subject: 'assigned', html: 'html' })),
  buildReopened: vi.fn((to: string) => ({ to, subject: 'reopened', html: 'html' })),
}));

vi.mock('@/services/notification-outbox', () => ({ enqueueEmails: mocks.enqueueEmails }));
vi.mock('@/services/email.service', () => ({
  emailService: {
    buildSRCreated: mocks.buildCreated,
    buildSRStatusChanged: mocks.buildStatus,
    buildSRAssigned: mocks.buildAssigned,
    buildSRReopened: mocks.buildReopened,
  },
}));

import {
  enqueueSRAssignedEmail,
  enqueueSRCreatedEmails,
  enqueueSRReopenedEmails,
  enqueueSRStatusChangedEmail,
} from '../sr-email-outbox';

const findMany = vi.fn();
const findUnique = vi.fn();
const tx = {
  user: { findMany, findUnique },
  notification: { createMany: vi.fn() },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueEmails.mockResolvedValue(1);
});

describe('SR 이메일 트랜잭션 아웃박스', () => {
  it('생성 알림을 선택한 운영자만 같은 tx로 적재한다', async () => {
    findMany.mockResolvedValue([
      { email: 'a@example.com', notificationPreference: { emailSRCreated: true } },
      { email: 'b@example.com', notificationPreference: { emailSRCreated: false } },
    ]);

    await enqueueSRCreatedEmails(tx, {
      srId: 'sr-1',
      srNumber: 'SR-001',
      title: '제목',
      requesterName: '요청자',
    });

    expect(mocks.enqueueEmails).toHaveBeenCalledWith(
      [expect.objectContaining({ to: 'a@example.com' })],
      tx
    );
  });

  it('상태 알림 기본값 false를 존중한다', async () => {
    findUnique.mockResolvedValue({
      email: 'requester@example.com',
      notificationPreference: null,
    });

    await enqueueSRStatusChangedEmail(tx, {
      srId: 'sr-1',
      srNumber: 'SR-001',
      title: '제목',
      requesterId: 'requester-1',
      previousStatus: 'INTAKE',
      currentStatus: 'IN_PROGRESS',
    });

    expect(mocks.enqueueEmails).not.toHaveBeenCalled();
  });

  it('담당자 알림 기본값 true를 존중하고 같은 tx로 적재한다', async () => {
    findUnique.mockResolvedValue({
      email: 'engineer@example.com',
      notificationPreference: null,
    });

    await enqueueSRAssignedEmail(tx, {
      srId: 'sr-1',
      srNumber: 'SR-001',
      title: '제목',
      assigneeId: 'engineer-1',
      assigneeName: '담당자',
    });

    expect(mocks.enqueueEmails).toHaveBeenCalledWith(
      [expect.objectContaining({ to: 'engineer@example.com' })],
      tx
    );
  });
});

/**
 * 재오픈 알림(2026-09-18 소유자 결정 D15). 예전에는 상태 변경 메일을 신청자만 받아, 고객이나 운영 관리자가
 * 재오픈해도 다시 일해야 하는 담당자에게는 아무것도 가지 않았다.
 */
describe('재오픈 알림 — 담당자에게', () => {
  const reopen = {
    srId: 'sr-1',
    srNumber: 'SR-001',
    title: '제목',
    assigneeId: 'eng-1',
    actorId: 'client-1',
    reason: '여전히 오류가 납니다',
  };

  it('활성 담당자에게 재오픈 사유를 실어 보낸다(배정 알림 설정, 기본 켜짐)', async () => {
    findUnique.mockResolvedValue({
      id: 'eng-1',
      email: 'eng@example.com',
      isActive: true,
      notificationPreference: null,
    });

    const result = await enqueueSRReopenedEmails(tx, reopen);

    expect(mocks.buildReopened).toHaveBeenCalledWith(
      'eng@example.com',
      'SR-001',
      '제목',
      '여전히 오류가 납니다',
      expect.any(String)
    );
    expect(mocks.enqueueEmails).toHaveBeenCalledWith(
      [expect.objectContaining({ metadata: { srId: 'sr-1', kind: 'sr-reopened' } })],
      tx
    );
    expect(result.notifiedUserIds).toEqual(['eng-1']);
  });

  it('담당자가 배정 알림을 꺼 두었으면 보내지 않는다', async () => {
    findUnique.mockResolvedValue({
      id: 'eng-1',
      email: 'eng@example.com',
      isActive: true,
      notificationPreference: { emailSRAssigned: false },
    });

    const result = await enqueueSRReopenedEmails(tx, reopen);

    expect(mocks.enqueueEmails).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: 0, notifiedUserIds: [] });
  });

  it('행위자 본인(자기 담당 SR 을 재오픈한 MANAGER)에게는 보내지 않는다', async () => {
    findUnique.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@example.com',
      isActive: true,
      notificationPreference: null,
    });

    await enqueueSRReopenedEmails(tx, { ...reopen, assigneeId: 'mgr-1', actorId: 'mgr-1' });

    expect(mocks.enqueueEmails).not.toHaveBeenCalled();
  });

  it('담당자가 비활성이면 재배정할 활성 ADMIN·MANAGER(행위자 제외)에게 보낸다', async () => {
    findUnique.mockResolvedValue({
      id: 'eng-1',
      email: 'eng@example.com',
      isActive: false,
      notificationPreference: null,
    });
    findMany.mockResolvedValue([
      { id: 'mgr-1', email: 'mgr@example.com', notificationPreference: null },
      { id: 'mgr-2', email: 'mgr2@example.com', notificationPreference: { emailSRCreated: false } },
    ]);

    const result = await enqueueSRReopenedEmails(tx, reopen);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, NOT: { id: 'client-1' } }),
      })
    );
    expect(mocks.buildReopened).toHaveBeenCalledWith(
      'mgr@example.com',
      'SR-001',
      '제목',
      '여전히 오류가 납니다',
      expect.any(String),
      true
    );
    expect(mocks.buildReopened).toHaveBeenCalledTimes(1);
    expect(result.notifiedUserIds).toEqual(['mgr-1']);
  });
});

describe('상태 변경 메일 — 행위자 제외와 중복 방지(D15)', () => {
  const base = {
    srId: 'sr-1',
    srNumber: 'SR-001',
    title: '제목',
    requesterId: 'client-1',
    previousStatus: 'IN_PROGRESS',
    currentStatus: 'COMPLETED',
  };

  it('신청자 본인이 일으킨 전이는 본인에게 보내지 않는다(필수 알림이어도)', async () => {
    await expect(enqueueSRStatusChangedEmail(tx, { ...base, actorId: 'client-1' })).resolves.toBe(
      0
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('방금 재오픈 알림을 받은 사람에게는 한 통 더 보내지 않는다', async () => {
    await expect(
      enqueueSRStatusChangedEmail(tx, { ...base, excludeUserIds: ['client-1'] })
    ).resolves.toBe(0);
  });

  it('재오픈 메일에는 재오픈 사유를 싣는다', async () => {
    findUnique.mockResolvedValue({
      email: 'requester@example.com',
      notificationPreference: { emailSRStatusChanged: true },
    });

    await enqueueSRStatusChangedEmail(tx, {
      ...base,
      previousStatus: 'COMPLETED',
      currentStatus: 'IN_PROGRESS',
      actorId: 'mgr-1',
      reason: '재작업 필요',
    });

    expect(mocks.buildStatus).toHaveBeenCalledWith(
      'requester@example.com',
      'SR-001',
      '제목',
      'COMPLETED',
      'IN_PROGRESS',
      expect.any(String),
      { label: '재오픈 사유', body: '재작업 필요' }
    );
  });
});
