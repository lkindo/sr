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

/**
 * 사용자별 동시 연결 상한.
 *
 * 탭을 여러 개 열면 각 탭이 연결을 하나씩 잡는다. 정상 사용은 몇 개 수준이지만
 * 상한이 없으면 계정 하나로 연결을 계속 열어 nginx worker_connections 와 Node 리스너를
 * 고갈시킬 수 있다(감사 D-7). nginx 는 `/api/realtime` 을 의도적으로 `limit_conn` 밖에
 * 두고 있어서 이 상한이 유일한 방어선이다.
 */
const MAX_CONNECTIONS_PER_USER = 6;

/** 프로세스 전역 상한. 개별 사용자 상한을 통과해도 전체 자원은 유한하다. */
const MAX_CONNECTIONS_TOTAL = 500;

/**
 * 연결의 절대 수명. 이 시간이 지나면 서버가 스트림을 닫고 클라이언트가 재연결한다.
 *
 * nginx `proxy_read_timeout` 이 1시간이라 그때까지는 유휴 연결도 살아남는다.
 * 수명을 두면 ① 누수된 연결이 영원히 남지 않고 ② 세션 권한 변경이 늦어도 이 주기 안에
 * 반영된다(재연결 시 `auth()` 를 다시 통과하므로).
 */
const CONNECTION_MAX_AGE_MS = 30 * 60 * 1000;

/** 사용자별 활성 연결 수. 프로세스 로컬이며, 다중 인스턴스에서는 인스턴스별로 센다. */
const activeConnections = new Map<string, number>();
let totalConnections = 0;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const userId = session.user.id;
  const userConnections = activeConnections.get(userId) ?? 0;

  if (userConnections >= MAX_CONNECTIONS_PER_USER || totalConnections >= MAX_CONNECTIONS_TOTAL) {
    logger.warn('[SSE] Connection limit reached', {
      userId,
      custom_userConnections: userConnections,
      custom_totalConnections: totalConnections,
    });
    // 503 을 준다 — 클라이언트의 백오프 재연결이 이 응답을 받고 물러섰다가 다시 온다.
    return NextResponse.json(
      { error: '실시간 연결 수가 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 }
    );
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

  activeConnections.set(userId, userConnections + 1);
  totalConnections++;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      /** 연결 정리는 abort·수명 만료 어느 쪽으로 와도 **정확히 한 번만** 일어나야 한다. */
      const release = (reason: string) => {
        if (closed) return;
        closed = true;
        logger.info('[SSE] Client disconnected', { userId, custom_reason: reason });

        const remaining = (activeConnections.get(userId) ?? 1) - 1;
        if (remaining > 0) activeConnections.set(userId, remaining);
        else activeConnections.delete(userId);
        totalConnections = Math.max(0, totalConnections - 1);

        clearInterval(keepAlive);
        clearTimeout(maxAgeTimer);
        realtimeEmitter.off(REALTIME_EVENTS.SR_UPDATED, onSRUpdated);
        realtimeEmitter.off(REALTIME_EVENTS.SR_CREATED, onSRCreated);
        realtimeEmitter.off(REALTIME_EVENTS.SR_DELETED, onSRDeleted);
        realtimeEmitter.off(REALTIME_EVENTS.SR_COMMENTED, onSRCommented);

        try {
          controller.close();
        } catch {
          // 이미 닫혔으면 무시한다.
        }
      };

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

      // 절대 수명. 만료되면 서버가 닫고 클라이언트가 백오프 없이 곧바로 재연결한다.
      const maxAgeTimer = setTimeout(() => release('max-age'), CONNECTION_MAX_AGE_MS);
      maxAgeTimer.unref?.();

      // 스트림이 닫힐 때(클라이언트 이탈) 리스너와 카운터를 정리한다.
      request.signal.addEventListener('abort', () => release('aborted'));
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
