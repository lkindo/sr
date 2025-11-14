import { BaseRepository } from './base.repository';
import { SR, Prisma, SRStatus, SRPriority } from '@prisma/client';
import prisma from '@/lib/prisma';

export class SRRepository implements BaseRepository<SR, string, Prisma.SRUncheckedCreateInput, Prisma.SRUncheckedUpdateInput> {
  async findById(id: string) {
    return prisma.sR.findUnique({
      where: { id },
      include: {
        client: true,
        requester: {
          select: { id: true, name: true, email: true, image: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        intakeBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        serviceCategory: true,
        activities: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        comments: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
  }): Promise<(SR & {
    client: { id: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
  })[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return prisma.sR.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        client: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async create(data: Prisma.SRUncheckedCreateInput): Promise<SR> {
    return prisma.sR.create({
      data: {
        ...data,
        activities: data.activities || {
          create: {
            type: 'CREATED',
            description: 'SR이 생성되었습니다',
            userId: data.requesterId,
          },
        },
      },
      include: {
        client: true,
        requester: true,
        assignee: true,
      },
    });
  }

  async update(id: string, data: Prisma.SRUncheckedUpdateInput): Promise<SR> {
    return prisma.sR.update({
      where: { id },
      data,
      include: {
        client: true,
        requester: true,
        assignee: true,
      },
    });
  }

  async delete(id: string): Promise<SR> {
    return prisma.sR.delete({
      where: { id },
    });
  }

  // SR 관련 커스텀 메서드들
  async findBySrNumber(srNumber: string): Promise<SR | null> {
    return prisma.sR.findUnique({
      where: { srNumber },
      include: {
        client: true,
        requester: true,
        assignee: true,
      },
    });
  }

  async findByClientId(clientId: string, params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
  }): Promise<{ data: SR[]; totalCount: number }> {
    const { skip, take, where = {}, orderBy } = params || {};
    
    const whereWithClient: Prisma.SRWhereInput = {
      ...where,
      clientId,
    };

    const [data, totalCount] = await Promise.all([
      prisma.sR.findMany({
        skip,
        take,
        where: whereWithClient,
        orderBy,
        include: {
          client: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.sR.count({ where: whereWithClient }),
    ]);

    return { data, totalCount };
  }

  async countByStatus(clientId?: string, status?: SRStatus): Promise<number> {
    const where: Prisma.SRWhereInput = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    return prisma.sR.count({ where });
  }

  async countByPriority(clientId?: string, priority?: SRPriority): Promise<number> {
    const where: Prisma.SRWhereInput = {};
    if (clientId) where.clientId = clientId;
    if (priority) where.priority = priority;

    return prisma.sR.count({ where });
  }
}