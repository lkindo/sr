import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { SRRepository } from '@/repositories/sr.repository';
import { ClientRepository } from '@/repositories/client.repository';
import { UserRepository } from '@/repositories/user.repository';
import { ServiceCategoryRepository } from '@/repositories/service-category.repository';
import { SRActivityRepository } from '@/repositories/sr-activity.repository';
import { SRCommentRepository } from '@/repositories/sr-comment.repository';
import { SRAttachmentRepository } from '@/repositories/sr-attachment.repository';
import { ensureCanCreateSR, ensureCanUpdateSR } from '@/lib/policies';

// Mock dependencies
vi.mock('@/repositories/sr.repository');
vi.mock('@/repositories/sr-activity.repository');
vi.mock('@/repositories/sr-comment.repository');
vi.mock('@/repositories/sr-attachment.repository');
vi.mock('@/repositories/client.repository');
vi.mock('@/repositories/service-category.repository');
vi.mock('@/repositories/user.repository');

vi.mock('@/lib/policies', () => ({
    ensureCanCreateSR: vi.fn(),
    ensureCanUpdateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
}));

vi.mock('@/lib/wait-until', () => ({
    backgroundTask: vi.fn(async (promise) => {
        try { await promise; } catch (e) { }
    }),
    backgroundTasks: vi.fn(async (tasks) => Promise.all(tasks.map(t => t.promise))),
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        $transaction: vi.fn((callback) => callback({})),
    },
}));

vi.mock('@/lib/sr-state-machine', () => ({
    validateTransition: vi.fn(),
    getRequiredFields: vi.fn(),
}));

describe('SRService - Expanded Coverage', () => {
    let srService: SRService;
    let mocks: {
        sr: any;
        activity: any;
        comment: any;
        attachment: any;
        client: any;
        category: any;
        user: any;
    };

    const mockUser = {
        id: 'user-1',
        roles: ['ADMIN'],
        permissions: [],
        clientIds: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2023-10-10T10:00:00Z'));

        mocks = {
            sr: new SRRepository(),
            activity: new SRActivityRepository(),
            comment: new SRCommentRepository(),
            attachment: new SRAttachmentRepository(),
            client: new ClientRepository(),
            category: new ServiceCategoryRepository(),
            user: new UserRepository(),
        };

        mocks.user.findUserIdsByRoles.mockResolvedValue([]);
        mocks.user.findUsersByRoles.mockResolvedValue([]);
        mocks.activity.create.mockResolvedValue({});
        mocks.sr.update.mockResolvedValue({});

        srService = new SRService(
            mocks.sr,
            mocks.activity,
            mocks.comment,
            mocks.attachment,
            mocks.client,
            mocks.category,
            mocks.user
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('updateSR - Validation Branches', () => {
        it('should throw error when missing required fields for status change', async () => {
            const existingSR = { id: 'sr-1', status: 'REQUESTED' };
            mocks.sr.findById.mockResolvedValue(existingSR);
            vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

            const { validateTransition, getRequiredFields } = await import('@/lib/sr-state-machine');
            vi.mocked(validateTransition).mockReturnValue({ valid: true });
            vi.mocked(getRequiredFields).mockReturnValue(['assigneeId']);

            await expect(srService.updateSR('sr-1', { status: 'IN_PROGRESS' }, mockUser as any))
                .rejects.toThrow('담당자(assigneeId)');
        });
    });

    describe('createSR - Sequence Logic', () => {
        it('should handle sequential SR numbering correctly when lastSR is valid', async () => {
            vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
            mocks.client.findById.mockResolvedValue({ id: 'c-1', isActive: true });

            const { default: prisma } = await import('@/lib/prisma');
            const txMock = {
                sR: {
                    findFirst: vi.fn().mockResolvedValue({ srNumber: 'SR-20231010-0005' }),
                    create: vi.fn().mockResolvedValue({ id: 'sr-1', srNumber: 'SR-20231010-0006' })
                }
            };
            vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(txMock));
            mocks.sr.findDetailsById.mockResolvedValue({
                id: 'sr-1', srNumber: 'SR-20231010-0006', title: 'T',
                requester: { name: 'R' }, serviceCategory: { categoryName: 'C' }
            });

            await srService.createSR({
                title: 'Title Valid',
                description: 'Description Valid Long',
                clientId: 'c-1',
                serviceCategoryId: 'cat-1',
                requestedPriority: 'MEDIUM'
            }, mockUser as any);

            expect(txMock.sR.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ srNumber: 'SR-20231010-0006' })
            }));
        });
    });
});
