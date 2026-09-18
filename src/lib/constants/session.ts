/**
 * 화면 유휴 자동 로그아웃 — **정본**.
 *
 * `IdleTimeoutProvider` 가 타이머에, 시스템 설정 화면(`/api/settings/system`)이 표시에 쓴다.
 * 예전에는 이 값이 Provider 안에만 있어서 설정 화면은 쿠키 수명(8시간)을 "세션" 으로 보여 줬다 —
 * 실제로는 입력이 30분 없으면 로그아웃된다.
 *
 * 쿠키(JWT) 수명의 정본은 `src/auth.config.ts` 의 `SESSION_MAX_AGE_SECONDS` 다(Edge 번들이
 * 그 모듈을 import 하므로 거기 둔다).
 */

/** 입력이 이 시간 동안 없으면 로그아웃한다(밀리초). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** 로그아웃 직전 경고 모달을 띄워 두는 시간(밀리초). `IDLE_TIMEOUT_MS` 에 포함된다. */
export const IDLE_WARNING_MS = 1 * 60 * 1000;

/**
 * 계정 단위 로그인 실패 잠금 — **정본**(2026-09-18 소유자 결정 D13).
 * `src/lib/login-throttle.ts` 가 판정에, 로그인 화면과 시스템 설정 화면이 안내에 쓴다.
 * `windowMinutes` 안에 `maxFailures` 번 틀리면 그 계정은 `lockMinutes` 동안 로그인을 거부한다.
 */
export const LOGIN_LOCK_POLICY = {
  maxFailures: 10,
  windowMinutes: 15,
  lockMinutes: 15,
} as const;
