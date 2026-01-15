import prisma from "@/lib/prisma";

export class ServiceCategoryService {
  constructor() { }

  async getAll() {
    return prisma.serviceCategory.findMany();
  }
}
