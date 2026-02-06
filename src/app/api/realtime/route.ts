import { NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import { REALTIME_EVENTS, realtimeEmitter } from '@/lib/realtime-events';

export const runtime = 'nodejs';

/**
 * GET /api/realtime - Server-Sent Events (SSE) 엔드포인트
 *
 * 클라이언트가 이 엔드포인트에 접속하여 실시간 이벤트를 수신합니다.
 */
export async function GET(request: NextRequest) {
  logger.info('[SSE] Client connected');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 이벤트 핸들러 정의
      const onSRUpdated = (data: any) => {
        logger.debug('[SSE] SR Updated event sent', { srId: data.id });
        controller.enqueue(
          encoder.encode(`event: ${REALTIME_EVENTS.SR_UPDATED}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const onSRCreated = (data: any) => {
        logger.debug('[SSE] SR Created event sent', { srId: data.id });
        controller.enqueue(
          encoder.encode(`event: ${REALTIME_EVENTS.SR_CREATED}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const onSRDeleted = (data: any) => {
        logger.debug('[SSE] SR Deleted event sent', { srId: data.id });
        controller.enqueue(
          encoder.encode(`event: ${REALTIME_EVENTS.SR_DELETED}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const onSRCommented = (data: any) => {
        logger.debug('[SSE] SR Commented event sent', { srId: data.srId });
        controller.enqueue(
          encoder.encode(
            `event: ${REALTIME_EVENTS.SR_COMMENTED}\ndata: ${JSON.stringify(data)}\n\n`
          )
        );
      };

      // 리스너 등록
      realtimeEmitter.on(REALTIME_EVENTS.SR_UPDATED, onSRUpdated);
      realtimeEmitter.on(REALTIME_EVENTS.SR_CREATED, onSRCreated);
      realtimeEmitter.on(REALTIME_EVENTS.SR_DELETED, onSRDeleted);
      realtimeEmitter.on(REALTIME_EVENTS.SR_COMMENTED, onSRCommented);

      // Keep-alive를 위한 주기적 핑
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);

      // 스트림이 닫힐 때 리스너 제거
      request.signal.addEventListener('abort', () => {
        logger.info('[SSE] Client disconnected (aborted)');
        clearInterval(keepAlive);
        realtimeEmitter.off(REALTIME_EVENTS.SR_UPDATED, onSRUpdated);
        realtimeEmitter.off(REALTIME_EVENTS.SR_CREATED, onSRCreated);
        realtimeEmitter.off(REALTIME_EVENTS.SR_DELETED, onSRDeleted);
        realtimeEmitter.off(REALTIME_EVENTS.SR_COMMENTED, onSRCommented);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
