import LoginForm, { type EmailVerificationNotice } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

const VERIFICATION_RESULTS: readonly EmailVerificationNotice[] = [
  'verified',
  'already',
  'expired',
  'invalid',
];

/** `?verified=` 는 이메일 인증 링크(/api/register/verify-email)가 돌려보낸 결과다(결정 D13 B+). */
function verificationNoticeOf(
  value: string | string[] | undefined
): EmailVerificationNotice | null {
  return VERIFICATION_RESULTS.find((result) => result === value) ?? null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { verified } = await searchParams;
  return <LoginForm verificationNotice={verificationNoticeOf(verified)} />;
}
