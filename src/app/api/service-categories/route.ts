import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { isInternalUser } from '@/lib/policies';
import { serviceCategoryService } from '@/services/service-category.service';

/**
 * GET /api/service-categories - 서비스 카테고리 조회
 *
 * 테넌트 스코핑(감사 4.1): 예전에는 인가 검사 없는 `withAuth` 로 `getAll()` 을 호출해
 * **전 고객사의 카테고리를 SLA·담당자 이메일과 함께** 모든 인증 사용자에게 반환했다.
 * 형제 라우트인 `/api/clients/[id]/categories` 는 처음부터 올바르게 스코프하고 있었다.
 *
 * - 내부 사용자(ADMIN/MANAGER/ENGINEER): 전체. 카테고리 관리 화면이 필요로 한다.
 * - 외부 사용자: 소속 고객사 + 글로벌 카테고리만, 활성 항목만, 담당자 이메일 제외.
 */
export const GET = withAuthAndRateLimit(async (_request: NextRequest, { session }) => {
  const internal = isInternalUser(session.user);

  const categories = await serviceCategoryService.getAll(
    internal
      ? { includeHandlerEmail: true }
      : { clientIds: session.user.clientIds ?? [], includeHandlerEmail: false }
  );

  return NextResponse.json(categories);
});
