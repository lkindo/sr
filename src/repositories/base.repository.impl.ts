import { BaseRepository } from './base.repository';
import { Prisma } from '@prisma/client';

/**
 * Prisma Delegate Interface
 * Defines the standard CRUD methods expected from a Prisma model delegate.
 */
export interface PrismaDelegate<T, CreateInput, UpdateInput> {
  findUnique<R = T>(args: { where: any; include?: any; select?: any }): Promise<R | null>;
  findFirst<R = T>(args?: { where?: any; orderBy?: any; include?: any; select?: any }): Promise<R | null>;
  findMany<R = T>(args?: { where?: any; orderBy?: any; skip?: number; take?: number; include?: any; select?: any }): Promise<R[]>;
  create<R = T>(args: { data: CreateInput; include?: any; select?: any }): Promise<R>;
  update<R = T>(args: { where: any; data: UpdateInput; include?: any; select?: any }): Promise<R>;
  delete<R = T>(args: { where: any; include?: any; select?: any }): Promise<R>;
  count(args?: { where?: any }): Promise<number>;
  groupBy(args: any): Promise<any>;
}

/**
 * A generic base repository implementation for common CRUD operations.
 * Uses a generic PrismaDelegate to ensure type safety.
 */
export abstract class BaseRepositoryImpl<
  T,
  ID,
  CreateInput = unknown,
  UpdateInput = unknown
> implements BaseRepository<T, ID, CreateInput, UpdateInput> {
  constructor(protected readonly model: PrismaDelegate<T, CreateInput, UpdateInput>) { }

  async findById(id: ID): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany({});
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
