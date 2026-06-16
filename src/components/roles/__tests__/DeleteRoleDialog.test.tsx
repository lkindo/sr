import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteRoleAction } from '@/actions/role.actions';
import { useToast } from '@/hooks/use-toast';

import { DeleteRoleDialog } from '../DeleteRoleDialog';

// Mock actions
vi.mock('@/actions/role.actions', () => ({
  deleteRoleAction: vi.fn(),
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui', () => {
  return {
    Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onClick, disabled, type, className, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} type={type} className={className} {...props}>
        {children}
      </button>
    ),
  };
});

describe('DeleteRoleDialog Component', () => {
  const mockToast = vi.fn();
  const mockRole = { id: 'r1', name: 'GUEST' };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    role: mockRole,
    onDeleted: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: [] });
  });

  it('role이 존재할 때 역할명을 포함하여 삭제 안내 문구를 렌더링해야 함', () => {
    render(<DeleteRoleDialog {...defaultProps} />);

    expect(screen.getByText('역할 삭제')).toBeInTheDocument();
    expect(screen.getByText('GUEST')).toBeInTheDocument();
    expect(screen.getByText(/정말로/)).toBeInTheDocument();
  });

  it('삭제 버튼 클릭 시 deleteRoleAction을 호출하고 성공하면 모달 닫기 및 콜백을 호출해야 함', async () => {
    vi.mocked(deleteRoleAction).mockResolvedValue({ success: true, data: undefined });

    render(<DeleteRoleDialog {...defaultProps} />);

    const deleteButton = screen.getByText('삭제');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteRoleAction).toHaveBeenCalledWith('r1');
      expect(mockToast).toHaveBeenCalledWith({
        title: '성공',
        description: '역할이 삭제되었습니다.',
      });
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
      expect(defaultProps.onDeleted).toHaveBeenCalled();
    });
  });

  it('삭제 실패 시 에러 토스트를 노출하고 모달이 닫히거나 onDeleted 콜백이 호출되지 않아야 함', async () => {
    vi.mocked(deleteRoleAction).mockResolvedValue({
      success: false,
      error: '삭제할 수 없는 고유 역할입니다.',
    });

    render(<DeleteRoleDialog {...defaultProps} />);

    const deleteButton = screen.getByText('삭제');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteRoleAction).toHaveBeenCalledWith('r1');
      expect(mockToast).toHaveBeenCalledWith({
        title: '오류',
        description: '삭제할 수 없는 고유 역할입니다.',
        variant: 'destructive',
      });
      expect(defaultProps.onOpenChange).not.toHaveBeenCalled();
      expect(defaultProps.onDeleted).not.toHaveBeenCalled();
    });
  });

  it('취소 버튼 클릭 시 onOpenChange(false)가 호출되어야 함', () => {
    const onOpenChange = vi.fn();
    render(<DeleteRoleDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByText('취소');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
