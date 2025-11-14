import { BaseRepository } from './base.repository';
import { SRActivity, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class SRActivityRepository implements BaseRepository<SRActivity, string, Prisma.SRActivityUncheckedCreateInput, Prisma.SRActivityUncheckedUpdateInput> {
  async findById(id: string): Promise<SRActivity | null> {
    return prisma.sRActivity.findUnique({
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
    
    return prisma.sRActivity.findMany({
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

  async create(data: Prisma.SRActivityUncheckedCreateInput): Promise<SRActivity> {
    return prisma.sRActivity.create({
      data,
    });
  }

  async update(id: string, data: Prisma.SRActivityUncheckedUpdateInput): Promise<SRActivity> {
    return prisma.sRActivity.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<SRActivity> {
    return prisma.sRActivity.delete({
      where: { id },
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
      prisma.sRActivity.findMany({
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
      prisma.sRActivity.count({ where: whereWithSR }),
    ]);

    return { data, totalCount };
  }

  async createActivity(srId: string, userId: string, type: "CREATED"|"STATUS_CHANGED"|"PRIORITY_CHANGED"|"ASSIGNED"|"REASSIGNED"|"COMMENTED"|"ATTACHMENT_ADDED"|"ATTACHMENT_REMOVED"|"REOPENED"|"COMPLETED"|"REJECTED", description: string, metadata?: any): Promise<SRActivity> {
    return prisma.sRActivity.create({
      data: {
        srId,
        userId,
        type,
        description,
        metadata: metadata || {},
      },
    });
  }
}