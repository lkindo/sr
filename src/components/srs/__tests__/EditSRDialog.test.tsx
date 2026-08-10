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
// 파일 선택을 흉내낼 수 있어야 한다. 첨부 업로드 경로(부분 실패 포함)는
// `files.length > 0` 일 때만 돌기 때문에, 값을 밀어 넣을 수 있는 버튼이 하나 필요하다.
vi.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ onChange, disabled }: any) => (
    <div data-testid="file-upload">
      <button
        type="button"
        data-testid="pick-files"
        disabled={disabled}
        onClick={() =>
          onChange([
            new File(['ok'], 'ok.pdf', { type: 'application/pdf' }),
            new File(['bad'], 'bad.exe', { type: 'application/octet-stream' }),
            new File(['huge'], 'huge.zip', { type: 'application/zip' }),
          ])
        }
      >
        파일 선택
      </button>
    </div>
  ),
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

    // `text` 를 함께 준다. api-client 는 204 와 빈 본문을 구분하려고 성공 경로에서
    // `response.text()` 를 읽으므로, `json` 만 있는 목은 TypeError 로 실패 경로에 빠진다.
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...mockSR }),
      text: async () => JSON.stringify({ ...mockSR }),
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSR,
        text: async () => JSON.stringify(mockSR),
      } as Response)
      // 삭제 응답은 본문이 없다. `text` 가 빈 문자열이면 api-client 가 undefined 를 돌려준다.
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' } as Response);

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

  describe('첨부 업로드 결과 보고', () => {
    // POST /api/srs/[id]/attachments 는 **부분 성공을 201 로** 돌려준다 —
    // 검증에 걸린 파일은 `data.errors[]` 에 담기고 나머지만 저장된다(전부 실패해야 400).
    // 예전 수정 폼은 응답을 읽지 않고 `await` 만 해서, 3개 중 2개가 걸려도 사용자에게는
    // "SR이 수정되었습니다." 만 보였다. 아래 두 테스트가 그 회귀를 막는다.
    const mockAttachmentsPost = (body: unknown, status = 201) => {
      vi.spyOn(global, 'fetch').mockImplementation(async (_url: any, init: any) => {
        if (init?.method === 'POST') {
          return {
            ok: status < 400,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
          } as Response;
        }
        // 업로드 후 기존 첨부 목록 재조회(GET /api/srs/[id])
        return {
          ok: true,
          status: 200,
          json: async () => mockSR,
          text: async () => JSON.stringify(mockSR),
        } as Response;
      });
    };

    const submitWithFiles = async () => {
      mockUpdateMutateAsync.mockResolvedValue({ success: true });
      render(<EditSRDialog {...defaultProps} />);

      await screen.findByDisplayValue('Existing SR Title', {}, { timeout: 5000 });
      fireEvent.click(screen.getByTestId('pick-files'));
      fireEvent.submit(screen.getByTestId('edit-sr-form'));
    };

    it('부분 실패(201 + errors[])를 사용자에게 알린다', async () => {
      mockAttachmentsPost({
        success: true,
        message: '1개의 파일이 업로드되었습니다.',
        data: {
          attachments: [{ id: 'att-2', fileName: 'ok.pdf' }],
          errors: [
            { fileName: 'bad.exe', error: '허용되지 않는 파일 형식입니다.' },
            { fileName: 'huge.zip', error: '파일 크기가 너무 큽니다.' },
          ],
        },
      });

      await submitWithFiles();

      await waitFor(
        () => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/srs/sr-123/attachments',
            expect.objectContaining({ method: 'POST' })
          );
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '일부 첨부파일이 업로드되지 않았습니다',
              variant: 'destructive',
              description: expect.stringContaining('1개 업로드 / 2개 실패'),
            })
          );
        },
        { timeout: 5000 }
      );

      // 거부 사유를 그대로 보여 줘야 사용자가 다시 올릴지 판단할 수 있다.
      const partialToast = mockToast.mock.calls.find(
        (call) => call[0]?.title === '일부 첨부파일이 업로드되지 않았습니다'
      );
      expect(partialToast?.[0]?.description).toContain('bad.exe: 허용되지 않는 파일 형식입니다.');
      expect(partialToast?.[0]?.description).toContain('huge.zip: 파일 크기가 너무 큽니다.');

      // 실패를 덮는 "성공" 토스트가 함께 뜨면 안 된다. (이것이 원래 버그의 증상이었다)
      expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: '성공' }));
    });

    it('전부 저장되면 실제 저장된 개수를 성공 토스트에 담는다', async () => {
      mockAttachmentsPost({
        success: true,
        message: '3개의 파일이 업로드되었습니다.',
        data: {
          attachments: [{ id: 'att-2' }, { id: 'att-3' }, { id: 'att-4' }],
          errors: undefined,
        },
      });

      await submitWithFiles();

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith({
            title: '성공',
            description: 'SR이 수정되었습니다. (첨부파일 3개 업로드)',
          });
        },
        { timeout: 5000 }
      );
    });

    it('전부 실패(400)면 기존의 업로드 실패 경고를 유지한다', async () => {
      mockAttachmentsPost({ error: '업로드할 수 있는 파일이 없습니다.' }, 400);

      await submitWithFiles();

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '경고',
              description: 'SR은 수정되었으나 첨부파일 업로드에 실패했습니다.',
              variant: 'destructive',
            })
          );
        },
        { timeout: 5000 }
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
