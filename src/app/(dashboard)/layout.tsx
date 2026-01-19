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
      <Header user={user} />
      <MainContent>{children}</MainContent>
      <Footer />
    </div>
  );
}
