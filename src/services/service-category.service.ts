import prisma from '@/lib/prisma';
import { CacheKeys, getCachedData } from '@/lib/redis-cache';

export class ServiceCategoryService {
  constructor() {}

  async getAll() {
    return getCachedData(CacheKeys.serviceCategoryList(), () => prisma.serviceCategory.findMany());
  }
}
