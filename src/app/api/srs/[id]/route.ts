import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ensureCanReadSR } from '@/lib/policies';
import { srUpdateSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { srService } from '@/services/sr.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/srs/[id] - SR 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // Service 레이어를 통해 SR 조회
    const sr = await srService.getSRDetailsById(id);

    if (!sr) {
      throw new NotFoundError('SR');
    }

    // 권한 체크
    ensureCanReadSR(session.user, sr as any);

    // 디버깅 로그: SR 상세 조회 결과 확인 (개발 환경에서만 출력)
    logger.debug('[API /srs/[id]] SR 조회 성공', {
      srId: sr.id,
      custom_srNumber: sr.srNumber,
      custom_attachmentsCount: sr.attachments?.length,
    });

    // 날짜 객체를 문자열로 변환 (JSON 직렬화를 위해)
    const serialized = serializeResponse(sr);

    // 직렬화 후 attachments 확인 (개발 환경에서만 출력)
    logger.debug('[API /srs/[id]] 직렬화 후 attachments', {
      custom_exists: !!(serialized as Record<string, unknown>).attachments,
      custom_count: ((serialized as Record<string, unknown>).attachments as unknown[] | undefined)
        ?.length,
    });

    return NextResponse.json(serialized);
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/srs/[id] - SR 수정 (Rate Limit: 엄격)
// 권한 체크는 서비스 레이어에서 처리 (REQUESTED 상태: 요청자 또는 ADMIN, 기타: ADMIN만)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;
    const validated = await validateRequestBody(request, srUpdateSchema);

    // Service 레이어를 통해 SR 수정 (권한 체크 포함)
    const updatedSR = await srService.updateSR(id, validated, session.user);

    return NextResponse.json(updatedSR);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)

// DELETE /api/srs/[id] - SR 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // Service 레이어를 통해 SR 삭제
    const result = await srService.deleteSR(id, session.user);

    return NextResponse.json(result);
  },
  { preset: 'strict' }
); // 1분당 5회 (삭제는 민감한 작업)
