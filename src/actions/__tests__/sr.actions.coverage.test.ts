import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actions from '@/actions/sr.actions';
import { SRService } from '@/services/sr.service';
import { fail } from '@/lib/result';

// Mock dependencies
vi.mock('@/services/sr.service');
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/action-helpers', () => ({
    authenticateAndAuthorize: vi.fn(),
    validateWithSchema: vi.fn(),
    getAuthenticatedSession: vi.fn(),
}));

// Mock errorToResult
vi.mock('@/lib/errors', async () => {
    const actual = await vi.importActual<any>('@/lib/errors');
    return {
        ...actual,
        errorToResult: vi.fn((err) => ({ success: false, code: 'ERROR', message: err.message })),
    };
});

describe('SR Actions Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createSRAction', () => {
        it('returns fail on validation error', async () => {
            const { validateWithSchema } = await import('@/lib/action-helpers');
            vi.mocked(validateWithSchema).mockReturnValue(fail('Validation failed', 'VALIDATION_ERROR'));

            const formData = new FormData();
            const result = await actions.createSRAction(formData);
            expect(result.success).toBe(false);
            expect(result.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('deleteSRAction', () => {
        it('revalidates path on success', async () => {
            const { getAuthenticatedSession } = await import('@/lib/action-helpers');
            const { revalidatePath } = await import('next/cache');
            vi.mocked(getAuthenticatedSession).mockResolvedValue({ user: { id: 'u1' } } as any);
            vi.mocked(SRService.prototype.deleteSR).mockResolvedValue(undefined);

            const result = await actions.deleteSRAction('sr-1');
            expect(result.success).toBe(true);
            expect(revalidatePath).toHaveBeenCalledWith('/srs');
        });
    });

    describe('getSRAction', () => {
        it('returns NOT_FOUND if service returns null', async () => {
            vi.mocked(SRService.prototype.getSRById).mockResolvedValue(null);
            const result = await actions.getSRAction('none');
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.code).toBe('NOT_FOUND');
            }
        });
    });
});
