import { useSession } from 'next-auth/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientsForSelection } from '@/actions/client.actions';
import { getServiceCategoriesForSelection } from '@/actions/service-category.actions';
import { createSRAction, getSRRequesterCandidatesAction } from '@/actions/sr.actions';
import { getProfileAction } from '@/actions/user.actions';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';

import { CreateSRDialog } from '../CreateSRDialog';

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
  createSRAction: vi.fn(),
  getSRRequesterCandidatesAction: vi.fn(),
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

// Mock components
vi.mock('@/components/ui/file-upload', () => ({
  FileUpload: () => <div data-testid="file-upload" />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
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
        <option value="SELF">SELF</option>
        <option value="cust-1">cust-1</option>
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => <div data-testid={`trigger-${id}`}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-testid={`item-${value}`}>{children}</div>,
}));

describe('CreateSRDialog Component', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnCreated = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue({ toast: mockToast });
    (useSession as any).mockReturnValue({ data: { user: { id: 'user-1', roles: ['ADMIN'] } } });
    (usePermissions as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
    });

    (getClientsForSelection as any).mockResolvedValue({
      success: true,
      data: [{ id: 'client-1', code: 'C1', name: 'Client 1' }],
    });

    vi.mocked(getSRRequesterCandidatesAction).mockResolvedValue({
      success: true,
      data: [{ id: 'cust-1', name: '김고객', email: 'kim@client.com' }],
    });

    (getServiceCategoriesForSelection as any).mockResolvedValue({
      success: true,
      data: [{ id: 'cat-1', categoryName: 'Category 1' }],
    });

    (getProfileAction as any).mockResolvedValue({
      success: true,
      data: { clients: [{ client: { id: 'client-1', name: 'Client 1', code: 'C1' } }] },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    onCreated: mockOnCreated,
  };

  it('renders correctly and fetches initialization data', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('새 SR 요청')).toBeInTheDocument();
    });

    expect(getClientsForSelection).toHaveBeenCalled();
  });

  // 감사 3.19: 카테고리는 반드시 선택된 고객사로 스코프해야 한다.
  // 스코프 없이 전체를 부르면 드롭다운에 다른 고객사의 서비스 카탈로그가 노출된다.
  it('고객사가 선택되기 전에는 카테고리를 조회하지 않는다', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('새 SR 요청')).toBeInTheDocument();
    });

    expect(getServiceCategoriesForSelection).not.toHaveBeenCalled();
  });

  it('고객사를 선택하면 그 clientId 로 스코프해 카테고리를 조회한다', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    const selects = await screen.findAllByTestId('mock-select');
    fireEvent.change(selects[0]!, { target: { value: 'client-1' } });

    await waitFor(() => {
      expect(getServiceCategoriesForSelection).toHaveBeenCalledWith('client-1');
    });
  });

  it('shows validation error for short title', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    fireEvent.change(titleInput, { target: { value: 'Abc' } });
    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '제목은 최소 5자 이상이어야 합니다.',
        })
      );
    });
  });

  it('disables client selection for Client users', async () => {
    (usePermissions as any).mockReturnValue({
      hasAnyRole: vi.fn().mockImplementation((roles) => !roles.includes('ADMIN')),
    });

    render(<CreateSRDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('고객사는 자동으로 설정됩니다.')).toBeInTheDocument();
    });

    const selects = screen.getAllByTestId('mock-select');
    expect(selects[0]).toBeDisabled();
    // In Client user case, it calls getProfileAction and sets clientId
    await waitFor(() => {
      expect(selects[0]).toHaveValue('client-1');
    });
  });

  it('successfully submits form when all fields are valid', async () => {
    (createSRAction as any).mockResolvedValue({
      success: true,
      data: { id: 'new-sr-123' },
    });

    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    const descInput = await screen.findByLabelText(/설명 \*/);

    fireEvent.change(titleInput, { target: { value: 'Valid Title Here' } });
    fireEvent.change(descInput, {
      target: { value: 'This is a long enough description for testing.' },
    });

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[0]!, { target: { value: 'client-1' } }); // Client
    fireEvent.change(selects[1]!, { target: { value: 'cat-1' } }); // Category

    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(createSRAction).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '성공',
        })
      );
      expect(mockOnCreated).toHaveBeenCalled();
    });
  });

  /**
   * 대리 등록(D3, 소유자 결정 2026-09-18). 확인완료는 신청자 본인만 하므로, 운영자가 고객 요청을 대신
   * 등록할 때는 실제 고객을 신청자로 지정한다. 내부 사용자에게만 보이고, 고객사를 고른 뒤에 뜬다.
   */
  describe('대리 등록 — 신청자(고객) 지정', () => {
    const fillRequired = async () => {
      fireEvent.change(await screen.findByLabelText(/제목 \*/), {
        target: { value: 'Valid Title Here' },
      });
      fireEvent.change(await screen.findByLabelText(/설명 \*/), {
        target: { value: 'This is a long enough description for testing.' },
      });
    };

    it('내부 사용자가 고객사를 고르면 그 고객사의 신청자 후보를 불러와 선택지를 보인다', async () => {
      render(<CreateSRDialog {...defaultProps} />);
      expect(screen.queryByTestId('trigger-requester')).not.toBeInTheDocument();

      const selects = await screen.findAllByTestId('mock-select');
      fireEvent.change(selects[0]!, { target: { value: 'client-1' } });

      await waitFor(() => expect(getSRRequesterCandidatesAction).toHaveBeenCalledWith('client-1'));
      expect(await screen.findByTestId('trigger-requester')).toBeInTheDocument();
      expect(await screen.findByTestId('item-cust-1')).toHaveTextContent('김고객');
    });

    it('고객을 고르면 requesterId 를 실어 보낸다', async () => {
      vi.mocked(createSRAction).mockResolvedValue({
        success: true,
        data: { id: 'new-sr' },
      } as never);
      render(<CreateSRDialog {...defaultProps} />);
      await fillRequired();

      const selects = await screen.findAllByTestId('mock-select');
      fireEvent.change(selects[0]!, { target: { value: 'client-1' } });
      fireEvent.change(selects[1]!, { target: { value: 'cat-1' } });
      await screen.findByTestId('trigger-requester');
      fireEvent.change(screen.getAllByTestId('mock-select')[2]!, { target: { value: 'cust-1' } });

      fireEvent.submit(screen.getByTestId('sr-form'));

      await waitFor(() => expect(createSRAction).toHaveBeenCalled());
      const formData = vi.mocked(createSRAction).mock.calls[0]![0];
      expect(formData.get('requesterId')).toBe('cust-1');
    });

    it('본인(기본값)이면 requesterId 를 보내지 않는다', async () => {
      vi.mocked(createSRAction).mockResolvedValue({
        success: true,
        data: { id: 'new-sr' },
      } as never);
      render(<CreateSRDialog {...defaultProps} />);
      await fillRequired();

      const selects = await screen.findAllByTestId('mock-select');
      fireEvent.change(selects[0]!, { target: { value: 'client-1' } });
      fireEvent.change(selects[1]!, { target: { value: 'cat-1' } });
      fireEvent.submit(screen.getByTestId('sr-form'));

      await waitFor(() => expect(createSRAction).toHaveBeenCalled());
      const formData = vi.mocked(createSRAction).mock.calls[0]![0];
      expect(formData.has('requesterId')).toBe(false);
    });

    it('외부 사용자에게는 보이지 않고 후보도 조회하지 않는다', async () => {
      vi.mocked(usePermissions).mockReturnValue({
        hasAnyRole: vi.fn().mockReturnValue(false),
      } as never);
      render(<CreateSRDialog {...defaultProps} />);

      await waitFor(() => expect(getProfileAction).toHaveBeenCalled());
      expect(screen.queryByTestId('trigger-requester')).not.toBeInTheDocument();
      expect(getSRRequesterCandidatesAction).not.toHaveBeenCalled();
    });
  });

  it('handles server side error during creation', async () => {
    (createSRAction as any).mockResolvedValue({
      success: false,
      error: 'Database constraint failed',
    });

    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
    fireEvent.change(screen.getByLabelText(/설명 \*/), {
      target: { value: 'Long enough description.' },
    });

    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[0]!, { target: { value: 'client-1' } });
    fireEvent.change(selects[1]!, { target: { value: 'cat-1' } });

    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Database constraint failed',
          variant: 'destructive',
        })
      );
    });
  });

  it('shows validation error for short description', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    const descInput = await screen.findByLabelText(/설명 \*/);

    fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
    fireEvent.change(descInput, { target: { value: 'Too short' } });
    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '설명은 최소 10자 이상이어야 합니다.',
        })
      );
    });
  });

  it('shows validation error when client is not selected', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    const descInput = await screen.findByLabelText(/설명 \*/);

    fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
    fireEvent.change(descInput, { target: { value: 'This is a valid description.' } });
    // Don't select a client, but select a category
    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[1]!, { target: { value: 'cat-1' } });

    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '고객사와 카테고리를 모두 선택해주세요.',
        })
      );
    });
  });

  it('shows validation error when category is not selected', async () => {
    render(<CreateSRDialog {...defaultProps} />);

    const titleInput = await screen.findByLabelText(/제목 \*/);
    const descInput = await screen.findByLabelText(/설명 \*/);

    fireEvent.change(titleInput, { target: { value: 'Valid Title' } });
    fireEvent.change(descInput, { target: { value: 'This is a valid description.' } });
    // Select client but not category
    const selects = screen.getAllByTestId('mock-select');
    fireEvent.change(selects[0]!, { target: { value: 'client-1' } });

    fireEvent.submit(screen.getByTestId('sr-form'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '고객사와 카테고리를 모두 선택해주세요.',
        })
      );
    });
  });

  it('shows error toast when fetching clients fails', async () => {
    (getClientsForSelection as any).mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    render(<CreateSRDialog {...defaultProps} />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '고객사 목록을 불러오지 못했습니다.',
          variant: 'destructive',
        })
      );
    });
  });

  it('shows error toast when fetching categories fails', async () => {
    (getServiceCategoriesForSelection as any).mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    render(<CreateSRDialog {...defaultProps} />);

    // 카테고리 조회는 고객사 선택 이후에만 일어난다(감사 3.19).
    const selects = await screen.findAllByTestId('mock-select');
    fireEvent.change(selects[0]!, { target: { value: 'client-1' } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '서비스 카테고리 목록을 불러오지 못했습니다.',
          variant: 'destructive',
        })
      );
    });
  });
});
