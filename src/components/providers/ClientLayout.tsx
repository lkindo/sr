'use client';

import { ReactNode, useState } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PWARegistration } from '@/components/providers/PWARegistration';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { Toaster } from '@/components/ui';

// Devtools를 동적으로 임포트하여 초기 청크 크기를 줄이고 로딩 안정성을 높임
const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then((mod) => ({ default: mod.ReactQueryDevtools })),
  { ssr: false }
);

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
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
