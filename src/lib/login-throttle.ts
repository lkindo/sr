/**
 * 계정 단위 로그인 실패 제한(2026-09-18 소유자 결정 D13).
 *
 * 기존 제한은 "같은 이메일 + 같은 IP 로 1분 5회"(api/auth/[...nextauth]/route.ts)라, IP 를 바꿔 가며 시도하면
 * 한도가 사실상 없어졌다. IPv6 는 주소 하나 단위로 세므로 대역 하나로도 무제한에 가깝다. 이 모듈은 IP 와 무관하게
 * **한 계정(이메일)에 대한 실패만** 센다.
 *  - 15분 안에 10번 틀리면 그 계정은 15분 동안 로그인을 거부한다. 시간이 지나면 자동으로 풀린다.
 *  - 성공은 세지 않고, 성공하면 기록을 지운다.
 *  - 존재하지 않는 이메일도 똑같이 센다 — 잠금 여부로 계정 존재를 알아낼 수 없게 한다.
 *
 * 한계: 공격자가 일부러 틀려서 특정 사용자를 막을 수 있고, 15분마다 다시 틀리면 잠금을 계속 이어 갈 수도 있다
 * (PRD 의 3회 잠금안도 같은 성질이다 — 10회로 잡아 실수로 막히는 일을 줄였다). 그럴 때는 서버를 재시작하면 풀린다.
 * 여러 계정에 흔한 비밀번호를 한두 번씩 시도하는 공격은 막지 못한다(2FA 영역).
 * 상태는 프로세스 메모리에 있다 — 앱이 한 대라는 전제는 다른 요청 제한과 같다(rate-limiter.ts).
 */

import { LOGIN_LOCK_POLICY } from '@/lib/constants/session';

const WINDOW_MS = LOGIN_LOCK_POLICY.windowMinutes * 60 * 1000;
const LOCK_MS = LOGIN_LOCK_POLICY.lockMinutes * 60 * 1000;
const MAX_FAILURES = LOGIN_LOCK_POLICY.maxFailures;
/** 추적하는 계정 수의 상한. 무작위 이메일로 메모리를 채우지 못하게 오래된 것부터 버린다. */
const MAX_TRACKED = 10_000;

interface Entry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const entries = new Map<string, Entry>();

const keyOf = (email: string) => email.trim().toLowerCase();

/** 잠겨 있으면 풀릴 때까지 남은 시간(ms), 아니면 0. */
export function loginLockRemainingMs(email: string, now = Date.now()): number {
  const entry = entries.get(keyOf(email));
  if (!entry) return 0;
  return entry.lockedUntil > now ? entry.lockedUntil - now : 0;
}

/** 로그인 실패 한 번을 센다. 한도에 닿으면 잠근다. */
export function recordLoginFailure(email: string, now = Date.now()): void {
  const key = keyOf(email);
  const entry = entries.get(key);

  if (!entry || (now - entry.windowStart >= WINDOW_MS && entry.lockedUntil <= now)) {
    if (!entry && entries.size >= MAX_TRACKED) prune(now);
    entries.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return;
  }

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES && entry.lockedUntil <= now) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

/** 로그인에 성공하면 그 계정의 실패 기록을 지운다. */
export function clearLoginFailures(email: string): void {
  entries.delete(keyOf(email));
}

function prune(now: number): void {
  for (const [key, entry] of entries) {
    if (now - entry.windowStart >= WINDOW_MS && entry.lockedUntil <= now) entries.delete(key);
  }
  // 그래도 가득 차 있으면 잠기지 않은 것 가운데 오래된 것부터 버린다(Map 은 넣은 순서를 지킨다).
  // 잠긴 계정을 먼저 버리면 무작위 이메일로 표를 채워 잠금을 풀 수 있다.
  for (const [key, entry] of entries) {
    if (entries.size < MAX_TRACKED) return;
    if (entry.lockedUntil <= now) entries.delete(key);
  }
  for (const key of entries.keys()) {
    if (entries.size < MAX_TRACKED) return;
    entries.delete(key);
  }
}

/** 테스트 전용 — 모든 기록을 지운다. */
export function resetLoginThrottleForTests(): void {
  entries.clear();
}
