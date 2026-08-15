import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { pushService, PushSubscriptionData } from '@/services/push.service';

/**
 * 이 라우트는 예전에 `auth()` 를 직접 부르고 광역 try/catch 로 모든 오류를 500 으로
 * 뭉갰다(감사 D-11). 그래서 `parseJsonBody` 가 던지는 `BadRequestError`(400)가 500 이 되어
 * 클라이언트 재시도 로직과 모니터링 알람이 오작동했다. 또 래퍼를 경유하지 않아
 * 레이트리밋도, 성능 계측(be-rules §1)도 걸리지 않았다.
 *
 * 이제 `withAuthAndRateLimit` 이 인증·레이트리밋·에러 매핑·계측을 모두 맡는다 —
 * 핸들러는 던지기만 하면 `handleApiError` 가 상태 코드로 옮긴다.
 */

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * POST /api/push/subscribe - Register a push subscription
 */
export const POST = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  const body = await parseJsonBody(request);
  // ZodError 는 handleApiError 가 400 으로 매핑한다.
  const subscription: PushSubscriptionData = subscriptionSchema.parse(body);
  const userAgent = request.headers.get('user-agent') || undefined;

  await pushService.saveSubscription(session.user.id, subscription, userAgent);

  return NextResponse.json({ message: '푸시 알림이 활성화되었습니다.' }, { status: 201 });
});

/**
 * DELETE /api/push/subscribe - Unsubscribe from push notifications
 */
export const DELETE = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (endpoint) {
    // Remove specific subscription (호출자 소유 구독만 삭제 — IDOR 방지)
    await pushService.removeSubscription(endpoint, session.user.id);
  } else {
    // Remove all subscriptions for the user
    await pushService.removeUserSubscriptions(session.user.id);
  }

  return NextResponse.json({ message: '푸시 알림이 비활성화되었습니다.' }, { status: 200 });
});

/**
 * GET /api/push/subscribe - Get subscription status
 */
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    const subscriptions = await pushService.getUserSubscriptions(session.user.id);

    return NextResponse.json({
      isSubscribed: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
    });
  },
  { preset: 'relaxed' }
);
