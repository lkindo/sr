import { describe, expect, it } from 'vitest';

import { firstPasswordIssue } from '@/lib/password-policy';
import { passwordSchema } from '@/lib/schemas';

describe('firstPasswordIssue', () => {
  // 브라우저 검사가 서버 스키마와 어긋나면, 통과시킨 입력을 서버가 거절하거나 문구가 달라진다.
  it.each([
    ['빈 값', ''],
    ['너무 짧음', 'Aa1!'],
    ['7자 경계', 'Aa1!aaa'],
    ['8자 경계', 'Aa1!aaaa'],
    ['대문자 없음', 'lowercase1!'],
    ['소문자 없음', 'UPPERCASE1!'],
    ['숫자 없음', 'NoDigits!!'],
    ['특수문자 없음', 'NoSpecial11'],
    ['목록에 없는 특수문자', 'TildeOnly1~'],
    ['100자 경계', 'Aa1!'.padEnd(100, 'a')],
    ['101자', 'Aa1!'.padEnd(101, 'a')],
    ['101자이면서 대문자 없음', 'a1!'.padEnd(101, 'a')],
  ])('%s: 서버 스키마와 결과가 같다', (_name, password) => {
    const parsed = passwordSchema.safeParse(password);

    expect(firstPasswordIssue(password)).toBe(
      parsed.success ? null : parsed.error.issues[0]?.message
    );
  });

  it('규칙을 모두 지키면 null 이다', () => {
    expect(firstPasswordIssue('Valid1!aa')).toBeNull();
  });
});
