import { NextRequest, NextResponse } from 'next/server';
import { SRStatus } from '@prisma/client';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { statusLabelOf } from '@/lib/constants/sr';
import { statusActionSchema } from '@/lib/schemas';
import { srService } from '@/services/sr.service';

// PATCH /api/srs/[id]/status - SR 상태 전이 (Rate Limit: 표준)
//
// 인증/레이트리밋/에러→HTTP상태 매핑은 withAuthAndRateLimit + handleApiError 에 위임한다
// (과거: 수동 auth, 레이트리밋 없음, 모든 에러를 500+원시 error.message 로 노출).
// 실제 쓰기는 srService.updateSR 가 담당하며 낙관적 락/인가(ensureCanUpdateSR)/이벤트를 처리한다.
// (전이 규칙 자체는 상태머신과 일부 중복 — 완전 통합은 후속 리팩터로 남김.)
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

    // 현재 SR 조회
    const currentSR = await srService.getSRById(srId);
    if (!currentSR) {
      return NextResponse.json({ error: 'SR을 찾을 수 없습니다.' }, { status: 404 });
    }

    const currentStatus = currentSR.status;
    let newStatus: SRStatus;

    interface UpdateData {
      resolutionDescription?: string;
      rejectionReason?: string;
      expectedHoldReleaseDate?: string | null;
    }
    const updateData: UpdateData = {};

    // 액션에 따른 상태 전이 (사전조건 검사)
    switch (action) {
      case 'start':
        // INTAKE → IN_PROGRESS
        if (currentStatus !== 'INTAKE') {
          return NextResponse.json(
            { error: '접수 상태에서만 진행을 시작할 수 있습니다.' },
            { status: 400 }
          );
        }
        newStatus = 'IN_PROGRESS';
        break;

      case 'complete':
        // IN_PROGRESS → COMPLETED
        if (currentStatus !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: '진행중 상태에서만 완료 처리할 수 있습니다.' },
            { status: 400 }
          );
        }
        if (!resolutionDescription) {
          return NextResponse.json({ error: '해결 내용을 입력해주세요.' }, { status: 400 });
        }
        newStatus = 'COMPLETED';
        updateData.resolutionDescription = resolutionDescription;
        // completedAt 은 updateSR 가 COMPLETED 전이 시 직접 기록한다.
        break;

      case 'hold':
        // IN_PROGRESS → ON_HOLD (INTAKE에서는 보류 불가)
        if (currentStatus !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: '진행중 상태에서만 보류할 수 있습니다.' },
            { status: 400 }
          );
        }
        if (!reason) {
          return NextResponse.json({ error: '보류 사유를 입력해주세요.' }, { status: 400 });
        }
        // 헌법 §2: 보류는 사유 **와** 예상 해제일을 함께 명시한다.
        if (!expectedHoldReleaseDate) {
          return NextResponse.json({ error: '예상 해제일을 입력해주세요.' }, { status: 400 });
        }
        newStatus = 'ON_HOLD';
        updateData.expectedHoldReleaseDate = expectedHoldReleaseDate;
        break;

      case 'resume':
        // ON_HOLD → IN_PROGRESS
        if (currentStatus !== 'ON_HOLD') {
          return NextResponse.json(
            { error: '보류 상태에서만 재개할 수 있습니다.' },
            { status: 400 }
          );
        }
        newStatus = 'IN_PROGRESS';
        // 보류가 풀렸으므로 지난 약속을 비운다. 남겨 두면 진행중 SR 에 유효하지 않은
        // 해제 예정일이 붙어 있고, 다음 보류 때 그 값으로 필수 검사를 통과해 버린다.
        updateData.expectedHoldReleaseDate = null;
        break;

      case 'reject':
        // REQUESTED/INTAKE/ON_HOLD → REJECTED
        if (!['REQUESTED', 'INTAKE', 'ON_HOLD'].includes(currentStatus)) {
          return NextResponse.json(
            { error: '요청됨, 접수, 보류 상태에서만 거절할 수 있습니다.' },
            { status: 400 }
          );
        }
        if (!reason) {
          return NextResponse.json({ error: '거절 사유를 입력해주세요.' }, { status: 400 });
        }
        newStatus = 'REJECTED';
        updateData.rejectionReason = reason;
        break;

      case 'confirm':
        // COMPLETED → CONFIRMED (신청자만 가능)
        if (currentStatus !== 'COMPLETED') {
          return NextResponse.json(
            { error: '완료 상태에서만 확인할 수 있습니다.' },
            { status: 400 }
          );
        }
        if (currentSR.requesterId !== session.user.id) {
          return NextResponse.json({ error: '신청자만 확인할 수 있습니다.' }, { status: 403 });
        }
        newStatus = 'CONFIRMED';
        break;

      case 'reopen':
        // COMPLETED/CONFIRMED → IN_PROGRESS (7일 이내)
        if (!['COMPLETED', 'CONFIRMED'].includes(currentStatus)) {
          return NextResponse.json(
            { error: '완료 또는 확인완료 상태에서만 재오픈할 수 있습니다.' },
            { status: 400 }
          );
        }
        if (!reason) {
          return NextResponse.json({ error: '재오픈 사유를 입력해주세요.' }, { status: 400 });
        }
        // 7일 창 판정은 여기서 하지 않는다 — `validateStatusTransition` 이 단일 판정 지점이다.
        // 예전에는 라우트가 자체 사본을 들고 있었는데, 그 사본은 CONFIRMED 출발에도
        // completedAt 을 보고 completedAt 이 NULL 이면 통과시켰다(fail-open).
        // 사본을 두면 두 곳 중 하나만 고쳐지고 판정이 갈린다.
        newStatus = 'IN_PROGRESS';
        break;

      default:
        return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 });
    }

    // 상태 업데이트 (낙관적 락/인가/이벤트는 updateSR 가 처리; 오류는 handleApiError 로 전파)
    const result = await srService.updateSR(
      srId,
      {
        status: newStatus,
        changeReason:
          reason || `상태 변경: ${statusLabelOf(currentStatus)} → ${statusLabelOf(newStatus)}`,
        ...(updateData.resolutionDescription && {
          resolutionDescription: updateData.resolutionDescription,
        }),
        ...(updateData.rejectionReason && {
          rejectionReason: updateData.rejectionReason,
        }),
        // null(보류 해제)도 의미 있는 값이라 truthy 검사로 거르면 안 된다.
        ...(updateData.expectedHoldReleaseDate !== undefined && {
          expectedHoldReleaseDate: updateData.expectedHoldReleaseDate,
        }),
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
