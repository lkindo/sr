import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { SRRepository } from '@/repositories/sr.repository';
import { ClientRepository } from '@/repositories/client.repository';
import { UserRepository } from '@/repositories/user.repository';
import { ServiceCategoryRepository } from '@/repositories/service-category.repository';
import { SRActivityRepository } from '@/repositories/sr-activity.repository';
import { SRCommentRepository } from '@/repositories/sr-comment.repository';
import { SRAttachmentRepository } from '@/repositories/sr-attachment.repository';
import { ensureCanCreateSR } from '@/lib/policies';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Mock repositories
vi.mock('@/repositories/sr.repository');
vi.mock('@/repositories/sr-activity.repository');
vi.mock('@/repositories/sr-comment.repository');
vi.mock('@/repositories/sr-attachment.repository');
vi.mock('@/repositories/client.repository');
vi.mock('@/repositories/service-category.repository');
vi.mock('@/repositories/user.repository');

// Mock external services
vi.mock('@/services/push.service', () => ({
    pushService: { sendForEvent: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('@/services/email.service', () => ({
    emailService: {
        sendSREmail: vi.fn().mockResolvedValue(true),
        sendSRCreated: vi.fn().mockResolvedValue(true),
    }
}));

vi.mock('@/lib/policies', () => ({
    ensureCanCreateSR: vi.fn(),
    ensureCanUpdateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
}));

vi.mock('@/lib/wait-until', () => ({
    backgroundTask: vi.fn((promise) => {
        promise.catch(() => { });
    }),
    backgroundTasks: vi.fn(() => { }),
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }
}));

// Mock Prisma error
vi.mock('@prisma/client/runtime/library', () => ({
    PrismaClientKnownRequestError: class extends Error {
        code: string;
        constructor(message: string, { code }: { code: string }) {
            super(message);
            this.code = code;
        }
    },
}));

describe('SRService - Retry Logic', () => {
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

        mocks.user.findUserIdsByRoles.mockResolvedValue([]);
        mocks.user.findUsersByRoles.mockResolvedValue([]);
        mocks.activity.create.mockResolvedValue({});

        srService = new SRService(
            mocks.sr, mocks.activity, mocks.comment, mocks.attachment, mocks.client, mocks.category, mocks.user
        );
    });

    it('retries SR number generation on P2002 error', async () => {
        vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
        mocks.client.findById.mockResolvedValue({ id: 'c-1', isActive: true });

        const { default: prisma } = await import('@/lib/prisma');

        const txMock = {
            sR: {
                findFirst: vi.fn().mockResolvedValue({ srNumber: 'SR-20231010-0001' }),
                create: vi.fn()
                    .mockRejectedValueOnce(new PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002' }))
                    .mockResolvedValueOnce({ id: 'sr-1', srNumber: 'SR-20231010-0002' })
            }
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));
        mocks.sr.findDetailsById.mockResolvedValue({
            id: 'sr-1', srNumber: 'SR-20231010-0002', title: 'Valid Title',
            requester: { name: 'R' }, serviceCategory: { categoryName: 'C' }
        });

        await srService.createSR({
            title: 'Valid Title Long Enough',
            description: 'Description Longer Than Ten Characters',
            clientId: 'c-1',
            serviceCategoryId: 'cat-1',
            requestedPriority: 'MEDIUM'
        }, { id: 'u1' } as any);

        expect(txMock.sR.create).toHaveBeenCalledTimes(2);
    });
});
