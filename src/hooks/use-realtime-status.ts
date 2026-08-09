'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';
import { statusLabelOf } from '@/lib/constants/sr';
import { logger } from '@/lib/logger';

/**
 * SSE 로 서버 이벤트를 받아 화면을 갱신한다.
 *
 * **왜 `router.refresh()` 가 필요한가 (감사 3.26)**
 *
 * SR 목록(`/srs`)과 대시보드는 서버 컴포넌트가 데이터를 가져와 props 로 내려주는 SSR
 * 화면이다. React Query 캐시에는 그 데이터가 아예 들어 있지 않다.
 * 그래서 `invalidateQueries({ queryKey: ['srs'] })` / `['dashboard-stats']` 는
 * **어떤 쿼리와도 매칭되지 않는 무동작**이었다 — 실시간 갱신이 토스트만 띄우고
 * 정작 목록은 그대로였던 이유다.
 *
 * 실제로 등록된 쿼리 키는 `['sr', srId]`, `['sr', srId, 'comments']`,
 * `['sr', srId, 'activities']`(`use-sr.ts`, `use-sr-infinite.ts`) 뿐이다.
 * 따라서 클라이언트 캐시는 그 키들만 무효화하고, 서버가 렌더한 화면은
 * `router.refresh()` 로 다시 가져온다.
 */
export function useRealtimeStatus() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 서버 컴포넌트 재요청. 이벤트가 몰아칠 때 매번 부르면 서버를 때리므로 짧게 묶는다.
   */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      router.refresh();
    }, 300);
  }, [router]);

  useEffect(() => {
    // 인증되지 않았거나 이미 연결되어 있다면 패스
    if (status !== 'authenticated' || eventSourceRef.current) return;

    logger.info('[Realtime] Connecting to SSE...');
    const eventSource = new EventSource('/api/realtime');
    eventSourceRef.current = eventSource;

    // SR 업데이트 이벤트 처리
    eventSource.addEventListener('sr:updated', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] SR updated', { data });

        // 실제로 등록된 클라이언트 쿼리만 무효화한다.
        if (data.id) {
          queryClient.invalidateQueries({ queryKey: ['sr', data.id] });
        }
        // SSR 화면(목록·대시보드·상세 헤더)은 서버에서 다시 렌더해야 반영된다.
        scheduleRefresh();

        // 알림 토스트 (선택 사항)
        toast({
          title: '실시간 업데이트',
          description: `SR #${data.srNumber}의 상태가 ${statusLabelOf(data.status)}(으)로 변경되었습니다.`,
        });
      } catch (err) {
        logger.error(
          '[Realtime] Error parsing SR update event',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    // SR 생성 이벤트 처리
    eventSource.addEventListener('sr:created', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] SR created', { data });

        scheduleRefresh();

        toast({
          title: '새로운 SR 등록',
          description: `새로운 SR #${data.srNumber}가 등록되었습니다.`,
        });
      } catch (err) {
        logger.error(
          '[Realtime] Error parsing SR create event',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    // SR 삭제 이벤트 처리 (다른 사용자가 삭제한 SR을 목록/상세에서 제거)
    eventSource.addEventListener('sr:deleted', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] SR deleted', { data });

        if (data.id) {
          queryClient.removeQueries({ queryKey: ['sr', data.id] });
        }
        scheduleRefresh();

        toast({
          title: 'SR 삭제됨',
          description: `SR #${data.srNumber}가 삭제되었습니다.`,
        });
      } catch (err) {
        logger.error(
          '[Realtime] Error parsing SR delete event',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    // 댓글 작성 이벤트 처리
    eventSource.addEventListener('sr:commented', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] Comment added', { data });

        // 댓글·활동 내역은 클라이언트 쿼리로 관리되므로 무효화가 실제로 동작한다.
        if (data.srId) {
          queryClient.invalidateQueries({ queryKey: ['sr', data.srId, 'comments'] });
          queryClient.invalidateQueries({ queryKey: ['sr', data.srId, 'activities'] });
          // 목록의 댓글 수 배지는 SSR 이므로 서버 렌더를 다시 받아야 한다.
          scheduleRefresh();
        }
      } catch (err) {
        logger.error(
          '[Realtime] Error parsing comment event',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    eventSource.onopen = () => {
      logger.info('[Realtime] SSE connection opened');
    };

    eventSource.onerror = () => {
      // Event 클래스는 Error가 아닐 수 있으므로 처리
      logger.error('[Realtime] SSE error', new Error('SSE connection error'));
      // 에러 발생 시 연결 닫기 (useEffect의 cleanup이 처리하도록 함)
    };

    return () => {
      logger.info('[Realtime] Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [queryClient, toast, status, scheduleRefresh]);
}
