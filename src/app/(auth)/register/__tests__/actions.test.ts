import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 회원가입 액션의 **입력 경계**.
 *
 * ## 왜 이 파일이 필요한가
 *
 * 이 경로에는 테스트가 하나도 없었다. 그런데 `src/lib/__tests__/schemas.limits.test.ts:65` 에는
 * "DB 컬럼 폭을 넘는 이름은 거부한다" 라는 케이스가 **초록으로** 있었다.
 *
 * 그 테스트는 `@/lib/schemas` 의 `registerSchema` 를 검증했는데, **실제 가입 경로는
 * 그것을 쓰지 않았다** — `actions.ts` 가 자체 사본을 들고 있었고 거기에는 `.max()` 가
 * 하나도 없었다. `users.name` 은 varchar(50) 이라 51자 이름은 검증을 통과한 뒤 DB 가
 * 거부해 원인 불명의 500 이 됐다. 감사는 닫혔다고 기록됐지만 구멍은 그대로였다.
 *
 * 그래서 이 스위트는 **스키마가 아니라 액션을 부른다.** 사본이 다시 생기면 여기서 깨진다.
 */

const { mockGetUserByEmail, mockRoleFindFirst, mockTransaction, mockHash } = vi.hoisted(() => ({
  mockGetUserByEmail: vi.fn(),
  mockRoleFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockHash: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    role: { findFirst: mockRoleFindFirst },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/services/user.service', () => ({
  UserService: class {
    getUserByEmail = mockGetUserByEmail;
  },
}));

vi.mock('bcryptjs', () => ({ hash: mockHash }));

// 미인증 액션이라 IP 로 키잉된다. 레이트리밋 자체는 별도 스위트가 덮는다.
vi.mock('@/lib/action-helpers', () => ({ requireRateLimit: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerUser } from '../actions';

/** varchar 경계를 넘기는 문자열. */
const str = (n: number) => 'a'.repeat(n);

/** 정본 규칙(대/소/숫자/특수)을 만족하는 비밀번호. */
const VALID_PASSWORD = 'ValidPass1!';

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: '홍길동',
    email: 'user@example.com',
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
    accountType: 'ENGINEER',
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserByEmail.mockResolvedValue(null);
  mockRoleFindFirst.mockResolvedValue({ id: 'role-1', name: 'ENGINEER' });
  mockHash.mockResolvedValue('hashed');
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      user: { create: vi.fn().mockResolvedValue({ id: 'u-1' }) },
      userRole: { create: vi.fn() },
      userClient: { create: vi.fn() },
    })
  );
});

describe('registerUser — DB 컬럼 폭 경계', () => {
  /**
   * 이것이 이 파일의 존재 이유다. 상한이 없으면 여기서 통과해 DB 가 P2000 을 던지고,
   * 사용자에게는 "가입에 실패했습니다" 로만 보인다.
   */
  it('users.name(varchar 50) 을 넘는 이름을 거부한다', async () => {
    const result = await registerUser(form({ name: str(51) }));

    expect(result.success).toBe(false);
    // 검증에서 막혔으므로 DB 근처에도 가지 않아야 한다.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('50자 이름은 통과한다 — 경계를 과하게 좁히지 않았는지 함께 고정한다', async () => {
    const result = await registerUser(form({ name: str(50) }));

    expect(result.success).toBe(true);
  });

  it('users.email(varchar 255) 을 넘는 이메일을 거부한다', async () => {
    const longEmail = `${str(250)}@example.com`;
    const result = await registerUser(form({ email: longEmail }));

    expect(result.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('registerUser — 비밀번호 규칙은 정본과 같다', () => {
  // 비밀번호 변경 경로(`changePasswordSchema`)와 같은 `passwordSchema` 를 쓴다.
  // 두 경로가 갈리면 "가입은 되는데 같은 비밀번호로 변경은 안 되는" 상태가 생긴다.
  it.each([
    ['소문자 없음', 'VALIDPASS1!'],
    ['대문자 없음', 'validpass1!'],
    ['숫자 없음', 'ValidPass!!'],
    ['특수문자 없음', 'ValidPass11'],
    ['8자 미만', 'Va1!'],
  ])('%s 이면 거부한다', async (_label, password) => {
    const result = await registerUser(form({ password, confirmPassword: password }));

    expect(result.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('정본이 허용하는 넓은 특수문자 집합을 받아들인다', async () => {
    // 예전 사본은 특수문자를 `[@$!%*?&#]` 로 좁혀 두었다. 정본은 `^`·`(`·`_` 등을 포함한다.
    const password = 'Valid^Pass1';
    const result = await registerUser(form({ password, confirmPassword: password }));

    expect(result.success).toBe(true);
  });

  it('비밀번호 확인이 다르면 거부한다', async () => {
    const result = await registerUser(form({ confirmPassword: 'Different1!' }));

    expect(result.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('registerUser — 확장 필드', () => {
  it('고객사 담당자인데 고객사를 고르지 않으면 거부한다', async () => {
    const result = await registerUser(form({ accountType: 'CLIENT' }));

    expect(result.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('알 수 없는 accountType 을 거부한다', async () => {
    const result = await registerUser(form({ accountType: 'ADMIN' }));

    expect(result.success).toBe(false);
  });
});
