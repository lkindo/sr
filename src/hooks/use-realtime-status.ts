'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
/** 실시간 연결 상태. 화면이 "지금 갱신이 살아 있는가" 를 표시할 수 있게 노출한다. */
export type RealtimeConnectionState = 'connecting' | 'open' | 'disconnected';

/** 재연결 백오프(ms). 마지막 값에서 고정된다. jitter 를 더해 동시 재접속을 흩는다. */
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useRealtimeStatus(): { connectionState: RealtimeConnectionState } {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting');

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
    if (status !== 'authenticated') return;

    // 이 effect 가 정리된 뒤에 예약된 재연결이 살아나지 않게 한다.
    let cancelled = false;

    /**
     * SSE 연결을 만든다. 오류가 나면 스스로 다시 부른다.
     *
     * **왜 재연결 상태머신이 필요한가 (감사 D-7)**
     *
     * 예전에는 `onerror` 가 로그만 남기고 "cleanup 이 처리하도록 함" 이라고 적어 두었다.
     * 그런데 cleanup 은 effect 가 다시 돌거나 언마운트될 때만 실행되고, 연결 오류는
     * 둘 중 어느 것도 유발하지 않는다. 게다가 `eventSourceRef.current` 가 남아 있어
     * 위쪽 가드에 막혀 재생성도 되지 않았다.
     *
     * EventSource 는 스펙상 **non-200 응답을 받으면 영구 CLOSED** 가 된다. 그래서 배포
     * 중 nginx 가 수십 초간 502 를 주면, 열려 있던 **모든 탭이 새로고침 전까지 실시간
     * 갱신과 토스트를 조용히 잃었다.** 화면에 아무 표시가 없어 아무도 알아채지 못한다.
     */
    const connect = () => {
      if (cancelled) return;

      logger.info('[Realtime] Connecting to SSE...');
      setConnectionState('connecting');
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
        // 성공했으니 백오프를 처음으로 되돌린다. 그러지 않으면 한 번 끊긴 세션이
        // 이후 재연결마다 30초를 기다리게 된다.
        retryCountRef.current = 0;
        setConnectionState('open');
      };

      eventSource.onerror = () => {
        // Event 클래스는 Error 가 아닐 수 있으므로 직접 만든다.
        logger.error('[Realtime] SSE error', new Error('SSE connection error'));

        // **반드시 닫고 ref 를 비운다.** 스펙상 이 시점의 EventSource 는 이미 죽었고,
        // ref 를 남겨 두면 재연결 가드에 걸려 영영 되살아나지 못한다.
        eventSource.close();
        if (eventSourceRef.current === eventSource) eventSourceRef.current = null;

        if (cancelled) return;
        setConnectionState('disconnected');

        const attempt = retryCountRef.current;
        retryCountRef.current = attempt + 1;
        const base = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]!;
        // jitter: 배포로 전 클라이언트가 동시에 끊겼을 때 같은 순간에 몰려 오지 않게 흩는다.
        const delay = base + Math.floor(Math.random() * 1_000);

        logger.info('[Realtime] Scheduling SSE reconnect', {
          custom_attempt: attempt + 1,
          custom_delayMs: delay,
        });
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      logger.info('[Realtime] Closing SSE connection');
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [queryClient, toast, status, scheduleRefresh]);

  return { connectionState };
}
