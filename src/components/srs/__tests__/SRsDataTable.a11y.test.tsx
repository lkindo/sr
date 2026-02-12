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
    Filter: () => <div data-testid="icon-filter" />,
    ArrowUpDown: () => <div data-testid="icon-arrow-up-down" />,
    ArrowUp: () => <div data-testid="icon-arrow-up" />,
    ArrowDown: () => <div data-testid="icon-arrow-down" />,
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

describe('SRsDataTable Accessibility', () => {
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

  it('toggles advanced filter visibility and updates aria attributes', () => {
    render(<SRsDataTable {...defaultProps} />);

    const filterButton = screen.getByText('상세 필터').closest('button');
    expect(filterButton).toHaveAttribute('aria-expanded', 'false');
    expect(filterButton).toHaveAttribute('aria-controls', 'advanced-filters-section');

    // Section should not exist yet
    expect(screen.queryByRole('region', { name: '상세 필터 옵션' })).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(filterButton!);
    expect(filterButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: '상세 필터 옵션' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '상세 필터 옵션' })).toHaveAttribute(
      'id',
      'advanced-filters-section'
    );

    // Click to collapse
    fireEvent.click(filterButton!);
    expect(filterButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: '상세 필터 옵션' })).not.toBeInTheDocument();
  });

  it('renders correct aria-sort attributes on table headers', () => {
    // Mock sort state: srNumber descending (default)
    const params = new URLSearchParams();
    params.set('sort', 'srNumber.desc');
    vi.mocked(useSearchParams).mockReturnValue(params as any);

    render(<SRsDataTable {...defaultProps} />);

    // Check SR Number header
    // Note: We use querySelector to find the 'th' element containing the text or button
    // But getByRole('columnheader') is more accessible-oriented
    const srNumberHeader = screen.getByRole('columnheader', { name: /SR 번호/i });
    expect(srNumberHeader).toHaveAttribute('aria-sort', 'descending');

    // Check other headers (should be none)
    const titleHeader = screen.getByRole('columnheader', { name: /제목/i });
    expect(titleHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('updates aria-sort attribute when sort changes', () => {
    // Mock sort state: title ascending
    const params = new URLSearchParams();
    params.set('sort', 'title.asc');
    vi.mocked(useSearchParams).mockReturnValue(params as any);

    render(<SRsDataTable {...defaultProps} />);

    const titleHeader = screen.getByRole('columnheader', { name: /제목/i });
    expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');

    const srNumberHeader = screen.getByRole('columnheader', { name: /SR 번호/i });
    expect(srNumberHeader).toHaveAttribute('aria-sort', 'none');
  });
});
