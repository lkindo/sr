import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 가입 이메일 인증 처리(2026-09-18 소유자 결정 D13 B+).
 * 토큰 규칙은 lib 테스트가, 여기서는 "계정과 맞춰 보고 기록한다" 를 본다.
 */
const { findUnique, updateMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique, updateMany } },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createEmailVerificationToken } from '@/lib/email-verification';
import {
  enqueueEmailVerificationEmail,
  verifyEmailToken,
} from '@/services/email-verification.service';

const NOW = new Date('2026-09-19T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = 'test-secret-for-email-verification-0123456789';
  updateMany.mockResolvedValue({ count: 1 });
});

function tokenFor(userId = 'user-1', email = 'hong@example.com') {
  return createEmailVerificationToken(userId, email, NOW.getTime() - 60_000);
}

describe('verifyEmailToken', () => {
  it('처음 열면 인증 시각을 기록하고 verified 다', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', email: 'hong@example.com', emailVerified: null });

    expect(await verifyEmailToken(tokenFor(), NOW)).toBe('verified');
    // 동시에 두 번 열어도 처음 시각을 지키도록 아직 비어 있는 행만 바꾼다.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailVerified: null },
      data: { emailVerified: NOW },
    });
  });

  it('이메일 대소문자가 달라도 같은 주소로 본다', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', email: 'Hong@Example.com', emailVerified: null });

    expect(await verifyEmailToken(tokenFor('user-1', 'hong@example.com'), NOW)).toBe('verified');
  });

  it('이미 인증된 계정은 다시 기록하지 않고 already 다', async () => {
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'hong@example.com',
      emailVerified: new Date('2026-09-18T00:00:00Z'),
    });

    expect(await verifyEmailToken(tokenFor(), NOW)).toBe('already');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('이메일이 바뀐 뒤의 링크는 invalid 다 — 예전 주소로 새 주소를 인증할 수 없다', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', email: 'new@example.com', emailVerified: null });

    expect(await verifyEmailToken(tokenFor('user-1', 'old@example.com'), NOW)).toBe('invalid');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('계정이 없으면 invalid 다', async () => {
    findUnique.mockResolvedValue(null);

    expect(await verifyEmailToken(tokenFor(), NOW)).toBe('invalid');
  });

  it('만료되거나 위조된 토큰은 DB 를 보지 않는다', async () => {
    const expired = createEmailVerificationToken(
      'user-1',
      'hong@example.com',
      NOW.getTime() - 25 * 60 * 60 * 1000
    );

    expect(await verifyEmailToken(expired, NOW)).toBe('expired');
    expect(await verifyEmailToken('forged.token', NOW)).toBe('invalid');
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('enqueueEmailVerificationEmail', () => {
  it('가입과 같은 트랜잭션의 아웃박스에 인증 링크 메일 한 통을 적재한다', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { notification: { createMany } };

    await enqueueEmailVerificationEmail(tx as never, {
      id: 'user-1',
      email: 'hong@example.com',
      name: '<홍길동>',
    });

    const [row] = createMany.mock.calls[0]![0].data;
    expect(row).toMatchObject({
      type: 'EMAIL',
      status: 'PENDING',
      recipient: 'hong@example.com',
      subject: '[SR System] 이메일 주소를 확인해 주세요',
      metadata: { userId: 'user-1', kind: 'email-verification' },
    });
    expect(row.content).toContain('/api/register/verify-email?token=');
    // 가입자가 입력한 이름은 이스케이프한다.
    expect(row.content).toContain('&lt;홍길동&gt;');
    expect(row.content).not.toContain('<홍길동>');
  });
});
