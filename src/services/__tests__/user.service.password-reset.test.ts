import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { userUpdateSchema } from '@/lib/schemas';
import { UserService } from '@/services/user.service';

/**
 * 감사 3.17 회귀 테스트.
 *
 * `userUpdateSchema` 에 `password` 키가 없어 zod 가 알 수 없는 키로 조용히 제거했다.
 * 관리자가 잠긴 사용자의 비밀번호를 재설정하면 "수정되었습니다" 토스트가 뜨지만
 * 비밀번호는 그대로였고, 셀프 서비스 재설정도 없어 계정 복구 수단이 전무했다.
 */

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async (plain: string) => `hashed:${plain}`),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(prisma)),
  },
}));

vi.mock('@/services/audit.service', () => ({
  auditService: { createLog: vi.fn() },
}));

import { hash } from 'bcryptjs';

import { auditService } from '@/services/audit.service';

const VALID_PASSWORD = 'NewPass1!';

const existingUser = {
  id: 'u1',
  email: 'locked@example.com',
  name: '잠긴 사용자',
  password: 'old-hash',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [],
  clients: [],
};

describe('userUpdateSchema — password 필드', () => {
  it('password 를 조용히 제거하지 않는다', () => {
    const parsed = userUpdateSchema.parse({ name: '홍길동', password: VALID_PASSWORD });
    expect(parsed.password).toBe(VALID_PASSWORD);
  });

  it('password 는 선택 필드다 (비밀번호 없는 일반 수정은 그대로 통과)', () => {
    const parsed = userUpdateSchema.parse({ name: '홍길동' });
    expect(parsed.password).toBeUndefined();
  });

  it.each([
    ['짧음', 'Aa1!'],
    ['대문자 없음', 'newpass1!'],
    ['소문자 없음', 'NEWPASS1!'],
    ['숫자 없음', 'NewPass!!'],
    ['특수문자 없음', 'NewPass11'],
  ])('약한 비밀번호(%s)는 거부한다', (_label, weak) => {
    expect(userUpdateSchema.safeParse({ password: weak }).success).toBe(false);
  });
});

describe('UserService.updateUser — 비밀번호 재설정', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
    (prisma.user.findUnique as any).mockResolvedValue(existingUser);
    (prisma.user.update as any).mockResolvedValue({ ...existingUser, password: 'new-hash' });
  });

  it('평문이 아니라 해시를 저장한다', async () => {
    await userService.updateUser('u1', { password: VALID_PASSWORD }, 'admin-1');

    expect(hash).toHaveBeenCalledWith(VALID_PASSWORD, 12);

    const updateArgs = (prisma.user.update as any).mock.calls[0][0];
    expect(updateArgs.data.password).toBe(`hashed:${VALID_PASSWORD}`);
    expect(updateArgs.data.password).not.toBe(VALID_PASSWORD);
  });

  it('비밀번호가 없으면 password 를 건드리지 않는다', async () => {
    await userService.updateUser('u1', { name: '새 이름' }, 'admin-1');

    expect(hash).not.toHaveBeenCalled();
    const updateArgs = (prisma.user.update as any).mock.calls[0][0];
    expect(updateArgs.data).not.toHaveProperty('password');
    expect(updateArgs.data.name).toBe('새 이름');
  });

  it('반환값에 비밀번호를 포함하지 않는다', async () => {
    const result = await userService.updateUser('u1', { password: VALID_PASSWORD }, 'admin-1');

    expect(result).not.toHaveProperty('password');
  });

  it('감사 로그에 재설정 사실만 남기고 비밀번호/해시는 남기지 않는다', async () => {
    await userService.updateUser('u1', { password: VALID_PASSWORD }, 'admin-1');

    const logArgs = (auditService.createLog as any).mock.calls[0][1];
    expect(logArgs.changes.passwordReset).toBe(true);

    const serialized = JSON.stringify(logArgs);
    expect(serialized).not.toContain(VALID_PASSWORD);
    expect(serialized).not.toContain('hashed:');
  });

  it('비밀번호 없는 수정에는 passwordReset 플래그를 남기지 않는다', async () => {
    await userService.updateUser('u1', { name: '새 이름' }, 'admin-1');

    const logArgs = (auditService.createLog as any).mock.calls[0][1];
    expect(logArgs.changes.passwordReset).toBeUndefined();
  });
});
