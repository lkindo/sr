"use server";

import { ServiceCategoryService } from "@/services/service-category.service";

export async function getServiceCategoriesForSelection() {
  try {
    // No auth check needed for a simple selection list
    const serviceCategoryService = new ServiceCategoryService();
    const categories = await serviceCategoryService.getAll();
    return { success: true, data: categories };
  } catch (error) {
    return { success: false, error: "서비스 카테고리 목록을 불러오는데 실패했습니다." };
  }
}
