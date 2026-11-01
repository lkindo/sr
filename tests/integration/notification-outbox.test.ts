import { beforeEach, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { dispatchPendingNotifications, enqueueEmails } from '@/services/notification-outbox';

import { describeDb, resetDatabase } from './helpers';

const sendMail = vi.hoisted(() => vi.fn());

vi.mock('@/services/email.service', () => ({ emailService: { sendMail } }));

const email = (to: string) => ({ to, subject: '제목', html: '<p>본문</p>' });

/**
 * 아웃박스의 클레임은 원시 SQL 이라 목으로는 검증할 수 없다. 실제 Postgres 에서
 * 임대·재시도·dead-letter 가 동작하는지 고정한다.
 */
describeDb('알림 아웃박스 (실제 DB)', () => {
  beforeEach(async () => {
    await resetDatabase();
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
  });

  it('발송에 성공하면 SENT 로 바꾸고 본문을 지운다', async () => {
    await enqueueEmails([email('a@example.com')]);

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 1, failed: 0, deadLettered: 0 });
    const row = await prisma.notification.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, content: '' });
  });

  it('디스패처가 동시에 돌아도 같은 행을 두 번 보내지 않는다', async () => {
    await enqueueEmails(Array.from({ length: 20 }, (_, i) => email(`u${i}@example.com`)));

    const results = await Promise.all([
      dispatchPendingNotifications(),
      dispatchPendingNotifications(),
      dispatchPendingNotifications(),
    ]);

    const recipients = sendMail.mock.calls.map(([mail]) => mail.to);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(recipients.length);
  });

  it('임대 중인 행은 다시 집지 않는다', async () => {
    await enqueueEmails([email('a@example.com')]);
    await prisma.notification.updateMany({
      data: { nextAttemptAt: new Date(Date.now() + 60_000) },
    });

    expect(await dispatchPendingNotifications()).toEqual({ sent: 0, failed: 0, deadLettered: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('발송이 실패하면 사유를 남기고 나중에 다시 시도한다', async () => {
    sendMail.mockRejectedValue(new Error('SMTP 연결 실패'));
    await enqueueEmails([email('a@example.com')]);

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 1, deadLettered: 0 });
    const row = await prisma.notification.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, failReason: 'SMTP 연결 실패' });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(row.content).not.toBe('');
  });

  it('재시도 한도를 넘으면 FAILED 로 고정해 더 집지 않는다', async () => {
    sendMail.mockRejectedValue(new Error('영구 실패'));
    await enqueueEmails([email('a@example.com')]);
    await prisma.notification.updateMany({ data: { attempts: 99 } });

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 0, deadLettered: 1 });
    const row = await prisma.notification.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'FAILED', nextAttemptAt: null });

    sendMail.mockClear();
    await dispatchPendingNotifications();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
