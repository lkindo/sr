import { BaseRepository } from './base.repository';
import { Prisma } from '@prisma/client';

/**
 * Prisma Delegate 타입 (모델별 CRUD 메서드를 포함)
 */
type PrismaDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<unknown>;
  findMany: (args?: unknown) => Promise<unknown[]>;
  create: (args: { data: unknown }) => Promise<unknown>;
  update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
};

/**
 * A generic base repository implementation for common CRUD operations.
 * Prisma delegate 타입을 사용하여 타입 안정성을 확보합니다.
 */
export abstract class BaseRepositoryImpl<
  T,
  ID,
  CreateInput = Prisma.Exact<T, Prisma.Args<PrismaDelegate, 'create'>['data']>,
  UpdateInput = Prisma.Exact<T, Prisma.Args<PrismaDelegate, 'update'>['data']>
> implements BaseRepository<T, ID, CreateInput, UpdateInput>
{
  constructor(protected readonly model: PrismaDelegate) {}

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
