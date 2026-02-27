'use server';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { isInternalUser } from '@/lib/policies';
import { ok, Result } from '@/lib/result';
import {
  ServiceCategoryService,
  serviceCategoryService,
} from '@/services/service-category.service';

type ServiceCategoryList = Awaited<ReturnType<ServiceCategoryService['getForSelection']>>;

export async function getServiceCategoriesForSelection(): Promise<Result<ServiceCategoryList>> {
  try {
    const session = await getAuthenticatedSession();

    // 내부 사용자는 모든 카테고리 조회 가능
    // 외부 사용자는 본인이 속한 고객사의 카테고리와 공통 카테고리만 조회 가능
    const isInternal = isInternalUser(session.user);
    const clientIds = isInternal ? undefined : (session.user.clientIds || []);

    const categories = await serviceCategoryService.getForSelection({ clientIds });
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}
