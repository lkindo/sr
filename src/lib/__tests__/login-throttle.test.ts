import { beforeEach, describe, expect, it } from 'vitest';

import { LOGIN_LOCK_POLICY } from '@/lib/constants/session';
import {
  clearLoginFailures,
  loginLockRemainingMs,
  recordLoginFailure,
  resetLoginThrottleForTests,
} from '@/lib/login-throttle';

/**
 * 계정 단위 로그인 실패 잠금(2026-09-18 소유자 결정 D13).
 *
 * 예전 제한은 "같은 이메일 + 같은 IP 로 1분 5회" 뿐이라 IP 를 바꿔 가며 한 계정을 계속 두드릴 수 있었다.
 * 이 모듈은 IP 와 무관하게 한 계정(이메일)에 대한 **실패만** 센다.
 */
const MINUTE = 60_000;
const T0 = 1_800_000_000_000;

function fail(email: string, times: number, now = T0) {
  for (let i = 0; i < times; i++) recordLoginFailure(email, now);
}

beforeEach(() => {
  resetLoginThrottleForTests();
});

describe('login-throttle', () => {
  it('정책 수치는 15분 안에 10번 실패하면 15분 잠금이다', () => {
    expect(LOGIN_LOCK_POLICY).toEqual({ maxFailures: 10, windowMinutes: 15, lockMinutes: 15 });
  });

  it('한도 직전(9회)까지는 잠그지 않고, 10번째 실패에서 15분 잠근다', () => {
    fail('victim@example.com', 9);
    expect(loginLockRemainingMs('victim@example.com', T0)).toBe(0);

    recordLoginFailure('victim@example.com', T0);
    expect(loginLockRemainingMs('victim@example.com', T0)).toBe(15 * MINUTE);
    expect(loginLockRemainingMs('victim@example.com', T0 + 14 * MINUTE)).toBe(MINUTE);
  });

  it('잠금은 시간이 지나면 저절로 풀린다', () => {
    fail('victim@example.com', 10);

    expect(loginLockRemainingMs('victim@example.com', T0 + 15 * MINUTE)).toBe(0);
  });

  it('이메일 대소문자·앞뒤 공백이 달라도 같은 계정으로 센다', () => {
    fail('Victim@Example.com', 5);
    fail(' victim@example.com ', 5);

    expect(loginLockRemainingMs('VICTIM@EXAMPLE.COM', T0)).toBeGreaterThan(0);
  });

  it('다른 계정의 실패는 섞이지 않는다', () => {
    fail('a@example.com', 10);

    expect(loginLockRemainingMs('a@example.com', T0)).toBeGreaterThan(0);
    expect(loginLockRemainingMs('b@example.com', T0)).toBe(0);
  });

  it('15분 창이 지나면 실패 횟수를 새로 센다', () => {
    fail('victim@example.com', 9);
    // 창이 지난 뒤의 실패는 1회째다 — 그 전의 9회와 합쳐 잠그지 않는다.
    fail('victim@example.com', 9, T0 + 15 * MINUTE);

    expect(loginLockRemainingMs('victim@example.com', T0 + 15 * MINUTE)).toBe(0);
  });

  it('로그인에 성공하면 실패 기록을 지운다', () => {
    fail('victim@example.com', 9);
    clearLoginFailures('victim@example.com');
    recordLoginFailure('victim@example.com', T0);

    expect(loginLockRemainingMs('victim@example.com', T0)).toBe(0);
  });

  it('잠긴 동안 더 틀려도 잠금이 늘어나지 않는다', () => {
    fail('victim@example.com', 10);
    fail('victim@example.com', 5, T0 + 10 * MINUTE);

    expect(loginLockRemainingMs('victim@example.com', T0 + 10 * MINUTE)).toBe(5 * MINUTE);
  });

  it('무작위 이메일로 추적 표를 가득 채워도 잠긴 계정은 밀려나지 않는다', () => {
    fail('victim@example.com', 10);
    // 추적 상한(1만)을 넘기도록 서로 다른 이메일로 1번씩 실패한다.
    for (let i = 0; i < 10_050; i++) recordLoginFailure(`spray-${i}@example.com`, T0 + 1);

    expect(loginLockRemainingMs('victim@example.com', T0 + 2)).toBeGreaterThan(0);
  });
});
