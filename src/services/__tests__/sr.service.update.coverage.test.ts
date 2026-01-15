import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { ensureCanUpdateSR } from '@/lib/policies';
import { NotFoundError } from '@/lib/errors';
import prisma from '@/lib/prisma';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
    default: {
        $transaction: vi.fn((cb) => cb(prisma)),
        sR: { findUnique: vi.fn(), update: vi.fn() },
        client: { findUnique: vi.fn() },
        serviceCategory: { findUnique: vi.fn() },
        sRActivity: { create: vi.fn() },
    },
}));

vi.mock('@/lib/policies', () => ({
    ensureCanUpdateSR: vi.fn(),
    ensureCanCreateSR: vi.fn(),
}));

describe('SRService.updateSR Branches', () => {
    let srService: SRService;

    beforeEach(() => {
        vi.clearAllMocks();
        srService = new SRService();
    });

    it('throws error when changing client if status is not REQUESTED', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS', clientId: 'old-c' } as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, { id: 'u1' } as any))
            .rejects.toThrow(/접수 후에는 고객사를 변경할 수 없습니다/);
    });

    it('throws NotFoundError when new client does not exist', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'REQUESTED', clientId: 'old-c' } as any);
        vi.mocked(prisma.client.findUnique).mockResolvedValue(null);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'non-existent' }, { id: 'u1' } as any))
            .rejects.toThrow(NotFoundError);
    });

    it('throws error when new client is inactive', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'REQUESTED', clientId: 'old-c' } as any);
        vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'new-c', isActive: false, name: 'Inactive Corp' } as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'new-c' }, { id: 'u1' } as any))
            .rejects.toThrow(/비활성 상태의 고객사/);
    });

    it('throws error when missing required fields for status transition', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'INTAKE' } as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { status: 'IN_PROGRESS' }, { id: 'u1', roles: ['ADMIN'] } as any))
            .rejects.toThrow(/상태로 전환하려면 다음 필드가 필요합니다/);
    });

    it('throws error when changing assignee of COMPLETED SR', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({ id: 'sr-1', status: 'COMPLETED', assigneeId: 'old-a' } as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { assigneeId: 'new-a' }, { id: 'u1' } as any))
            .rejects.toThrow(/완료되거나 확정된 SR의 담당자는 변경할 수 없습니다/);
    });

    it('adjusts due date when actualPriority changes', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue({
            id: 'sr-1', status: 'IN_PROGRESS',
            serviceCategoryId: 'cat-1', actualPriority: 'LOW',
            intakeAt: new Date('2023-10-10T00:00:00Z')
        } as any);
        vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ id: 'cat-1', slaHours: 24 } as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        const txMock = {
            sR: { update: vi.fn().mockResolvedValue({ id: 'sr-1' }) },
            sRActivity: { create: vi.fn() }
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

        await srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, { id: 'u1' } as any);

        const updateData = vi.mocked(txMock.sR.update).mock.calls[0][0].data;
        expect(updateData.dueDate).toBeDefined();
        // 24 * 0.5 = 12 hours added to intakeAt
        expect(updateData.dueDate.toISOString()).toBe('2023-10-10T12:00:00.000Z');
    });
});
