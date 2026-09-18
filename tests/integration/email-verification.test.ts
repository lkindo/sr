import { beforeAll, beforeEach, expect, it } from 'vitest';

import { createEmailVerificationToken } from '@/lib/email-verification';
import prisma from '@/lib/prisma';
import { verifyEmailToken } from '@/services/email-verification.service';

import { createUserRow, describeDb, resetDatabase } from './helpers';

/**
 * 가입 이메일 인증(2026-09-18 소유자 결정 D13 B+) — 실제 쿼리로 확인한다.
 * 처음 열면 확인 시각을 남기고, 다시 열어도 처음 시각을 지키며, 이메일이 바뀐 뒤의 링크는 쓸 수 없다.
 */
describeDb('가입 이메일 인증', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ||= 'integration-secret-for-email-verification-0123';
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('처음 열면 확인 시각을 기록하고, 다시 열면 already 로 처음 시각을 지킨다', async () => {
    const user = await createUserRow({ email: 'Signup@Example.com', isActive: false });
    const token = createEmailVerificationToken(user.id, user.email);
    const first = new Date('2026-09-19T01:00:00.000Z');

    expect(await verifyEmailToken(token, first)).toBe('verified');
    expect(await verifyEmailToken(token, new Date('2026-09-19T02:00:00.000Z'))).toBe('already');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.emailVerified?.toISOString()).toBe(first.toISOString());
  });

  it('이메일이 바뀐 뒤의 링크는 invalid 이고 아무것도 기록하지 않는다', async () => {
    const user = await createUserRow({ email: 'old@example.com' });
    const token = createEmailVerificationToken(user.id, 'old@example.com');
    await prisma.user.update({ where: { id: user.id }, data: { email: 'new@example.com' } });

    expect(await verifyEmailToken(token)).toBe('invalid');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.emailVerified).toBeNull();
  });
});
