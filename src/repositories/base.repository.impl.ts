import { BaseRepository } from './base.repository';
import { Prisma } from '@prisma/client';

/**
 * A generic base repository implementation for common CRUD operations.
 * It uses 'any' for the model type to pragmatically avoid complex Prisma delegate type issues
 * while still providing implementation inheritance for basic methods.
 */
export abstract class BaseRepositoryImpl<
  T,
  ID,
  CreateInput = Prisma.Exact<T, Prisma.Args<any, 'create'>['data']>,
  UpdateInput = Prisma.Exact<T, Prisma.Args<any, 'update'>['data']>
> implements BaseRepository<T, ID, CreateInput, UpdateInput>
{
  constructor(protected readonly model: any) {}

  async findById(id: ID): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany();
  }

  async create(data: CreateInput): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: ID, data: UpdateInput): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async delete(id: ID): Promise<T> {
    return this.model.delete({ where: { id } });
  }
}
