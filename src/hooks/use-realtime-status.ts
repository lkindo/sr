'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useRealtimeStatus() {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 인증되지 않았거나 이미 연결되어 있다면 패스
    if (status !== 'authenticated' || eventSourceRef.current) return;

    logger.info('[Realtime] Connecting to SSE...');
    const eventSource = new EventSource('/api/realtime');
    eventSourceRef.current = eventSource;

    // SR 업데이트 이벤트 처리
    eventSource.addEventListener('sr:updated', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] SR updated', { data });

        // React Query 캐시 초기화/갱신
        queryClient.invalidateQueries({ queryKey: ['srs'] });
        queryClient.invalidateQueries({ queryKey: ['sr', data.id] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

        // 알림 토스트 (선택 사항)
        toast({
          title: '실시간 업데이트',
          description: `SR #${data.srNumber}의 상태가 ${data.status}로 변경되었습니다.`,
        });
      } catch (err) {
        logger.error(
          '[Realtime] Error parsing SR update event',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    // SR 생성 이벤트 처리
    eventSource.addEventListener('sr:created', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] SR created', { data });

        queryClient.invalidateQueries({ queryKey: ['srs'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

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

    // 댓글 작성 이벤트 처리
    eventSource.addEventListener('sr:commented', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        logger.info('[Realtime] Comment added', { data });

        // 현재 보고 있는 SR의 댓글과 활동 내역 갱신
        if (data.srId) {
          queryClient.invalidateQueries({ queryKey: ['sr', data.srId, 'comments'] });
          queryClient.invalidateQueries({ queryKey: ['sr', data.srId, 'activities'] });
          // 목록에서 댓글 수 등이 표시된다면 목록도 갱신
          queryClient.invalidateQueries({ queryKey: ['srs'] });
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

    eventSource.onerror = (err) => {
      // Event 클래스는 Error가 아닐 수 있으므로 처리
      logger.error('[Realtime] SSE error', new Error('SSE connection error'));
      // 에러 발생 시 연결 닫기 (useEffect의 cleanup이 처리하도록 함)
    };

    return () => {
      logger.info('[Realtime] Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [queryClient, toast]);
}
