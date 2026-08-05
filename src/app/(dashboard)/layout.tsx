import { auth } from '@/auth';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { convertSessionToPlainObject } from '@/lib/utils';
import type { AuthenticatedUser } from '@/types/session';

import MainContent from './MainContent';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // session.user 객체를 순수한 객체로 변환
  const user = convertSessionToPlainObject(session) as AuthenticatedUser | undefined;

  return (
    <div className="relative flex min-h-screen flex-col">
      {/*
        키보드 사용자가 헤더와 사이드바 전체를 탭으로 지나지 않고 본문으로 갈 수 있게
        한다(감사 4.4). 포커스를 받기 전에는 화면 밖에 있으므로 시각적으로는 보이지 않는다.
        DOM 의 첫 자식이어야 첫 번째 탭에서 잡힌다.
      */}
      <a href="#main-content" className="sr-skip-link">
        본문으로 건너뛰기
      </a>
      <Header user={user} />
      <MainContent>{children}</MainContent>
      <Footer />
    </div>
  );
}
