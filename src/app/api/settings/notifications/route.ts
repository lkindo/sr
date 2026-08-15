import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { pushService } from '@/services/push.service';

/**
 * 감사 D-11: 예전에는 `auth()` 를 직접 부르고 광역 try/catch 로 모든 오류를 500 으로
 * 뭉갰다 — `parseJsonBody` 의 `BadRequestError`(400)까지 500 이 됐다.
 * 래퍼를 경유하지 않아 레이트리밋과 성능 계측(be-rules §1)도 빠져 있었다.
 */

const preferencesSchema = z.object({
  emailSRCreated: z.boolean().optional(),
  emailSRAssigned: z.boolean().optional(),
  emailSRStatusChanged: z.boolean().optional(),
  emailCommentAdded: z.boolean().optional(),
  pushSRCreated: z.boolean().optional(),
  pushSRAssigned: z.boolean().optional(),
  pushSRStatusChanged: z.boolean().optional(),
  pushCommentAdded: z.boolean().optional(),
});

/**
 * GET /api/settings/notifications - Get notification preferences
 */
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    const preferences = await pushService.getOrCreatePreferences(session.user.id);
    return NextResponse.json(preferences);
  },
  { preset: 'relaxed' }
);

/**
 * PUT /api/settings/notifications - Update notification preferences
 */
export const PUT = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  const body = await parseJsonBody(request);
  // ZodError 는 handleApiError 가 400 으로 매핑한다.
  const validated = preferencesSchema.parse(body);

  const preferences = await pushService.updatePreferences(session.user.id, validated);

  return NextResponse.json({
    message: '알림 설정이 저장되었습니다.',
    preferences,
  });
});
