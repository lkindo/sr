/**
 * 비밀번호 정책의 정본.
 *
 * 서버의 `passwordSchema` 와 브라우저의 사전 검사가 같은 규칙을 쓴다. 브라우저 쪽이 zod 를
 * 싣지 않도록 여기에는 zod 를 들이지 않는다.
 *
 * 보안 요구사항:
 * - 최소 8자 이상
 * - 대문자 1개 이상 포함 (A-Z)
 * - 소문자 1개 이상 포함 (a-z)
 * - 숫자 1개 이상 포함 (0-9)
 * - 특수문자 1개 이상 포함 (!@#$%^&*()_+-=[]{}|;:,.<>?)
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

/**
 * 특수문자로 인정하는 문자 — **정본**. 목록에 없는 문자(`~`, `/`, `'` 등)는 특수문자로 치지 않는다.
 * 안내 문구가 "특수문자" 라고만 하면 `~` 를 넣은 사용자는 이유를 모른 채 거부된다.
 */
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/**
 * `PASSWORD_SPECIAL_CHARS` 중 하나를 포함하는지. 정규식 리터럴로 두고(문자열로 조립하면
 * `new RegExp` 가 된다) 목록과의 일치는 schemas.test.ts 가 문자 단위로 검증한다.
 */
export const PASSWORD_SPECIAL_CHAR_PATTERN = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

/** 사람이 읽는 비밀번호 정책. 아래 규칙과 같은 상수에서 만들어 둘이 갈라지지 않게 한다. */
export const PASSWORD_POLICY_DESCRIPTION = `${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자, 대문자·소문자·숫자·특수문자를 각각 1개 이상 포함(특수문자: ${PASSWORD_SPECIAL_CHARS})`;

export const PASSWORD_TOO_SHORT_MESSAGE = `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
export const PASSWORD_TOO_LONG_MESSAGE = `비밀번호는 ${PASSWORD_MAX_LENGTH}자를 초과할 수 없습니다.`;

export const PASSWORD_PATTERN_RULES = [
  { pattern: /[A-Z]/, message: '비밀번호는 대문자를 최소 1개 이상 포함해야 합니다.' },
  { pattern: /[a-z]/, message: '비밀번호는 소문자를 최소 1개 이상 포함해야 합니다.' },
  { pattern: /[0-9]/, message: '비밀번호는 숫자를 최소 1개 이상 포함해야 합니다.' },
  {
    pattern: PASSWORD_SPECIAL_CHAR_PATTERN,
    message: `비밀번호는 특수문자(${PASSWORD_SPECIAL_CHARS})를 최소 1개 이상 포함해야 합니다.`,
  },
] as const;

/** 어긴 규칙 중 첫 사유. 규칙을 모두 지키면 null. `passwordSchema` 의 첫 오류와 같다. */
export function firstPasswordIssue(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (password.length > PASSWORD_MAX_LENGTH) return PASSWORD_TOO_LONG_MESSAGE;
  return PASSWORD_PATTERN_RULES.find((rule) => !rule.pattern.test(password))?.message ?? null;
}
