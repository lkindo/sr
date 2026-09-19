import { notFound } from 'next/navigation';

import { auth } from '@/auth';

/**
 * 감사 로그 화면의 서버 측 접근 가드(결정 D11). 알림 발송 이력 화면과 같은 이유로 ADMIN 이 아니면 화면의
 * 존재 자체를 드러내지 않는다 — 전 고객사의 관리 행위와 변경 전후 값을 다룬다. 실제 데이터 보호는 API 의
 * ADMIN 검사(policies.ensureCanViewAuditLogs)가 한다. 이건 그 앞의 한 겹이다.
 */
export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.roles?.includes('ADMIN')) {
    notFound();
  }

  return <>{children}</>;
}
