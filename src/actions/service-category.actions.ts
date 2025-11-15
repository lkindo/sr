"use server";

import { ServiceCategoryService } from "@/services/service-category.service";
import { Result, ok } from "@/lib/result";
import { errorToResult } from "@/lib/errors";
import type { ServiceCategory } from "@prisma/client";

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
