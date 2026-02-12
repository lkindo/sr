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

// Mock UI components
vi.mock('@/components/ui/pagination', () => ({
  Pagination: ({ children }: any) => <nav aria-label="pagination">{children}</nav>,
  PaginationContent: ({ children }: any) => <ul>{children}</ul>,
  PaginationItem: ({ children }: any) => <li>{children}</li>,
  PaginationPrevious: ({ onClick, 'aria-disabled': disabled }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label="Go to previous page">
      Previous
    </button>
  ),
  PaginationNext: ({ onClick, 'aria-disabled': disabled }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label="Go to next page">
      Next
    </button>
  ),
  PaginationLink: ({ children, isActive, onClick }: any) => (
    <button onClick={onClick} aria-current={isActive ? 'page' : undefined}>
      {children}
    </button>
  ),
  PaginationEllipsis: () => <span>...</span>,
}));

// Mock other UI components needed
vi.mock('@/components/ui', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: ({ ...props }: any) => <input {...props} />,
  Select: ({ children, onValueChange, value }: any) => (
    <div data-value={value} onClick={() => onValueChange && onValueChange('10')}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, className, 'aria-label': ariaLabel }: any) => (
    <div className={className} aria-label={ariaLabel}>
      {children}
    </div>
  ),
  SelectValue: () => <div>Value</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  Badge: ({ children }: any) => <div>{children}</div>,
  Table: ({ children }: any) => <table>{children}</table>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  Label: ({ children }: any) => <label>{children}</label>,
}));

// Mock Lucide icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Search: () => <div data-testid="icon-search" />,
    X: () => <div data-testid="icon-x" />,
    ChevronLeft: () => <div data-testid="icon-chevron-left" />,
    ChevronRight: () => <div data-testid="icon-chevron-right" />,
    MoreHorizontal: () => <div data-testid="icon-more" />,
    Filter: () => <div data-testid="icon-filter" />,
    Plus: () => <div data-testid="icon-plus" />,
    Clock: () => <div data-testid="icon-clock" />,
    TrendingUp: () => <div data-testid="icon-trending-up" />,
    AlertCircle: () => <div data-testid="icon-alert-circle" />,
    User: () => <div data-testid="icon-user" />,
    AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
    ArrowUp: () => <div data-testid="icon-arrow-up" />,
    ArrowDown: () => <div data-testid="icon-arrow-down" />,
    ArrowUpDown: () => <div data-testid="icon-arrow-up-down" />,
  };
});

describe('SRsDataTable Pagination', () => {
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
      totalCount: 50,
      totalPages: 3,
      hasPrevPage: false,
      hasNextPage: true,
    },
    clients: [],
    users: [],
  };

  it('renders pagination controls when totalPages > 1', () => {
    render(<SRsDataTable {...defaultProps} />);
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
  });

  it('navigates to next page', () => {
    render(<SRsDataTable {...defaultProps} />);
    const nextBtn = screen.getByLabelText('Go to next page');
    fireEvent.click(nextBtn);

    expect(mockRouter.push).toHaveBeenCalled();
    const callArg = mockRouter.push.mock.calls[0][0];
    expect(callArg).toContain('page=2');
  });

  it('disables previous button on first page', () => {
    render(<SRsDataTable {...defaultProps} />);
    const prevBtn = screen.getByLabelText('Go to previous page');
    expect(prevBtn).toBeDisabled();
  });

  it('disables next button on last page', () => {
    const props = {
      ...defaultProps,
      paginationInfo: {
        ...defaultProps.paginationInfo,
        currentPage: 3,
        totalPages: 3,
        hasPrevPage: true,
        hasNextPage: false,
      },
    };
    render(<SRsDataTable {...props} />);
    const nextBtn = screen.getByLabelText('Go to next page');
    expect(nextBtn).toBeDisabled();
  });

  it('renders aria-label on items per page selector', () => {
    render(<SRsDataTable {...defaultProps} />);
    // We mocked SelectTrigger to render aria-label on the div
    const selectTrigger = screen.getByLabelText('페이지당 항목 수');
    expect(selectTrigger).toBeInTheDocument();
  });
});
