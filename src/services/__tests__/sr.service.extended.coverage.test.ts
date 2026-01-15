import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { SRRepository } from '@/repositories/sr.repository';
import { ClientRepository } from '@/repositories/client.repository';
import { UserRepository } from '@/repositories/user.repository';
import { ServiceCategoryRepository } from '@/repositories/service-category.repository';
import { SRActivityRepository } from '@/repositories/sr-activity.repository';
import { SRCommentRepository } from '@/repositories/sr-comment.repository';
import { SRAttachmentRepository } from '@/repositories/sr-attachment.repository';
import { ensureCanUpdateSR, ensureCanDeleteSR } from '@/lib/policies';
import { NotFoundError } from '@/lib/errors';

// Mock dependencies
vi.mock('@/repositories/sr.repository');
vi.mock('@/repositories/sr-activity.repository');
vi.mock('@/repositories/sr-comment.repository');
vi.mock('@/repositories/sr-attachment.repository');
vi.mock('@/repositories/client.repository');
vi.mock('@/repositories/service-category.repository');
vi.mock('@/repositories/user.repository');

vi.mock('@/lib/policies', () => ({
    ensureCanUpdateSR: vi.fn(),
    ensureCanCreateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        $transaction: vi.fn((cb) => cb({
            sR: { update: vi.fn(), delete: vi.fn() },
            sRActivity: { create: vi.fn(), deleteMany: vi.fn() },
            sRComment: { deleteMany: vi.fn() },
            sRAttachment: { deleteMany: vi.fn() },
            sRStatusHistory: { deleteMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        })),
        sRStatusHistory: { findMany: vi.fn(), count: vi.fn() },
    },
}));

vi.mock('@/services/push.service', () => ({
    pushService: { sendToUser: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('@/services/email.service', () => ({
    emailService: {
        sendSRStatusChanged: vi.fn().mockResolvedValue(true),
        sendSRAssigned: vi.fn().mockResolvedValue(true),
    }
}));

describe('SRService Extended Branches', () => {
    let srService: SRService;
    let mocks: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks = {
            sr: new SRRepository(),
            activity: new SRActivityRepository(),
            comment: new SRCommentRepository(),
            attachment: new SRAttachmentRepository(),
            client: new ClientRepository(),
            category: new ServiceCategoryRepository(),
            user: new UserRepository(),
        };
        srService = new SRService(mocks.sr, mocks.activity, mocks.comment, mocks.attachment, mocks.client, mocks.category, mocks.user);
    });

    describe('updateSR Notifications', () => {
        it('skips emails if preferences are false', async () => {
            mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'INTAKE', requesterId: 'req-1', assigneeId: null });
            vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

            const { default: prisma } = await import('@/lib/prisma');
            const { emailService } = await import('@/services/email.service');

            const txMock = {
                sR: {
                    update: vi.fn().mockResolvedValue({
                        id: 'sr-1', srNumber: 'SR-1', title: 'T',
                        requester: { email: 'req@test.com', notificationPreference: { emailSRStatusChanged: false } },
                        assignee: { name: 'A', email: 'a@test.com', notificationPreference: { emailSRAssigned: false } }
                    })
                },
                sRActivity: { create: vi.fn() }
            };
            vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

            await srService.updateSR('sr-1', { status: 'IN_PROGRESS', assigneeId: 'a1' }, { id: 'u1', roles: ['ADMIN'] } as any);

            expect(emailService.sendSRStatusChanged).not.toHaveBeenCalled();
            expect(emailService.sendSRAssigned).not.toHaveBeenCalled();
        });
    });

    describe('deleteSR', () => {
        it('throws NotFoundError if SR missing', async () => {
            mocks.sr.findById.mockResolvedValue(null);
            await expect(srService.deleteSR('none', {} as any)).rejects.toThrow(NotFoundError);
        });

        it('deletes SR and related data in transaction', async () => {
            mocks.sr.findById.mockResolvedValue({ id: 'sr-1' });
            vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

            const { default: prisma } = await import('@/lib/prisma');
            const txMock = {
                sR: { delete: vi.fn() },
                sRActivity: { deleteMany: vi.fn() },
                sRComment: { deleteMany: vi.fn() },
                sRAttachment: { deleteMany: vi.fn() },
                sRStatusHistory: { deleteMany: vi.fn() },
            };
            vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

            await srService.deleteSR('sr-1', { id: 'u1' } as any);

            expect(txMock.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
        });
    });

    describe('updateSR Date and Type Branches', () => {
        it('updates fields to non-null and null, handles assignedToId', async () => {
            mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS' });
            vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

            const { default: prisma } = await import('@/lib/prisma');
            const txMock = {
                sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
                sRActivity: { create: vi.fn() }
            };
            vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

            // Use assignedToId and number estimatedHours
            await srService.updateSR('sr-1', {
                expectedCompletionDate: '2023-10-10',
                estimatedHours: 12.5,
                assignedToId: 'a2'
            }, { id: 'u1' } as any);

            let updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
            expect(updateData.expectedCompletionDate).toBeInstanceOf(Date);
            expect(updateData.estimatedHours).toBe(12.5);
            expect(updateData.assigneeId).toBe('a2');

            // To null
            await srService.updateSR('sr-1', {
                expectedCompletionDate: null,
                intakeNotes: '',
            }, { id: 'u1' } as any);

            updateData = vi.mocked(txMock.sR.update).mock.calls[1][0].data;
            expect(updateData.expectedCompletionDate).toBeNull();
            expect(updateData.intakeNotes).toBeNull();
        });

        it('adjusts due date based on priority even if intakeAt is null', async () => {
            mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS', actualPriority: 'MEDIUM', serviceCategoryId: 'sc-1', intakeAt: null });
            vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);
            mocks.category.findById.mockResolvedValue({ id: 'sc-1', slaHours: 24 });

            const { default: prisma } = await import('@/lib/prisma');
            const txMock = {
                sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
                sRActivity: { create: vi.fn() }
            };
            vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

            await srService.updateSR('sr-1', { actualPriority: 'HIGH' }, { id: 'u1' } as any);
            const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
            expect(updateData.dueDate).toBeInstanceOf(Date);
        });
    });

    describe('Repository Proxy Methods', () => {
        it('proxies correctly', async () => {
            await srService.getAllSRs({ take: 1 });
            expect(mocks.sr.findAll).toHaveBeenCalled();

            await srService.countSRs();
            expect(mocks.sr.count).toHaveBeenCalled();

            await srService.getSRById('1');
            expect(mocks.sr.findById).toHaveBeenCalledWith('1');

            await srService.getStatusHistory('1');
            const { default: prisma } = await import('@/lib/prisma');
            expect(prisma.sRStatusHistory.findMany).toHaveBeenCalled();
        });
    });
});
