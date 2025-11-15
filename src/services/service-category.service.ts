import { ServiceCategoryRepository } from "@/repositories/service-category.repository";

export class ServiceCategoryService {
  constructor(
    private serviceCategoryRepository: ServiceCategoryRepository = new ServiceCategoryRepository()
  ) {}

  async getAll() {
    return this.serviceCategoryRepository.findAll();
  }
}
