'use server';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { ensureCanReadClient } from '@/lib/policies';
import { ok, Result } from '@/lib/result';
import {
  ServiceCategoryService,
  serviceCategoryService,
} from '@/services/service-category.service';

type ServiceCategoryList = Awaited<ReturnType<ServiceCategoryService['getForSelection']>>;

/**
 * SR 폼의 카테고리 드롭다운용 목록.
 *
 * `clientId` 를 넘기면 그 고객사의 카테고리(+전역 카테고리)만 돌려준다.
 * 넘기지 않으면 예전처럼 전체가 나오는데, 그건 **다른 고객사의 서비스 카탈로그가
 * 그대로 노출된다는 뜻**이었다(감사 3.19). 서버는 `ensureCategoryBelongsToClient` 로
 * 오염된 선택을 거부하지만, 그 전에 애초에 보이지 않아야 한다.
 *
 * 외부 사용자는 자기 소속 고객사만 조회할 수 있다.
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

    const categories = await serviceCategoryService.getForSelection(clientId);
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}
