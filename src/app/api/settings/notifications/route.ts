import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/auth';
import { pushService } from '@/services/push.service';

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
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const preferences = await pushService.getOrCreatePreferences(session.user.id);

    return NextResponse.json(preferences);
  } catch (error) {
    console.error('[API] Get notification preferences error:', error);
    return NextResponse.json({ error: '알림 설정 조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/notifications - Update notification preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const result = preferencesSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: '잘못된 설정 데이터입니다.', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const preferences = await pushService.updatePreferences(session.user.id, result.data);

    return NextResponse.json({
      message: '알림 설정이 저장되었습니다.',
      preferences,
    });
  } catch (error) {
    console.error('[API] Update notification preferences error:', error);
    return NextResponse.json({ error: '알림 설정 저장에 실패했습니다.' }, { status: 500 });
  }
}
