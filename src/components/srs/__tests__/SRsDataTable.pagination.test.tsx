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
//
// 프리미티브는 전부 이 배럴 목 하나로 모은다. SRsDataTable 이 `@/components/ui/pagination`
// 서브경로가 아니라 배럴에서 Pagination 계열을 가져오므로(앱 코드는 배럴 규칙),
// 서브경로를 따로 목킹하면 그 목은 아무도 타지 않는다.
//
// Pagination 계열을 실제 구현 대신 스텁으로 두는 이유: 실제 판은 `<a aria-disabled>` 를
// 렌더하는데 이 스위트는 `toBeDisabled()` 로 단언한다(jest-dom 은 aria-disabled 를
// disabled 로 보지 않는다). 여기서 검증하려는 것은 shadcn 프리미티브의 마크업이 아니라
// "SRsDataTable 이 hasPrevPage/hasNextPage 를 올바로 전달하는가"다.
vi.mock('@/components/ui', () => ({
  Pagination: ({ children }: any) => <nav aria-label="페이지 탐색">{children}</nav>,
  PaginationContent: ({ children }: any) => <ul>{children}</ul>,
  PaginationItem: ({ children }: any) => <li>{children}</li>,
  PaginationPrevious: ({ onClick, 'aria-disabled': disabled }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label="이전 페이지로 이동">
      이전
    </button>
  ),
  PaginationNext: ({ onClick, 'aria-disabled': disabled }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label="다음 페이지로 이동">
      다음
    </button>
  ),
  PaginationLink: ({ children, isActive, onClick }: any) => (
    <button onClick={onClick} aria-current={isActive ? 'page' : undefined}>
      {children}
    </button>
  ),
  PaginationEllipsis: () => <span>...</span>,
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
    expect(screen.getByRole('navigation', { name: '페이지 탐색' })).toBeInTheDocument();
    expect(screen.getByLabelText('이전 페이지로 이동')).toBeInTheDocument();
    expect(screen.getByLabelText('다음 페이지로 이동')).toBeInTheDocument();
  });

  it('navigates to next page', () => {
    render(<SRsDataTable {...defaultProps} />);
    const nextBtn = screen.getByLabelText('다음 페이지로 이동');
    fireEvent.click(nextBtn);

    expect(mockRouter.push).toHaveBeenCalled();
    const callArg = mockRouter.push.mock.calls[0]![0];
    expect(callArg).toContain('page=2');
  });

  it('disables previous button on first page', () => {
    render(<SRsDataTable {...defaultProps} />);
    const prevBtn = screen.getByLabelText('이전 페이지로 이동');
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
    const nextBtn = screen.getByLabelText('다음 페이지로 이동');
    expect(nextBtn).toBeDisabled();
  });

  it('renders aria-label on items per page selector', () => {
    render(<SRsDataTable {...defaultProps} />);
    // We mocked SelectTrigger to render aria-label on the div
    const selectTrigger = screen.getByLabelText('페이지당 항목 수');
    expect(selectTrigger).toBeInTheDocument();
  });
});
