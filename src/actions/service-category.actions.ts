"use server";

import { ServiceCategoryService } from "@/services/service-category.service";
import { Result, ok } from "@/lib/result";
import { errorToResult } from "@/lib/errors";

export async function getServiceCategoriesForSelection(): Promise<Result<any>> {
  try {
    const serviceCategoryService = new ServiceCategoryService();
    const categories = await serviceCategoryService.getAll();
    return ok(categories);
  } catch (error) {
    return errorToResult(error);
  }
}
