import { BaseRepository } from './base.repository';
import { SRComment, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class SRCommentRepository extends BaseRepositoryImpl<SRComment, string, Prisma.SRCommentUncheckedCreateInput, Prisma.SRCommentUncheckedUpdateInput> {
  constructor() {
    super(prisma.sRComment);
  }

  async findDetailsById(id: string): Promise<SRComment | null> {
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
    where?: Prisma.SRCommentWhereInput;
    orderBy?: Prisma.SRCommentOrderByWithRelationInput;
  }): Promise<SRComment[]> {
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

  async findByUserId(userId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRCommentWhereInput;
    orderBy?: Prisma.SRCommentOrderByWithRelationInput;
  }): Promise<SRComment[]> {
    const { skip, take, where = {}, orderBy } = params || {};
    
    return this.model.findMany({
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