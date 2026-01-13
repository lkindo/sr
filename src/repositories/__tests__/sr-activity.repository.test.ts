import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRActivityRepository } from '../sr-activity.repository';

vi.mock('@/lib/prisma', () => ({
    default: {
        sRActivity: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

import prisma from '@/lib/prisma';
const mockPrisma = prisma as unknown as {
    sRActivity: {
        findUnique: any;
        findMany: any;
        count: any;
        create: any;
        update: any;
        delete: any;
    }
};

describe('SRActivityRepository', () => {
    let repository: SRActivityRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new SRActivityRepository();
    });

    describe('findDetailsById', () => {
        it('should return activity details', async () => {
            const mockActivity = { id: 'act-1', description: 'test' };
            mockPrisma.sRActivity.findUnique.mockResolvedValue(mockActivity);

            const result = await repository.findDetailsById('act-1');

            expect(result).toEqual(mockActivity);
            expect(mockPrisma.sRActivity.findUnique).toHaveBeenCalledWith({
                where: { id: 'act-1' },
                include: { sr: true, user: { select: expect.any(Object) } },
            });
        });
    });

    describe('findAll', () => {
        it('should return all activities with pagination', async () => {
            const mockActivities = [{ id: 'act-1' }];
            mockPrisma.sRActivity.findMany.mockResolvedValue(mockActivities);

            const result = await repository.findAll({ skip: 0, take: 10 });

            expect(result).toEqual(mockActivities);
            expect(mockPrisma.sRActivity.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 0, take: 10 })
            );
        });
    });

    describe('findBySrId', () => {
        it('should return activities and count for an SR', async () => {
            const mockActivities = [{ id: 'act-1' }];
            mockPrisma.sRActivity.findMany.mockResolvedValue(mockActivities);
            mockPrisma.sRActivity.count.mockResolvedValue(1);

            const result = await repository.findBySrId('sr-1', { skip: 0, take: 10 });

            expect(result.data).toEqual(mockActivities);
            expect(result.totalCount).toBe(1);
        });
    });

    describe('createActivity', () => {
        it('should create a new activity', async () => {
            const mockActivity = { id: 'act-1', type: 'CREATED' };
            mockPrisma.sRActivity.create.mockResolvedValue(mockActivity);

            const result = await repository.createActivity(
                'sr-1',
                'user-1',
                'CREATED',
                'Description',
                { meta: 'data' }
            );

            expect(result).toEqual(mockActivity);
            expect(mockPrisma.sRActivity.create).toHaveBeenCalledWith({
                data: {
                    srId: 'sr-1',
                    userId: 'user-1',
                    type: 'CREATED',
                    description: 'Description',
                    metadata: { meta: 'data' },
                },
            });
        });

        it('should create activity without metadata', async () => {
            const mockActivity = { id: 'act-1' };
            mockPrisma.sRActivity.create.mockResolvedValue(mockActivity);

            await repository.createActivity(
                'sr-1',
                'user-1',
                'CREATED',
                'Description'
            );

            expect(mockPrisma.sRActivity.create).toHaveBeenCalledWith({
                data: {
                    srId: 'sr-1',
                    userId: 'user-1',
                    type: 'CREATED',
                    description: 'Description',
                    metadata: {},
                },
            });
        });
    });
});
