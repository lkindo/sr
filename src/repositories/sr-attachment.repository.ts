import { BaseRepository } from './base.repository';
import { SRAttachment, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class SRAttachmentRepository extends BaseRepositoryImpl<SRAttachment, string, Prisma.SRAttachmentUncheckedCreateInput, Prisma.SRAttachmentUncheckedUpdateInput> {
  constructor() {
    super(prisma.sRAttachment as any);
  }

  async findDetailsById(id: string): Promise<SRAttachment | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        sr: true,
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRAttachmentWhereInput;
    orderBy?: Prisma.SRAttachmentOrderByWithRelationInput;
  }): Promise<SRAttachment[]> {
    const { skip, take, where, orderBy } = params || {};

    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        sr: true,
      },
    });
  }

  // SRAttachment 관련 커스텀 메서드들
  async findBySrId(srId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRAttachmentWhereInput;
    orderBy?: Prisma.SRAttachmentOrderByWithRelationInput;
  }): Promise<{ data: SRAttachment[]; totalCount: number }> {
    const { skip, take, where = {}, orderBy = { createdAt: 'desc' } } = params || {};

    const whereWithSR: Prisma.SRAttachmentWhereInput = {
      ...where,
      srId,
    };

    const [data, totalCount] = await Promise.all([
      this.model.findMany({
        skip,
        take,
        where: whereWithSR,
        orderBy,
      }),
      this.model.count({ where: whereWithSR }),
    ]);

    return { data, totalCount };
  }

  async findByUserId(userId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRAttachmentWhereInput;
    orderBy?: Prisma.SRAttachmentOrderByWithRelationInput;
  }): Promise<SRAttachment[]> {
    const { skip, take, where = {}, orderBy } = params || {};

    return this.model.findMany({
      skip,
      take,
      where: {
        ...where,
        sr: {
          requesterId: userId
        }
      },
      orderBy,
      include: {
        sr: {
          select: { id: true, srNumber: true, title: true },
        },
      },
    });
  }

  async countBySrs(srIds: string[]) {
    return this.model.groupBy({
      by: ['srId'],
      where: {
        srId: { in: srIds }
      },
      _count: {
        _all: true
      }
    });
  }
}