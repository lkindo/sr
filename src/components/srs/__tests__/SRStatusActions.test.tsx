import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChangeSRStatus } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';

import { SRStatusActions } from '../SRStatusActions';

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

vi.mock('@/hooks/use-sr', () => ({
  useChangeSRStatus: vi.fn(),
}));

// Mock sub-dialogs to simplify
vi.mock('../CompleteSRDialog', () => ({
  CompleteSRDialog: () => <div data-testid="complete-dialog" />,
}));
vi.mock('../HoldSRDialog', () => ({ HoldSRDialog: () => <div data-testid="hold-dialog" /> }));
vi.mock('../RejectSRDialog', () => ({ RejectSRDialog: () => <div data-testid="reject-dialog" /> }));
vi.mock('../ReopenSRDialog', () => ({ ReopenSRDialog: () => <div data-testid="reopen-dialog" /> }));

describe('SRStatusActions Component', () => {
  const mockPush = vi.fn();
  const mockRefresh = vi.fn();
  const mockToast = vi.fn();
  const mockInvalidateQueries = vi.fn();
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush, refresh: mockRefresh });
    (useToast as any).mockReturnValue({ toast: mockToast });
    (useQueryClient as any).mockReturnValue({ invalidateQueries: mockInvalidateQueries });
    (useChangeSRStatus as any).mockReturnValue({ mutateAsync: mockMutateAsync });

    // Mock global fetch
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      render(
        <SRStatusActions
          {...defaultProps}
          status="COMPLETED"
          isRequestor={true}
          userRoles={['USER']}
        />
      );
      expect(screen.getByText('확인 완료')).toBeInTheDocument();
    });

    it('renders "진행 시작" for INTAKE state if user can manage', () => {
      render(<SRStatusActions {...defaultProps} status="INTAKE" />);
      expect(screen.getByText('진행 시작')).toBeInTheDocument();
    });

    it('renders nothing for INTAKE state if user cannot manage', () => {
      render(<SRStatusActions {...defaultProps} status="INTAKE" userRoles={['USER']} />);
      expect(screen.queryByText('진행 시작')).not.toBeInTheDocument();
    });

    it('renders "진행 재개" and "거절" for ON_HOLD state', () => {
      render(<SRStatusActions {...defaultProps} status="ON_HOLD" />);
      expect(screen.getByText('진행 재개')).toBeInTheDocument();
      expect(screen.getByText('거절')).toBeInTheDocument();
    });

    it('renders nothing for ON_HOLD state if user cannot manage', () => {
      render(<SRStatusActions {...defaultProps} status="ON_HOLD" userRoles={['USER']} />);
      expect(screen.queryByText('진행 재개')).not.toBeInTheDocument();
    });

    it('renders "재오픈" for CONFIRMED state if user is requestor or manager', () => {
      render(
        <SRStatusActions
          {...defaultProps}
          status="CONFIRMED"
          isRequestor={true}
          userRoles={['USER']}
        />
      );
      expect(screen.getByText('재오픈')).toBeInTheDocument();
    });

    it('renders nothing for CONFIRMED state if user is neither requestor nor manager', () => {
      render(
        <SRStatusActions
          {...defaultProps}
          status="CONFIRMED"
          isRequestor={false}
          userRoles={['USER']}
        />
      );
      expect(screen.queryByText('재오픈')).not.toBeInTheDocument();
    });

    it('renders nothing for REJECTED state', () => {
      render(<SRStatusActions {...defaultProps} status="REJECTED" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders "재오픈" for COMPLETED state if user is manager', () => {
      render(
        <SRStatusActions
          {...defaultProps}
          status="COMPLETED"
          isRequestor={false}
          userRoles={['MANAGER']}
        />
      );
      expect(screen.getByText('재오픈')).toBeInTheDocument();
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

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'resume' });
        },
        { timeout: 5000 }
      );

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '성공',
        })
      );
    });

    it('calls status patch API when "진행 시작" is clicked (INTAKE)', async () => {
      render(<SRStatusActions {...defaultProps} status="INTAKE" />);
      fireEvent.click(screen.getByText('진행 시작'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'start' });
        },
        { timeout: 5000 }
      );
    });

    it('calls status patch API when "확인 완료" is clicked (COMPLETED)', async () => {
      render(
        <SRStatusActions
          {...defaultProps}
          status="COMPLETED"
          isRequestor={true}
          userRoles={['USER']}
        />
      );
      fireEvent.click(screen.getByText('확인 완료'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'confirm' });
        },
        { timeout: 5000 }
      );
    });

    it('shows error toast when mutation fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Network error'));

      render(<SRStatusActions {...defaultProps} status="ON_HOLD" />);
      fireEvent.click(screen.getByText('진행 재개'));

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '오류',
              description: 'Network error',
              variant: 'destructive',
            })
          );
        },
        { timeout: 5000 }
      );
    });

    it('successfully changes status on click', async () => {
      mockMutateAsync.mockResolvedValue({ success: true });

      render(<SRStatusActions {...defaultProps} status="ON_HOLD" />);
      fireEvent.click(screen.getByText('진행 재개'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'resume' });
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '성공',
            })
          );
        },
        { timeout: 5000 }
      );
    });
  });
});
