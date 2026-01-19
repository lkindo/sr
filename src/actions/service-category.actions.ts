'use server';

import { errorToResult } from '@/lib/errors';
import { ok, Result } from '@/lib/result';
import { ServiceCategoryService } from '@/services/service-category.service';

type ServiceCategoryList = Awaited<ReturnType<ServiceCategoryService['getAll']>>;

export async function getServiceCategoriesForSelection(): Promise<Result<ServiceCategoryList>> {
  try {
    const serviceCategoryService = new ServiceCategoryService();
    const categories = await serviceCategoryService.getAll();
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}
