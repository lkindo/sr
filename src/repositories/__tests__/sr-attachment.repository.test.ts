import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRAttachmentRepository } from '../sr-attachment.repository';

vi.mock('@/lib/prisma', () => ({
    default: {
        sRAttachment: {
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
    sRAttachment: {
        findUnique: any;
        findMany: any;
        count: any;
        groupBy: any; // Keep groupBy here as it's used later in the tests
        create: any;
        update: any;
        delete: any;
    }
};

describe('SRAttachmentRepository', () => {
    let repository: SRAttachmentRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new SRAttachmentRepository();
    });

    describe('findDetailsById', () => {
        it('should return attachment details', async () => {
            const mockAttachment = { id: 'att-1', fileName: 'test.jpg' };
            mockPrisma.sRAttachment.findUnique.mockResolvedValue(mockAttachment);

            const result = await repository.findDetailsById('att-1');

            expect(result).toEqual(mockAttachment);
            expect(mockPrisma.sRAttachment.findUnique).toHaveBeenCalledWith({
                where: { id: 'att-1' },
                include: { sr: true },
            });
        });
    });

    describe('findAll', () => {
        it('should return all attachments with pagination', async () => {
            const mockAttachments = [{ id: 'att-1' }, { id: 'att-2' }];
            mockPrisma.sRAttachment.findMany.mockResolvedValue(mockAttachments);

            const result = await repository.findAll({ skip: 0, take: 10 });

            expect(result).toEqual(mockAttachments);
            expect(mockPrisma.sRAttachment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 0, take: 10 })
            );
        });
    });

    describe('findBySrId', () => {
        it('should return attachments and count for an SR', async () => {
            const mockAttachments = [{ id: 'att-1' }];
            mockPrisma.sRAttachment.findMany.mockResolvedValue(mockAttachments);
            mockPrisma.sRAttachment.count.mockResolvedValue(1);

            const result = await repository.findBySrId('sr-1', { skip: 0, take: 10 });

            expect(result.data).toEqual(mockAttachments);
            expect(result.totalCount).toBe(1);
            expect(mockPrisma.sRAttachment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { srId: 'sr-1' } })
            );
        });
    });

    describe('findByUserId', () => {
        it('should return attachments for a user', async () => {
            const mockAttachments = [{ id: 'att-1' }];
            mockPrisma.sRAttachment.findMany.mockResolvedValue(mockAttachments);

            const result = await repository.findByUserId('user-1');

            expect(result).toEqual(mockAttachments);
            expect(mockPrisma.sRAttachment.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { sr: { requesterId: 'user-1' } },
                })
            );
        });
    });

    describe('countBySrs', () => {
        it('should group counts by SR IDs', async () => {
            const mockGroups = [{ srId: 'sr-1', _count: { _all: 5 } }];
            mockPrisma.sRAttachment.groupBy.mockResolvedValue(mockGroups);

            const result = await repository.countBySrs(['sr-1']);

            expect(result).toEqual(mockGroups);
            expect(mockPrisma.sRAttachment.groupBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    by: ['srId'],
                    where: { srId: { in: ['sr-1'] } },
                })
            );
        });
    });
});
