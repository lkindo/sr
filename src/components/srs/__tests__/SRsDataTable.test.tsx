import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePermissions } from '@/hooks/use-permissions';

import { SRsDataTable } from '../SRsDataTable';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

// Mock child components
vi.mock('@/components/srs/CreateSRDialog', () => ({
  CreateSRDialog: () => <div data-testid="create-sr-dialog" />,
}));

// Mock icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Search: () => <div data-testid="icon-search" />,
    X: () => <div data-testid="icon-x" />,
    Inbox: () => <div data-testid="icon-inbox" />,
    SearchX: () => <div data-testid="icon-search-x" />,
  };
});

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => {
  const React = require('react');
  return {
    Input: React.forwardRef(({ onChange, value, ...props }: any, ref: any) => (
      <input ref={ref} onChange={onChange} value={value} {...props} />
    )),
  };
});

describe('SRsDataTable Search Component', () => {
  const mockRouter = { push: vi.fn(), refresh: vi.fn() };
  const mockSearchParams = new URLSearchParams();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    vi.mocked(usePathname).mockReturnValue('/srs');
    vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);

    vi.mocked(useSession).mockReturnValue({ data: { user: { id: 'user-1' } } } as any);

    vi.mocked(usePermissions).mockReturnValue({ hasAnyRole: () => true } as any);
  });

  const defaultProps = {
    srs: [],
    paginationInfo: {
      currentPage: 1,
      itemsPerPage: 20,
      totalCount: 0,
      totalPages: 0,
      hasPrevPage: false,
      hasNextPage: false,
    },
    clients: [],
    users: [],
  };

  it('renders search input', () => {
    render(<SRsDataTable {...defaultProps} />);
    expect(screen.getByPlaceholderText(/SR 번호, 제목/)).toBeInTheDocument();
  });

  it('shows clear button when text is typed', () => {
    render(<SRsDataTable {...defaultProps} />);
    const input = screen.getByPlaceholderText(/SR 번호, 제목/);

    // Initially no clear button
    expect(screen.queryByLabelText('검색어 초기화')).not.toBeInTheDocument();

    // Type something
    fireEvent.change(input, { target: { value: 'test' } });

    // Clear button should appear
    expect(screen.getByLabelText('검색어 초기화')).toBeInTheDocument();
  });

  it('clears input when clear button is clicked', () => {
    render(<SRsDataTable {...defaultProps} />);
    const input = screen.getByPlaceholderText(/SR 번호, 제목/);

    fireEvent.change(input, { target: { value: 'test' } });
    const clearBtn = screen.getByLabelText('검색어 초기화');

    fireEvent.click(clearBtn);

    expect(input).toHaveValue('');
    expect(screen.queryByLabelText('검색어 초기화')).not.toBeInTheDocument();
  });

  it('updates URL when clear button is clicked if search filter was active', () => {
    // Simulate active search param
    const params = new URLSearchParams();
    params.set('search', 'existing');
    vi.mocked(useSearchParams).mockReturnValue(params as any);

    render(<SRsDataTable {...defaultProps} />);

    const input = screen.getByPlaceholderText(/SR 번호, 제목/);
    // Input should be initialized with search param
    expect(input).toHaveValue('existing');

    const clearBtn = screen.getByLabelText('검색어 초기화');
    fireEvent.click(clearBtn);

    // Should verify router.push was called to remove 'search' param
    expect(mockRouter.push).toHaveBeenCalled();
    const callArg = mockRouter.push.mock.calls[0][0];
    expect(callArg).toContain('page=1');
    expect(callArg).not.toContain('search=existing');
  });

  it('does NOT update URL if search was local only', () => {
    // No search param initially
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any);

    render(<SRsDataTable {...defaultProps} />);

    const input = screen.getByPlaceholderText(/SR 번호, 제목/);

    fireEvent.change(input, { target: { value: 'local typing' } });

    const clearBtn = screen.getByLabelText('검색어 초기화');
    fireEvent.click(clearBtn);

    expect(input).toHaveValue('');
    // router.push should NOT be called because filters.search was empty
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  describe('Empty State', () => {
    it('renders "No data" state when list is empty and no filters are active', () => {
      render(<SRsDataTable {...defaultProps} />);
      expect(screen.getAllByText('SR이 없습니다')[0]).toBeInTheDocument();
      expect(screen.getAllByText('SR 등록').length).toBeGreaterThan(0); // Header + Empty State
      expect(screen.queryByText('필터 초기화')).not.toBeInTheDocument();
    });

    it('renders "No results" state when list is empty and filters are active', () => {
      const params = new URLSearchParams();
      params.set('search', 'something');
      vi.mocked(useSearchParams).mockReturnValue(params as any);

      render(<SRsDataTable {...defaultProps} />);
      expect(screen.getAllByText('검색 결과가 없습니다')[0]).toBeInTheDocument();
      expect(screen.getAllByText('필터 초기화')[0]).toBeInTheDocument();
    });
  });
});
