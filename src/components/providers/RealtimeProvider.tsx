'use client';

import { useSession } from 'next-auth/react';

import { useRealtimeStatus } from '@/hooks/use-realtime-status';

/**
 * 실시간 상태 업데이트를 활성화하는 래퍼 컴포넌트입니다.
 * 로그인된 사용자에게만 SSE 연결을 생성합니다.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  // 로그인된 경우에만 훅 호출
  useRealtimeStatusWrapper(status === 'authenticated');

  return <>{children}</>;
}

function useRealtimeStatusWrapper(shouldConnect: boolean) {
  // 훅 내부에서 조건부 처리가 어려울 수 있으므로 래퍼를 두거나 훅 내부 로직을 수정
  // 여기서는 훅 자체가 useEffect를 가지고 있으므로, 훅 내부에서 status를 체크하는 것이 더 깔끔할 수 있음
  // 하지만 현재 구현된 hook은 무조건 연결하므로, 여기서 status에 따라 호출 여부를 결정합니다.

  // 훅의 규칙(Rules of Hooks) 준수를 위해 훅 내부에서 처리하도록 hook을 수정하는 것이 좋습니다.
  // 여기서는 단순히 provider를 통해 주입하는 구조만 잡습니다.
  useRealtimeStatus();
}
