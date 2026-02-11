'use server';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { ok, Result } from '@/lib/result';
import {
  ServiceCategoryService,
  serviceCategoryService,
} from '@/services/service-category.service';

type ServiceCategoryList = Awaited<ReturnType<ServiceCategoryService['getForSelection']>>;

export async function getServiceCategoriesForSelection(): Promise<Result<ServiceCategoryList>> {
  try {
    await getAuthenticatedSession();

    const categories = await serviceCategoryService.getForSelection();
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}
