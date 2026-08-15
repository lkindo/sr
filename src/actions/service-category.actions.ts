'use server';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { ensureCanReadClient, isInternalUser } from '@/lib/policies';
import { ok, Result } from '@/lib/result';
import {
  ServiceCategoryService,
  serviceCategoryService,
} from '@/services/service-category.service';
import type { AuthenticatedUser } from '@/types/session';

type ServiceCategoryList = Awaited<ReturnType<ServiceCategoryService['getForSelection']>>;

/**
 * SR 폼의 카테고리 드롭다운용 목록.
 *
 * `clientId` 를 넘기면 그 고객사의 카테고리(+전역 카테고리)만 돌려준다.
 *
 * **인자를 생략해도 전체가 나오지 않는다.** 예전에는 `if (clientId)` 로 인가 검사를
 * 감싸 두고 서비스에도 그대로 `undefined` 를 넘겼는데, 그 조합이 곧 "인가 검사를
 * 건너뛰고 전 고객사 카탈로그를 반환" 이었다(감사 D-13). 유효 세션을 가진
 * CLIENT_USER 가 이 액션을 인자 없이 호출하는 것만으로 타 고객사의 서비스 목록과
 * SLA 시간을 받아 갔다. REST 트윈(`/api/service-categories`)은 처음부터 옳게
 * 스코프하고 있어서 더 눈에 띄지 않았다.
 *
 * 이제 스코프는 **항상** 결정된다:
 *   - 내부 사용자(ADMIN/MANAGER/ENGINEER): 전체(`'all'`) — 카테고리 관리 화면이 필요로 한다.
 *   - 외부 사용자: 인자로 준 고객사(소속 검증 후) 또는 세션의 소속 고객사 전체.
 */
export async function getServiceCategoriesForSelection(
  clientId?: string
): Promise<Result<ServiceCategoryList>> {
  try {
    const session = await getAuthenticatedSession();

    if (clientId) {
      // 소속 검증: 외부 사용자가 임의 clientId 로 타 테넌트 카탈로그를 열람하지 못하게 한다.
      ensureCanReadClient(session.user, { id: clientId });
    }

    const scope = resolveSelectionScope(session.user, clientId);
    const categories = await serviceCategoryService.getForSelection(scope);
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}

/**
 * 이 호출에 적용할 카테고리 조회 스코프를 정한다.
 *
 * 외부 사용자에게 `clientIds: []` 가 되는 경우(소속 고객사가 하나도 없음)에는
 * 전역 카테고리만 보이며, 그것이 fail-closed 로 옳다 — 소속이 없는 사용자에게
 * 특정 고객사 카탈로그가 보일 이유가 없다.
 */
function resolveSelectionScope(
  user: AuthenticatedUser,
  clientId?: string
): { clientIds: string[] } | 'all' {
  if (isInternalUser(user)) return 'all';
  if (clientId) return { clientIds: [clientId] };
  return { clientIds: user.clientIds ?? [] };
}
