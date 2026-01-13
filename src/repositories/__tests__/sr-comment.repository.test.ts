import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRCommentRepository } from '../sr-comment.repository';

vi.mock('@/lib/prisma', () => ({
    default: {
        sRComment: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

import prisma from '@/lib/prisma';
const mockPrisma = prisma as unknown as {
    sRComment: {
        findUnique: any;
        findMany: any;
        count: any;
        groupBy: any;
        create: any;
        update: any;
        delete: any;
    }
};

describe('SRCommentRepository', () => {
    let repository: SRCommentRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new SRCommentRepository();
    });

    describe('findDetailsById', () => {
        it('should return comment details', async () => {
            const mockComment = { id: 'comm-1', content: 'test' };
            mockPrisma.sRComment.findUnique.mockResolvedValue(mockComment);

            const result = await repository.findDetailsById('comm-1');

            expect(result).toEqual(mockComment);
            expect(mockPrisma.sRComment.findUnique).toHaveBeenCalledWith({
                where: { id: 'comm-1' },
                include: { sr: true, user: { select: expect.any(Object) } },
            });
        });
    });

    describe('findAll', () => {
        it('should return all comments with pagination', async () => {
            const mockComments = [{ id: 'comm-1' }];
            mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);

            const result = await repository.findAll({ skip: 0, take: 10 });

            expect(result).toEqual(mockComments);
            expect(mockPrisma.sRComment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 0, take: 10 })
            );
        });
    });

    describe('findBySrId', () => {
        it('should return comments and count for an SR', async () => {
            const mockComments = [{ id: 'comm-1' }];
            mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);
            mockPrisma.sRComment.count.mockResolvedValue(1);

            const result = await repository.findBySrId('sr-1', { skip: 0, take: 10 });

            expect(result.data).toEqual(mockComments);
            expect(result.totalCount).toBe(1);
        });
    });

    describe('findByUserId', () => {
        it('should return comments for a user', async () => {
            const mockComments = [{ id: 'comm-1' }];
            mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);

            const result = await repository.findByUserId('user-1');

            expect(result).toEqual(mockComments);
            expect(mockPrisma.sRComment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'user-1' },
                })
            );
        });
    });

    describe('countBySrs', () => {
        it('should group counts by SR IDs', async () => {
            const mockGroups = [{ srId: 'sr-1', _count: { _all: 3 } }];
            mockPrisma.sRComment.groupBy.mockResolvedValue(mockGroups);

            const result = await repository.countBySrs(['sr-1']);

            expect(result).toEqual(mockGroups);
        });
    });
});
