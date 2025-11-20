import { BaseRepository } from './base.repository';
import { SRActivity, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class SRActivityRepository extends BaseRepositoryImpl<SRActivity, string, Prisma.SRActivityUncheckedCreateInput, Prisma.SRActivityUncheckedUpdateInput> {
  constructor() {
    super(prisma.sRActivity);
  }

  async findDetailsById(id: string): Promise<SRActivity | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        sr: true,
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRActivityWhereInput;
    orderBy?: Prisma.SRActivityOrderByWithRelationInput;
  }): Promise<SRActivity[]> {
    const { skip, take, where, orderBy } = params || {};

    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        sr: true,
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  }

  // SRActivity 관련 커스텀 메서드들
  async findBySrId(srId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRActivityWhereInput;
    orderBy?: Prisma.SRActivityOrderByWithRelationInput;
  }): Promise<{ data: SRActivity[]; totalCount: number }> {
    const { skip, take, where = {}, orderBy = { createdAt: 'desc' } } = params || {};

    const whereWithSR: Prisma.SRActivityWhereInput = {
      ...where,
      srId,
    };

    const [data, totalCount] = await Promise.all([
      this.model.findMany({
        skip,
        take,
        where: whereWithSR,
        orderBy,
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      }),
      this.model.count({ where: whereWithSR }),
    ]);

    return { data, totalCount };
  }

  async createActivity(srId: string, userId: string, type: "CREATED" | "STATUS_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNED" | "REASSIGNED" | "COMMENTED" | "ATTACHMENT_ADDED" | "ATTACHMENT_REMOVED" | "REOPENED" | "COMPLETED" | "REJECTED", description: string, metadata?: Record<string, unknown>): Promise<SRActivity> {
    return this.model.create({
      data: {
        srId,
        userId,
        type,
        description,
        metadata: (metadata as Prisma.InputJsonValue) || {},
      },
    });
  }
}