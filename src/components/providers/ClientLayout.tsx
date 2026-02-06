'use client';

import { ReactNode, useState } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PWARegistration } from '@/components/providers/PWARegistration';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { Toaster } from '@/components/ui';

// Devtools를 전용 컴포넌트로 분리하여 HMR 안정성 확보
const QueryDevtools = dynamic(() => import('./QueryDevtools'), {
  ssr: false,
});

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
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
      <SessionProvider>
        <RealtimeProvider>
          {children}
          <Toaster />
          <PWARegistration />
        </RealtimeProvider>
      </SessionProvider>
      {process.env.NODE_ENV === 'development' && <QueryDevtools />}
    </QueryClientProvider>
  );
}
