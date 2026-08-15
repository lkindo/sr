import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  dispatchPendingNotifications,
  enqueueEmails,
  MAX_ATTEMPTS,
  startNotificationDispatcher,
  stopNotificationDispatcher,
} from '../notification-outbox';

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

  it('claim 쿼리는 SKIP LOCKED 대상 선택과 임대를 한 문장에서 원자적으로 수행한다', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await dispatchPendingNotifications();

    // 디스패처가 여러 개 돌아도 같은 행을 두 번 보내지 않아야 한다.
    const sql = mocks.queryRaw.mock.calls[0]![0].join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("'PENDING'");
    expect(sql).toContain('UPDATE "notifications"');
    expect(sql).toContain('SET "next_attempt_at"');
    expect(sql).toContain('RETURNING');
  });
});

/**
 * 디스패처 타이머의 생명주기.
 *
 * 이 타이머는 운영에서 30초마다 돌며 밀린 알림을 실제로 내보낸다
 * (`instrumentation.ts` 가 부팅 때 켠다). 그런데 지금까지 테스트가 하나도 없었다 —
 * `startNotificationDispatcher` 안의 `NODE_ENV === 'test'` 가드 때문에 테스트에서는
 * 아무 일도 일어나지 않아, 검증할 방법이 없다고 여겨진 것으로 보인다. 그 가드를
 * 명시적으로 비켜서면 나머지 동작은 전부 검증할 수 있다.
 *
 * 여기서 지키려는 계약:
 *   - 테스트 환경에서는 절대 타이머를 걸지 않는다(가드 자체의 회귀 방지).
 *   - 껐다는 설정을 존중한다(NOTIFICATION_DISPATCHER=off).
 *   - 두 번 켜도 타이머는 하나다 — 중복되면 발송 시도가 배로 늘어난다.
 *   - 멈추면 실제로 멈춘다.
 */
describe('알림 디스패처 타이머', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 모듈 수준 타이머 변수는 테스트 간에 샌다. 매번 확실히 비운다.
    stopNotificationDispatcher();
    // tick 이 돌아도 조회 결과가 비어 있어 아무것도 발송하지 않게 한다.
    mocks.queryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    stopNotificationDispatcher();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ['NODE_ENV=test', { NODE_ENV: 'test', VITEST: '', TEST_MODE: '', PLAYWRIGHT_TEST: '' }],
    [
      'VITEST 플래그',
      { NODE_ENV: 'production', VITEST: 'true', TEST_MODE: '', PLAYWRIGHT_TEST: '' },
    ],
    [
      'TEST_MODE 플래그',
      { NODE_ENV: 'development', VITEST: '', TEST_MODE: 'true', PLAYWRIGHT_TEST: '' },
    ],
    [
      'PLAYWRIGHT_TEST 플래그',
      { NODE_ENV: 'development', VITEST: '', TEST_MODE: '', PLAYWRIGHT_TEST: 'true' },
    ],
  ])('테스트 실행 중에는 타이머를 걸지 않는다 (%s)', (_label, env) => {
    // 가드가 사라지면 스위트 내내 30초짜리 실제 인터벌이 살아남는다.
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);

    startNotificationDispatcher(1_000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('NOTIFICATION_DISPATCHER=off 이면 타이머를 걸지 않는다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NOTIFICATION_DISPATCHER', 'off');

    startNotificationDispatcher(1_000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('주기마다 밀린 알림을 처리한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');

    startNotificationDispatcher(1_000);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
  });

  // 중복 기동은 조용한 형태로 나쁘다: 타이머가 둘이면 같은 주기에 claim 이 두 번 돌아
  // 부하가 배가 된다(발송 자체는 FOR UPDATE SKIP LOCKED 가 막아 준다).
  it('두 번 켜도 타이머는 하나만 유지한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');

    startNotificationDispatcher(1_000);
    startNotificationDispatcher(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('멈추면 더 이상 돌지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');

    startNotificationDispatcher(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);

    stopNotificationDispatcher();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  // 한 번의 실패로 타이머가 죽으면 그 뒤 알림이 전부 멈춘다 — 소스 주석이 명시한 계약이다.
  it('한 주기가 실패해도 다음 주기는 계속 돈다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    mocks.queryRaw.mockRejectedValueOnce(new Error('DB down'));

    startNotificationDispatcher(1_000);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });
});
