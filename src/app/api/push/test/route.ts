import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { pushService } from '@/services/push.service';

/**
 * 감사 D-11: 예전에는 `auth()` 를 직접 부르고 광역 try/catch 로 모든 오류를 500 으로
 * 뭉갰다. 래퍼를 경유하지 않아 레이트리밋도 성능 계측(be-rules §1)도 없었다.
 * 테스트 발송은 외부 푸시 서비스를 때리므로 레이트리밋이 특히 필요한 경로다.
 */
export const POST = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    const subscriptions = await pushService.getUserSubscriptions(session.user.id);
    logger.debug(`[Test API] Found subscriptions for user`, {
      userId: session.user.id,
      custom_count: subscriptions.length,
    });

    if (subscriptions.length === 0) {
      // 404 를 직접 만들지 않고 던진다 — handleApiError 가 상태 코드로 옮긴다.
      throw new NotFoundError('푸시 구독');
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
  },
  { preset: 'strict' }
);
