import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 4.2 회귀 테스트 — 알림 아웃박스.
 *
 * 예전에는 알림을 `backgroundTask(Promise.allSettled(...))` 로 곧장 SMTP 에 쐈다.
 * `sendMail` 이 오류를 삼키고 `Promise.allSettled` 가 rejection 을 한 번 더 삼켜,
 * 실패가 기록도 재시도도 없이 사라졌다. 운영자가 "담당자에게 알림이 갔나"에 답할 수 없었다.
 *
 * 여기서 단언하는 것은 세 가지다.
 *   1. 적재는 DB 행으로 남는다(트랜잭션 클라이언트도 받는다).
 *   2. 발송 실패는 삼켜지지 않고 failReason·attempts 로 기록되며 재시도가 예약된다.
 *   3. 상한을 넘으면 FAILED 로 고정되어 무한 재시도가 되지 않는다(dead-letter).
 */

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  update: vi.fn(),
  queryRaw: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    notification: { createMany: mocks.createMany, update: mocks.update },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock('@/services/email.service', () => ({
  emailService: { sendMail: mocks.sendMail },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dispatchPendingNotifications, enqueueEmails, MAX_ATTEMPTS } from '../notification-outbox';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'n-1',
  recipient: 'a@example.com',
  subject: '제목',
  content: '<p>본문</p>',
  attempts: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
  mocks.queryRaw.mockResolvedValue([]);
  mocks.sendMail.mockResolvedValue(undefined);
});

describe('enqueueEmails', () => {
  it('PENDING 행으로 적재한다', async () => {
    await enqueueEmails([
      { to: 'a@example.com', subject: '제목', html: '<p>본문</p>', metadata: { srId: 'sr-1' } },
    ]);

    const arg = mocks.createMany.mock.calls[0]![0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      type: 'EMAIL',
      status: 'PENDING',
      recipient: 'a@example.com',
      subject: '제목',
      content: '<p>본문</p>',
    });
    // 즉시 대상이어야 다음 순회에서 집힌다.
    expect(arg.data[0].nextAttemptAt).toBeInstanceOf(Date);
  });

  it('트랜잭션 클라이언트를 받으면 그쪽에 적재한다', async () => {
    const txCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { notification: { createMany: txCreateMany } } as never;

    await enqueueEmails([{ to: 'a@example.com', subject: 's', html: 'h' }], tx);

    // 도메인 변경과 같은 트랜잭션에 묶여야 "SR 은 저장됐는데 알림 기록은 없다"가 불가능해진다.
    expect(txCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('빈 목록이면 쿼리를 보내지 않는다', async () => {
    await expect(enqueueEmails([])).resolves.toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});

describe('dispatchPendingNotifications', () => {
  it('발송에 성공하면 SENT 로 표시하고 sentAt 을 남긴다', async () => {
    mocks.queryRaw.mockResolvedValue([row()]);

    const result = await dispatchPendingNotifications();

    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: '제목',
      html: '<p>본문</p>',
    });
    expect(result).toEqual({ sent: 1, failed: 0, deadLettered: 0 });
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({
      status: 'SENT',
      attempts: 1,
      failReason: null,
    });
  });

  it('발송에 실패하면 사유를 기록하고 재시도를 예약한다', async () => {
    mocks.queryRaw.mockResolvedValue([row()]);
    mocks.sendMail.mockRejectedValue(new Error('SMTP 연결 실패'));

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 1, deadLettered: 0 });
    const data = mocks.update.mock.calls[0]![0].data;
    // 예전에는 실패가 통째로 삼켜져 이 정보가 어디에도 남지 않았다.
    expect(data.failReason).toContain('SMTP 연결 실패');
    expect(data.attempts).toBe(1);
    // 아직 상한 전이므로 PENDING 을 유지해야 다음 순회에서 다시 집힌다.
    expect(data.status).toBe('PENDING');
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('상한을 넘으면 FAILED 로 고정해 무한 재시도를 막는다', async () => {
    mocks.queryRaw.mockResolvedValue([row({ attempts: MAX_ATTEMPTS - 1 })]);
    mocks.sendMail.mockRejectedValue(new Error('영구 실패'));

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 0, deadLettered: 1 });
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.status).toBe('FAILED');
    expect(data.attempts).toBe(MAX_ATTEMPTS);
    // 더 집히지 않도록 예약을 비운다.
    expect(data.nextAttemptAt).toBeNull();
  });

  it('failReason 이 컬럼 길이를 넘지 않도록 자른다', async () => {
    mocks.queryRaw.mockResolvedValue([row()]);
    mocks.sendMail.mockRejectedValue(new Error('x'.repeat(1000)));

    await dispatchPendingNotifications();

    // VarChar(255) 를 넘기면 update 가 실패해 실패 기록마저 잃는다.
    expect(mocks.update.mock.calls[0]![0].data.failReason.length).toBe(255);
  });

  it('한 건이 실패해도 나머지를 계속 처리한다', async () => {
    mocks.queryRaw.mockResolvedValue([row({ id: 'n-1' }), row({ id: 'n-2' })]);
    mocks.sendMail.mockRejectedValueOnce(new Error('일시 오류')).mockResolvedValueOnce(undefined);

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 1, failed: 1, deadLettered: 0 });
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it('집을 행이 없으면 SMTP 를 건드리지 않는다', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    const result = await dispatchPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 0, deadLettered: 0 });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('claim 쿼리는 SKIP LOCKED 로 잠근다', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await dispatchPendingNotifications();

    // 디스패처가 여러 개 돌아도 같은 행을 두 번 보내지 않아야 한다.
    const sql = mocks.queryRaw.mock.calls[0]![0].join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("'PENDING'");
  });
});
