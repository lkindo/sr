'use client';

import { useSession } from 'next-auth/react';

import { useRealtimeStatus } from '@/hooks/use-realtime-status';

/**
 * 실시간 상태 업데이트를 활성화하는 래퍼 컴포넌트입니다.
 * 로그인된 사용자에게만 SSE 연결을 생성합니다.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  // 훅 내부에서 useSession()을 통해 인증 상태를 체크하므로 별도 로직 불필요
  useRealtimeStatus();

  return <>{children}</>;
}
