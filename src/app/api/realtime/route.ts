import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { canReadSR, SRAccessFields } from '@/lib/policies';
import { REALTIME_EVENTS, realtimeEmitter } from '@/lib/realtime-events';
import type { AuthenticatedUser } from '@/types/session';

export const runtime = 'nodejs';

/**
 * GET /api/realtime - Server-Sent Events (SSE) 엔드포인트
 *
 * 클라이언트가 이 엔드포인트에 접속하여 실시간 이벤트를 수신합니다.
 *
 * 보안:
 * - 인증된 사용자만 접속 가능.
 * - 각 이벤트는 연결된 사용자의 권한(canReadSR)으로 연결별 필터링되어,
 *   자신이 접근할 수 없는 타 테넌트/미배정 SR 이벤트는 전송되지 않는다.
 * - 이벤트를 유발한 당사자(actorId)에게는 에코하지 않는다(중복 토스트/리페치 방지).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const viewer: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email || '',
    name: session.user.name,
    image: session.user.image,
    roles: session.user.roles || [],
    permissions: session.user.permissions || [],
    clientIds: session.user.clientIds || [],
  };

  logger.info('[SSE] Client connected', { userId: viewer.id });

  const encoder = new TextEncoder();

  /**
   * 이 연결이 해당 이벤트를 수신할 자격이 있는지 판정한다.
   * - 본인이 유발한 이벤트는 제외(에코 방지)
   * - SR 접근 권한(canReadSR) 기준으로 테넌트/역할 격리
   */
  const canReceive = (payload: any): boolean => {
    if (payload?.actorId && payload.actorId === viewer.id) return false;
    const srFields: SRAccessFields = {
      id: payload?.id ?? payload?.srId ?? '',
      clientId: payload?.clientId ?? '',
      requesterId: payload?.requesterId ?? null,
      assigneeId: payload?.assigneeId ?? null,
    };
    return canReadSR(viewer, srFields);
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      // 연결 직후 주석 프레임 하나를 즉시 흘린다.
      //
      // 아무것도 쓰지 않으면 응답 헤더가 첫 keep-alive(30초)까지 버퍼에 갇힌다.
      // 실측(프로덕션 빌드): 요청 +296ms → 응답 헤더 +30,372ms. 그동안 EventSource 는
      // onopen 을 못 받으므로 use-realtime-status.ts 의 연결 표시가 30초 늦게 켜지고,
      // 테스트가 응답을 기다리면 매번 30초를 태운다. 이벤트 전달 자체는 정상이었다 —
      // 첫 이벤트가 헤더를 함께 밀어냈기 때문에 증상이 '느린 연결 표시' 로만 보였다.
      //
      // `:` 로 시작하는 줄은 SSE 주석이라 클라이언트가 이벤트로 해석하지 않는다.
      // retry 를 함께 지정해 재연결 간격도 명시한다.
      controller.enqueue(encoder.encode(': connected\n\nretry: 3000\n\n'));

      const send = (eventName: string, data: any) => {
        if (closed || !canReceive(data)) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // 연결이 이미 닫힌 경우 등: 조용히 무시 (다음 abort 처리에서 정리됨)
        }
      };

      const onSRUpdated = (data: any) => {
        logger.debug('[SSE] SR Updated event', { srId: data?.id });
        send(REALTIME_EVENTS.SR_UPDATED, data);
      };
      const onSRCreated = (data: any) => {
        logger.debug('[SSE] SR Created event', { srId: data?.id });
        send(REALTIME_EVENTS.SR_CREATED, data);
      };
      const onSRDeleted = (data: any) => {
        logger.debug('[SSE] SR Deleted event', { srId: data?.id });
        send(REALTIME_EVENTS.SR_DELETED, data);
      };
      const onSRCommented = (data: any) => {
        logger.debug('[SSE] SR Commented event', { srId: data?.srId });
        send(REALTIME_EVENTS.SR_COMMENTED, data);
      };

      // 리스너 등록
      realtimeEmitter.on(REALTIME_EVENTS.SR_UPDATED, onSRUpdated);
      realtimeEmitter.on(REALTIME_EVENTS.SR_CREATED, onSRCreated);
      realtimeEmitter.on(REALTIME_EVENTS.SR_DELETED, onSRDeleted);
      realtimeEmitter.on(REALTIME_EVENTS.SR_COMMENTED, onSRCommented);

      // Keep-alive를 위한 주기적 핑
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          // 무시
        }
      }, 30000);

      // 스트림이 닫힐 때 리스너 제거
      request.signal.addEventListener('abort', () => {
        closed = true;
        logger.info('[SSE] Client disconnected (aborted)', { userId: viewer.id });
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
