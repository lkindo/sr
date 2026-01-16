import prisma from "@/lib/prisma";
import { getCachedData, CacheKeys } from "@/lib/redis-cache";

export class ServiceCategoryService {
  constructor() { }

  async getAll() {
    return getCachedData(
      CacheKeys.serviceCategoryList(),
      () => prisma.serviceCategory.findMany()
    );
  }
}
