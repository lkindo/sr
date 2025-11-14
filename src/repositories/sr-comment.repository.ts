import { BaseRepository } from './base.repository';
import { SRComment, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class SRCommentRepository implements BaseRepository<SRComment, string, Prisma.SRCommentUncheckedCreateInput, Prisma.SRCommentUncheckedUpdateInput> {
  async findById(id: string): Promise<SRComment | null> {
    return prisma.sRComment.findUnique({
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
    where?: Prisma.SRCommentWhereInput;
    orderBy?: Prisma.SRCommentOrderByWithRelationInput;
  }): Promise<SRComment[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return prisma.sRComment.findMany({
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

  async create(data: Prisma.SRCommentUncheckedCreateInput): Promise<SRComment> {
    return prisma.sRComment.create({
      data,
    });
  }

  async update(id: string, data: Prisma.SRCommentUncheckedUpdateInput): Promise<SRComment> {
    return prisma.sRComment.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<SRComment> {
    return prisma.sRComment.delete({
      where: { id },
    });
  }

  // SRComment 관련 커스텀 메서드들
  async findBySrId(srId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRCommentWhereInput;
    orderBy?: Prisma.SRCommentOrderByWithRelationInput;
  }): Promise<{ data: SRComment[]; totalCount: number }> {
    const { skip, take, where = {}, orderBy = { createdAt: 'desc' } } = params || {};
    
    const whereWithSR: Prisma.SRCommentWhereInput = {
      ...where,
      srId,
    };

    const [data, totalCount] = await Promise.all([
      prisma.sRComment.findMany({
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
      prisma.sRComment.count({ where: whereWithSR }),
    ]);

    return { data, totalCount };
  }

  async findByUserId(userId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRCommentWhereInput;
    orderBy?: Prisma.SRCommentOrderByWithRelationInput;
  }): Promise<SRComment[]> {
    const { skip, take, where = {}, orderBy } = params || {};
    
    return prisma.sRComment.findMany({
      skip,
      take,
      where: {
        ...where,
        userId,
      },
      orderBy,
      include: {
        sr: {
          select: { id: true, srNumber: true, title: true },
        },
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  }
}