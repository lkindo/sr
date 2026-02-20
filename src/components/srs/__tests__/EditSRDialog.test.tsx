import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { updateSRAction } from '@/actions/sr.actions';
import { getProfileAction } from '@/actions/user.actions';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpdateSR } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';

import { EditSRDialog } from '../EditSRDialog';

// Mock dependencies
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

vi.mock('@/actions/sr.actions', () => ({
  updateSRAction: vi.fn(),
}));

vi.mock('@/hooks/use-sr', () => ({
  useUpdateSR: vi.fn(),
}));

vi.mock('@/actions/client.actions', () => ({
  getClientsForSelection: vi.fn(),
}));

vi.mock('@/actions/service-category.actions', () => ({
  getServiceCategoriesForSelection: vi.fn(),
}));

vi.mock('@/actions/user.actions', () => ({
  getProfileAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

// Mock components
vi.mock('@/components/ui/file-upload', () => ({
  FileUpload: () => <div data-testid="file-upload" />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value, disabled }: any) => (
    <div data-testid="mock-select-root">
      <select
        data-testid="mock-select"
        value={value || ''}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select option</option>
        <option value="client-1">Client 1</option>
        <option value="cat-1">Category 1</option>
        <option value="MEDIUM">MEDIUM</option>
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => <div data-testid={`trigger-${id}`}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-testid={`item-${value}`}>{children}</div>,
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Download: () => <div data-testid="icon-download" />,
  Trash2: () => <div data-testid="icon-trash" />,
  FileIcon: () => <div data-testid="icon-file" />,
}));

describe('EditSRDialog Component', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnUpdated = vi.fn();
  const mockToast = vi.fn();
  const mockPush = vi.fn();
  const mockRefresh = vi.fn();
  const mockInvalidateQueries = vi.fn();
  const mockUpdateMutateAsync = vi.fn();

  const mockSR = {
    id: 'sr-123',
    title: 'Existing SR Title',
    description: 'Existing SR Description which is long enough.',
    status: 'REQUESTED',
    priority: 'MEDIUM',
    clientId: 'client-1',
    category: { id: 'cat-1', name: 'Category 1' },
    serviceCategory: { id: 'cat-1', categoryName: 'Category 1' },
    attachments: [
      {
        id: 'att-1',
        fileName: 'test.pdf',
        fileSize: 1024,
        fileUrl: 'http://example.com/test.pdf',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue({ toast: mockToast });
    (useSession as any).mockReturnValue({ data: { user: { id: 'user-1', roles: ['ADMIN'] } } });
    (usePermissions as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
    });
    (useRouter as any).mockReturnValue({ push: mockPush, refresh: mockRefresh });
    (useQueryClient as any).mockReturnValue({ invalidateQueries: mockInvalidateQueries });
    (useUpdateSR as any).mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false });

    (getClientsForSelection as any).mockResolvedValue({
      success: true,
      data: [{ id: 'client-1', code: 'C1', name: 'Client 1' }],
    });

    (getServiceCategoriesForSelection as any).mockResolvedValue({
      success: true,
      data: [{ id: 'cat-1', categoryName: 'Category 1' }],
    });

    (getProfileAction as any).mockResolvedValue({
      success: true,
      data: {
        clients: [{ client: { id: 'client-1', code: 'C1', name: 'Client 1' } }],
      },
    });

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockSR }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    sr: mockSR as any,
    onUpdated: mockOnUpdated,
  };

  it('renders correctly with existing SR data', async () => {
    render(<EditSRDialog {...defaultProps} />);

    expect(
      await screen.findByDisplayValue('Existing SR Title', {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });

  it('shows validation error for mandatory fields', async () => {
    render(<EditSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    fireEvent.change(titleInput, { target: { value: 'Shrt' } });

    const form = screen.getByTestId('edit-sr-form');
    fireEvent.submit(form);

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('handles attachment deletion', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => mockSR } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    render(<EditSRDialog {...defaultProps} />);

    await screen.findByText('test.pdf');
    const trashIcon = screen.getByTestId('icon-trash');
    const deleteBtn = trashIcon.closest('button');

    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      const confirmBtn = await screen.findByText('삭제');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/attachments/att-1',
          expect.objectContaining({ method: 'DELETE' })
        );
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ description: '파일이 삭제되었습니다.' })
        );
      });
    }
  });

  it('restricts edit for non-admin users if status is not REQUESTED', async () => {
    (usePermissions as any).mockReturnValue({
      hasAnyRole: vi.fn().mockImplementation((roles) => (roles.includes('ADMIN') ? false : true)),
    });

    const inProgressSR = { ...mockSR, status: 'IN_PROGRESS' };
    render(<EditSRDialog {...defaultProps} sr={inProgressSR as any} />);

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalled();
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      },
      { timeout: 5000 }
    );
  });
  it('submits form successfully', async () => {
    mockUpdateMutateAsync.mockResolvedValue({ success: true });
    render(<EditSRDialog {...defaultProps} />);

    // Wait for initial data to be populated
    const titleInput = await screen.findByDisplayValue('Existing SR Title', {}, { timeout: 5000 });
    expect(titleInput).toBeInTheDocument();

    const form = screen.getByTestId('edit-sr-form');
    fireEvent.submit(form);

    await waitFor(
      () => {
        expect(mockUpdateMutateAsync).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '성공' }));
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        expect(mockOnUpdated).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  });

  it('handles submit failure', async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error('Update failed'));
    render(<EditSRDialog {...defaultProps} />);

    const submitBtn = screen.getByText('저장');
    fireEvent.click(submitBtn);

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      },
      { timeout: 5000 }
    );
  });

  it.skip('handles attachment delete failure', async () => {
    // Reset fetch mock to ensure clean state
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockSR }) // initial load
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Delete failed' }),
      }); // delete fail

    render(<EditSRDialog {...defaultProps} />);

    await screen.findByText('test.pdf');

    // Find trash icon and click parent button
    const trashIcon = screen.getByTestId('icon-trash');
    const deleteBtn = trashIcon.closest('button');
    if (!deleteBtn) throw new Error('Delete button not found');

    fireEvent.click(deleteBtn);

    // Wait for dialog and click confirm
    const confirmBtn = await screen.findByText('삭제');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/attachments/'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류',
          variant: 'destructive',
        })
      );
    });
  });

  it('fetches categories failure handles gracefully', async () => {
    (getServiceCategoriesForSelection as any).mockResolvedValue({ success: false });
    render(<EditSRDialog {...defaultProps} />);
    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: '오류' }));
      },
      { timeout: 5000 }
    );
  });
});
