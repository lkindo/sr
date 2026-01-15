import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { SRRepository } from '@/repositories/sr.repository';
import { ClientRepository } from '@/repositories/client.repository';
import { UserRepository } from '@/repositories/user.repository';
import { ServiceCategoryRepository } from '@/repositories/service-category.repository';
import { SRActivityRepository } from '@/repositories/sr-activity.repository';
import { SRCommentRepository } from '@/repositories/sr-comment.repository';
import { SRAttachmentRepository } from '@/repositories/sr-attachment.repository';
import { ensureCanUpdateSR } from '@/lib/policies';
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
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        $transaction: vi.fn((cb) => cb({
            sR: { update: vi.fn() },
            sRActivity: { create: vi.fn() },
        })),
    },
}));

describe('SRService.updateSR Branches', () => {
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

    it('throws error when changing client if status is not REQUESTED', async () => {
        mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS', clientId: 'old-c' });
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, { id: 'u1' } as any))
            .rejects.toThrow(/접수 후에는 고객사를 변경할 수 없습니다/);
    });

    it('throws NotFoundError when new client does not exist', async () => {
        mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'REQUESTED', clientId: 'old-c' });
        mocks.client.findById.mockResolvedValue(null);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'non-existent' }, { id: 'u1' } as any))
            .rejects.toThrow(NotFoundError);
    });

    it('throws error when new client is inactive', async () => {
        mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'REQUESTED', clientId: 'old-c' });
        mocks.client.findById.mockResolvedValue({ id: 'new-c', isActive: false, name: 'Inactive Corp' });
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, { id: 'u1' } as any))
            .rejects.toThrow(/비활성 상태의 고객사/);
    });

    it('throws error when missing required fields for status transition', async () => {
        mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'INTAKE' });
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { status: 'IN_PROGRESS' }, { id: 'u1', roles: ['ADMIN'] } as any))
            .rejects.toThrow(/상태로 전환하려면 다음 필드가 필요합니다/);
    });

    it('throws error when changing assignee of COMPLETED SR', async () => {
        mocks.sr.findById.mockResolvedValue({ id: 'sr-1', status: 'COMPLETED', assigneeId: 'old-a' });
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { assigneeId: 'new-a' }, { id: 'u1' } as any))
            .rejects.toThrow(/완료되거나 확정된 SR의 담당자는 변경할 수 없습니다/);
    });

    it('adjusts due date when actualPriority changes', async () => {
        mocks.sr.findById.mockResolvedValue({
            id: 'sr-1', status: 'IN_PROGRESS',
            serviceCategoryId: 'cat-1', actualPriority: 'LOW',
            intakeAt: new Date('2023-10-10T00:00:00Z')
        });
        mocks.category.findById.mockResolvedValue({ id: 'cat-1', slaHours: 24 });
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        const { default: prisma } = await import('@/lib/prisma');
        const txMock = {
            sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
            sRActivity: { create: vi.fn() }
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

        await srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, { id: 'u1' } as any);

        const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
        expect(updateData.dueDate).toBeDefined();
        // 24 * 0.5 = 12 hours added to intakeAt
        expect(updateData.dueDate.toISOString()).toBe('2023-10-10T12:00:00.000Z');
    });
});
