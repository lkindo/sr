import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { pushService, PushSubscriptionData } from '@/services/push.service';

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
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const result = subscriptionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: '잘못된 구독 데이터입니다.', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const subscription: PushSubscriptionData = result.data;
    const userAgent = request.headers.get('user-agent') || undefined;

    await pushService.saveSubscription(session.user.id, subscription, userAgent);

    return NextResponse.json({ message: '푸시 알림이 활성화되었습니다.' }, { status: 201 });
  } catch (error) {
    console.error('[API] Push subscribe error:', error);
    return NextResponse.json({ error: '푸시 구독 등록에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/push/subscribe - Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

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
  } catch (error) {
    console.error('[API] Push unsubscribe error:', error);
    return NextResponse.json({ error: '푸시 구독 해제에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * GET /api/push/subscribe - Get subscription status
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const subscriptions = await pushService.getUserSubscriptions(session.user.id);

    return NextResponse.json({
      isSubscribed: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
    });
  } catch (error) {
    console.error('[API] Push status error:', error);
    return NextResponse.json({ error: '구독 상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
