import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueEmails: vi.fn().mockResolvedValue(1),
  buildCreated: vi.fn((to: string) => ({ to, subject: 'created', html: 'html' })),
  buildStatus: vi.fn((to: string) => ({ to, subject: 'status', html: 'html' })),
  buildAssigned: vi.fn((to: string) => ({ to, subject: 'assigned', html: 'html' })),
}));

vi.mock('@/services/notification-outbox', () => ({ enqueueEmails: mocks.enqueueEmails }));
vi.mock('@/services/email.service', () => ({
  emailService: {
    buildSRCreated: mocks.buildCreated,
    buildSRStatusChanged: mocks.buildStatus,
    buildSRAssigned: mocks.buildAssigned,
  },
}));

import {
  enqueueSRAssignedEmail,
  enqueueSRCreatedEmails,
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
