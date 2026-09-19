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

const {
  mockGetUserByEmail,
  mockRoleFindFirst,
  mockClientFindFirst,
  mockUserClientCreate,
  mockTransaction,
  mockHash,
  mockEnqueueVerification,
} = vi.hoisted(() => ({
  mockGetUserByEmail: vi.fn(),
  mockRoleFindFirst: vi.fn(),
  mockClientFindFirst: vi.fn(),
  mockUserClientCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockHash: vi.fn(),
  mockEnqueueVerification: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    role: { findFirst: mockRoleFindFirst },
    client: { findFirst: mockClientFindFirst },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/services/user.service', () => ({
  UserService: class {
    getUserByEmail = mockGetUserByEmail;
  },
}));

vi.mock('bcryptjs', () => ({ hash: mockHash }));

vi.mock('@/services/email-verification.service', () => ({
  enqueueEmailVerificationEmail: mockEnqueueVerification,
}));

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
  mockClientFindFirst.mockResolvedValue(null);
  mockHash.mockResolvedValue('hashed');
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      user: {
        create: vi.fn().mockResolvedValue({ id: 'u-1', email: 'user@example.com', name: '홍길동' }),
      },
      userRole: { create: vi.fn() },
      userClient: { create: mockUserClientCreate },
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

/**
 * 공개 고객사 목록은 내부 id 를 주지 않으므로 가입은 고객사 **코드**를 받는다(D14 A+).
 * 예전에는 받은 clientId 를 조회 없이 소속으로 만들어, 목록에 없는 비활성 고객사 id 를 직접 보내면
 * 그 고객사의 가입 신청이 생겼다.
 */
describe('registerUser — 고객사 코드 해석', () => {
  it('코드를 활성 고객사로 해석해 그 고객사에 승인 대기 소속을 만든다', async () => {
    mockClientFindFirst.mockResolvedValue({ id: 'client-1' });

    const result = await registerUser(form({ accountType: 'CLIENT', clientCode: 'C001' }));

    expect(result.success).toBe(true);
    expect(mockClientFindFirst).toHaveBeenCalledWith({
      where: { code: 'C001', isActive: true },
      select: { id: true },
    });
    expect(mockUserClientCreate).toHaveBeenCalledWith({
      data: { userId: 'u-1', clientId: 'client-1', status: 'PENDING' },
    });
  });

  it('없거나 비활성인 고객사 코드는 거부하고 계정을 만들지 않는다', async () => {
    mockClientFindFirst.mockResolvedValue(null);

    const result = await registerUser(form({ accountType: 'CLIENT', clientCode: 'GONE01' }));

    expect(result).toEqual({
      success: false,
      error: '선택한 고객사를 찾을 수 없습니다. 목록에서 다시 선택하세요.',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('예전 필드(clientId)만 보내면 고객사를 고르지 않은 것으로 본다', async () => {
    const result = await registerUser(form({ accountType: 'CLIENT', clientId: 'c-internal-id' }));

    expect(result.success).toBe(false);
    expect(mockClientFindFirst).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('기술 지원팀 가입은 고객사를 조회하지 않는다', async () => {
    const result = await registerUser(form({ accountType: 'ENGINEER' }));

    expect(result.success).toBe(true);
    expect(mockClientFindFirst).not.toHaveBeenCalled();
    expect(mockUserClientCreate).not.toHaveBeenCalled();
  });
});

/**
 * 가입 이메일 인증 링크(2026-09-18 소유자 결정 D13 B+). 계정과 같은 트랜잭션에 인증 메일을 적재해
 * "계정은 생겼는데 메일 기록은 없다" 가 생기지 않게 한다. 인증은 승인을 막지 않는다.
 */
describe('registerUser — 이메일 인증 링크', () => {
  it('가입한 계정의 인증 메일을 가입 트랜잭션 안에서 적재하고, 안내 문구로 알린다', async () => {
    const result = await registerUser(form({ accountType: 'ENGINEER' }));

    expect(result.success).toBe(true);
    expect(mockEnqueueVerification).toHaveBeenCalledTimes(1);
    const [tx, user] = mockEnqueueVerification.mock.calls[0]!;
    // 트랜잭션 콜백이 받은 tx 로 적재한다 — 전역 prisma 로 따로 쓰면 원자성이 깨진다.
    expect(tx).toHaveProperty('userRole');
    expect(user).toEqual({ id: 'u-1', email: 'user@example.com', name: '홍길동' });
    expect(result.message).toContain('확인 링크');
  });

  it('인증 메일 적재가 실패하면 가입도 실패로 알린다(트랜잭션이 함께 롤백된다)', async () => {
    mockEnqueueVerification.mockRejectedValueOnce(new Error('outbox down'));

    const result = await registerUser(form({ accountType: 'ENGINEER' }));

    expect(result).toEqual({ success: false, error: '회원가입 중 오류가 발생했습니다.' });
  });
});
