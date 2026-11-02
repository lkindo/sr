import { NextRequest, NextResponse } from 'next/server';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { statusLabelOf } from '@/lib/constants/sr';
import { canReadSR, ensureCanUpdateSR } from '@/lib/policies';
import { statusActionSchema } from '@/lib/schemas';
import { canConfirmAsAcceptor, planStatusAction } from '@/lib/sr-state-machine';
import { srService } from '@/services/sr.service';

// PATCH /api/srs/[id]/status - SR 상태 전이 (Rate Limit: 표준)
//
// 인증/레이트리밋/에러→HTTP상태 매핑은 withAuthAndRateLimit + handleApiError 에 위임한다.
// 액션 규칙은 상태 머신의 planStatusAction 이, 실제 쓰기와 낙관적 락, 이벤트는 srService.updateSR 가 맡는다.
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: srId } = await params;
    const body = await parseJsonBody(request);

    // 검증 실패 시 ZodError 를 던져 handleApiError 가 400 으로 매핑하게 한다.
    const { action, reason, resolutionDescription, expectedHoldReleaseDate } =
      statusActionSchema.parse(body);

    const currentSR = await srService.getSRById(srId);
    if (!currentSR) {
      return NextResponse.json({ error: 'SR을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 상태에 따라 갈리는 응답보다 먼저 확인한다. 뒤에 두면 권한 없는 사용자가 400 문구로
    // 다른 고객사 SR 의 상태를 알아낼 수 있다. 읽을 수 있는 사용자에게 상태는 비밀이 아니므로
    // "신청자만 확인할 수 있습니다." 같은 구체적인 안내를 그대로 받게 하고, 쓰기 권한은 updateSR 가 본다.
    if (!canReadSR(session.user, currentSR)) {
      ensureCanUpdateSR(session.user, currentSR);
    }

    const currentStatus = currentSR.status;
    const plan = planStatusAction(action, currentStatus, {
      reason,
      resolutionDescription,
      expectedHoldReleaseDate,
    });
    if (!plan.ok) {
      return NextResponse.json({ error: plan.message }, { status: 400 });
    }

    // 신원 판정은 상태 머신과 같은 함수를 쓴다(updateSR 의 validateTransition 이 한 번 더 본다).
    // 여기서 먼저 보는 이유는 신원 거부를 403 으로 돌려주기 위해서다.
    if (
      action === 'confirm' &&
      !canConfirmAsAcceptor(session.user, {
        ...currentSR,
        requesterIsInternal: await srService.isInternalRequester(currentSR.requesterId),
      })
    ) {
      return NextResponse.json({ error: '신청자만 확인할 수 있습니다.' }, { status: 403 });
    }

    const result = await srService.updateSR(
      srId,
      {
        status: plan.to,
        changeReason:
          reason || `상태 변경: ${statusLabelOf(currentStatus)} → ${statusLabelOf(plan.to)}`,
        ...plan.fields,
      },
      session.user
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: '상태가 변경되었습니다.',
    });
  },
  { preset: 'standard' }
);
