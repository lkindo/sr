import { BaseRepository } from './base.repository';
import { Prisma } from '@prisma/client';

/**
 * Prisma Delegate 타입 (모델별 CRUD 메서드를 포함)
 */
type PrismaDelegate = any;

/**
 * A generic base repository implementation for common CRUD operations.
 * Prisma delegate 타입을 사용하여 타입 안정성을 확보합니다.
 */
export abstract class BaseRepositoryImpl<
  T,
  ID,
  CreateInput = unknown,
  UpdateInput = unknown
> implements BaseRepository<T, ID, CreateInput, UpdateInput>
{
  constructor(protected readonly model: PrismaDelegate) {}

  async findById(id: ID): Promise<T | null> {
    return (await this.model.findUnique({ where: { id: id as string } })) as T | null;
  }

  async findAll(): Promise<T[]> {
    return (await this.model.findMany()) as T[];
  }

  async create(data: CreateInput): Promise<T> {
    return (await this.model.create({ data })) as T;
  }

  async update(id: ID, data: UpdateInput): Promise<T> {
    return (await this.model.update({ where: { id: id as string }, data })) as T;
  }

  async delete(id: ID): Promise<T> {
    return (await this.model.delete({ where: { id: id as string } })) as T;
  }
}
