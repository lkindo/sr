'use client';

import { ReactNode, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { IdleTimeoutProvider } from '@/components/providers/IdleTimeoutProvider';
import { PWARegistration } from '@/components/providers/PWARegistration';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { Toaster } from '@/components/ui';

// Devtools를 전용 컴포넌트로 분리하여 HMR 안정성 확보
const QueryDevtools = dynamic(() => import('./QueryDevtools'), {
  ssr: false,
});

interface ClientLayoutProps {
  children: ReactNode;
  /**
   * 서버에서 해석한 세션. `SessionProvider` 에 넘기지 않으면 클라이언트는 **항상 빈 세션으로
   * 시작해** `/api/auth/session` 응답이 올 때까지 모든 권한 검사가 false 다.
   *
   * 그 사이 `usePermissions()` 를 쓰는 화면이 전부 권한 없는 사용자처럼 그려진다 —
   * 상단 네비게이션의 '조직 관리'·'권한 관리'가 사라지고(Header.tsx:113), 사이드바 하위
   * 항목도 빠지며(Sidebar.tsx), `SRsDataTable` 은 ADMIN 을 고객 사용자로 취급한다.
   * 응답이 늦거나 실패하면 그 상태가 그대로 굳는다(감사 4.4).
   */
  session?: Session | null;
}

export default function ClientLayout({ children, session }: ClientLayoutProps) {
  // QueryClient를 상태로 관리하여 클라이언트 컴포넌트 내에서만 생성
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            gcTime: 5 * 60 * 1000, // 5분
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <RealtimeProvider>
          <IdleTimeoutProvider>
            {children}
            <Toaster />
            <PWARegistration />
          </IdleTimeoutProvider>
        </RealtimeProvider>
      </SessionProvider>
      {process.env.NODE_ENV === 'development' && <QueryDevtools />}
    </QueryClientProvider>
  );
}
