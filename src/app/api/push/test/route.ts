import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { pushService } from '@/services/push.service';

// Force refresh: 2025-12-07
export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 구독 정보 확인
    const subscriptions = await pushService.getUserSubscriptions(session.user.id);
    logger.debug(`[Test API] Found subscriptions for user`, {
      userId: session.user.id,
      custom_count: subscriptions.length,
    });

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No subscriptions found. Please enable push notifications in settings.' },
        { status: 404 }
      );
    }

    // 본인에게 테스트 알림 전송
    const results = await pushService.sendToUser(session.user.id, {
      title: '테스트 알림',
      body: '웹 푸시 알림이 정상적으로 작동합니다!',
      url: '/dashboard',
      tag: 'test-notification',
    });

    logger.debug('[Test API] Send results', { custom_count: results.length });
    return NextResponse.json({ success: true, count: subscriptions.length, results });
  } catch (error) {
    logger.error('Test push failed', error as Error);
    return NextResponse.json({ error: 'Failed to send test push' }, { status: 500 });
  }
}
