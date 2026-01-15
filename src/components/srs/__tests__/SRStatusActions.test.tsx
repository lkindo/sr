import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRStatusActions } from '../SRStatusActions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Mock dependencies
vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
    useToast: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: vi.fn(),
}));

// Mock sub-dialogs to simplify
vi.mock('../CompleteSRDialog', () => ({ CompleteSRDialog: () => <div data-testid="complete-dialog" /> }));
vi.mock('../HoldSRDialog', () => ({ HoldSRDialog: () => <div data-testid="hold-dialog" /> }));
vi.mock('../RejectSRDialog', () => ({ RejectSRDialog: () => <div data-testid="reject-dialog" /> }));
vi.mock('../ReopenSRDialog', () => ({ ReopenSRDialog: () => <div data-testid="reopen-dialog" /> }));

describe('SRStatusActions Component', () => {
    const mockPush = vi.fn();
    const mockRefresh = vi.fn();
    const mockToast = vi.fn();
    const mockInvalidateQueries = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useRouter as any).mockReturnValue({ push: mockPush, refresh: mockRefresh });
        (useToast as any).mockReturnValue({ toast: mockToast });
        (useQueryClient as any).mockReturnValue({ invalidateQueries: mockInvalidateQueries });

        // Mock global fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });
    });

    const defaultProps = {
        srId: 'sr-123',
        srNumber: 'SR-2024-001',
        status: 'REQUESTED' as any,
        completedAt: null,
        userRoles: ['ADMIN'],
        isRequestor: false,
    };

    describe('Rendering based on Status and Roles', () => {
        it('renders "접수하기" and "거절" for REQUESTED state if user is ADMIN', () => {
            render(<SRStatusActions {...defaultProps} />);
            expect(screen.getByText('접수하기')).toBeInTheDocument();
            expect(screen.getByText('거절')).toBeInTheDocument();
        });

        it('renders nothing for REQUESTED state if user is only basic USER', () => {
            render(<SRStatusActions {...defaultProps} userRoles={['USER']} />);
            expect(screen.queryByText('접수하기')).not.toBeInTheDocument();
            expect(screen.queryByText('거절')).not.toBeInTheDocument();
        });

        it('renders "완료 처리" and "보류" for IN_PROGRESS state', () => {
            render(<SRStatusActions {...defaultProps} status="IN_PROGRESS" />);
            expect(screen.getByText('완료 처리')).toBeInTheDocument();
            expect(screen.getByText('보류')).toBeInTheDocument();
        });

        it('renders "확인 완료" for COMPLETED state if user is Requestor', () => {
            render(<SRStatusActions {...defaultProps} status="COMPLETED" isRequestor={true} userRoles={['USER']} />);
            expect(screen.getByText('확인 완료')).toBeInTheDocument();
        });
    });

    describe('Interactions', () => {
        it('navigates to intake page when "접수하기" is clicked', () => {
            render(<SRStatusActions {...defaultProps} />);
            fireEvent.click(screen.getByText('접수하기'));
            expect(mockPush).toHaveBeenCalledWith('/srs/sr-123/intake');
        });

        it('calls status patch API when "진행 재개" is clicked (ON_HOLD)', async () => {
            render(<SRStatusActions {...defaultProps} status="ON_HOLD" />);
            fireEvent.click(screen.getByText('진행 재개'));

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/srs/sr-123/status',
                    expect.objectContaining({
                        method: 'PATCH',
                        body: JSON.stringify({ action: 'resume' }),
                    })
                );
            });

            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                title: '성공',
            }));
        });
    });
});
