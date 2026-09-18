import type { Prisma } from '@prisma/client';

import {
  createEmailVerificationToken,
  EMAIL_VERIFICATION_TTL_HOURS,
  getEmailVerificationUrl,
  readEmailVerificationToken,
} from '@/lib/email-verification';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { emailService } from '@/services/email.service';
import { enqueueEmails } from '@/services/notification-outbox';

/**
 * 가입 이메일 인증(2026-09-18 소유자 결정 D13 B+). 토큰 규칙은 `src/lib/email-verification.ts` 에 있다.
 */

/**
 * 가입과 같은 트랜잭션에 인증 메일을 적재한다 — "계정은 생겼는데 메일 기록은 없다" 가 생기지 않는다.
 * 발송은 아웃박스 디스패처가 하고, 보낸 뒤에는 본문(링크)을 비운다.
 */
export async function enqueueEmailVerificationEmail(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; name: string }
): Promise<number> {
  const link = getEmailVerificationUrl(createEmailVerificationToken(user.id, user.email));
  return enqueueEmails(
    [
      {
        ...emailService.buildEmailVerification(
          user.email,
          user.name,
          link,
          EMAIL_VERIFICATION_TTL_HOURS
        ),
        metadata: { userId: user.id, kind: 'email-verification' },
      },
    ],
    tx
  );
}

/** 인증 결과. 로그인 화면의 안내 문구가 이 값으로 갈린다(`/login?verified=`). */
export type EmailVerificationResult = 'verified' | 'already' | 'expired' | 'invalid';

/**
 * 링크의 토큰을 확인하고 이메일을 인증 처리한다.
 * 계정이 없거나, 이메일이 바뀌었으면(토큰에 서명된 이메일과 다르면) `invalid` 다.
 */
export async function verifyEmailToken(
  token: string,
  now = new Date()
): Promise<EmailVerificationResult> {
  const read = readEmailVerificationToken(token, now.getTime());
  if (read.status !== 'valid') return read.status;

  const user = await prisma.user.findUnique({
    where: { id: read.userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user || user.email.trim().toLowerCase() !== read.email) return 'invalid';
  if (user.emailVerified) return 'already';

  // 동시에 두 번 열어도 처음 시각을 지킨다.
  await prisma.user.updateMany({
    where: { id: user.id, emailVerified: null },
    data: { emailVerified: now },
  });
  logger.info('[EmailVerification] 이메일 인증 완료', { custom_userId: user.id });
  return 'verified';
}
