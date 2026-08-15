import { notFound } from 'next/navigation';

import { auth } from '@/auth';

/**
 * 알림 발송 이력 화면의 서버 측 접근 가드.
 *
 * 화면 자체는 클라이언트 컴포넌트라 그 안에서는 세션을 신뢰할 수 없다. 형제 화면인
 * 시스템 설정은 API 403 에만 의존하는데, 그러면 권한 없는 사용자에게도 **화면 골격과
 * 메뉴 구조가 먼저 그려진 뒤** 오류가 뜬다 — 이 화면은 전 고객사의 수신자 이메일을
 * 다루므로 존재 자체를 노출하지 않는 편이 낫다.
 *
 * `notFound()` 를 쓰는 이유: 403 은 "여기 뭔가 있다" 를 알려 준다. 관리자 전용 운영
 * 화면은 없는 것처럼 보이는 쪽이 맞다. 실제 데이터 보호는 API 의 ADMIN 검사가 한다 —
 * 이건 그 앞에 두는 한 겹이지 대체물이 아니다.
 */
export default async function OutboxLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.roles?.includes('ADMIN')) {
    notFound();
  }

  return <>{children}</>;
}
