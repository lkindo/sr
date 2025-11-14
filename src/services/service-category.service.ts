import { ServiceCategoryRepository } from "@/repositories/service-category.repository";

export class ServiceCategoryService {
  private serviceCategoryRepository: ServiceCategoryRepository;

  constructor() {
    this.serviceCategoryRepository = new ServiceCategoryRepository();
  }

  async getAll() {
    return this.serviceCategoryRepository.findAll();
  }
}
