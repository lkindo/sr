
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SRsDataTable } from '../SRsDataTable';
import { usePermissions } from '@/hooks/use-permissions';

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

// Mock child components to avoid complex rendering
vi.mock('@/components/srs/CreateSRDialog', () => ({
  CreateSRDialog: () => <div data-testid="create-sr-dialog" />,
}));

vi.mock('../SRListItem', () => ({
  SRCardItem: () => <div data-testid="sr-card-item" />,
  SRTableRow: () => <tr data-testid="sr-table-row" />,
}));


describe('SRsDataTable Counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), refresh: vi.fn() } as any);
    vi.mocked(usePathname).mockReturnValue('/srs');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any);
    vi.mocked(useSession).mockReturnValue({ data: { user: { id: 'user-1' } } } as any);
    vi.mocked(usePermissions).mockReturnValue({ hasAnyRole: () => true } as any);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const mockSRs: any[] = [
    { id: '1', status: 'REQUESTED', priority: 'MEDIUM', dueDate: null },
    { id: '2', status: 'REQUESTED', priority: 'HIGH', dueDate: null }, // Waiting + Urgent
    { id: '3', status: 'IN_PROGRESS', priority: 'LOW', dueDate: null }, // InProgress
    { id: '4', status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: today.toISOString() }, // InProgress + Urgent + DueToday
    { id: '5', status: 'ON_HOLD', priority: 'MEDIUM', dueDate: today.toISOString() }, // DueToday
    { id: '6', status: 'COMPLETED', priority: 'HIGH', dueDate: today.toISOString() }, // Urgent (but completed, so not DueToday as status not in list)
    { id: '7', status: 'INTAKE', priority: 'LOW', dueDate: today.toISOString() }, // DueToday
  ];

  const defaultProps = {
    srs: mockSRs,
    paginationInfo: {
      currentPage: 1,
      itemsPerPage: 20,
      totalCount: 7,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    },
    clients: [],
    users: [],
  };

  it('calculates and displays correct counts', () => {
    render(<SRsDataTable {...defaultProps} />);

    // Check badges text
    expect(screen.getByText(/접수 대기 \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/진행중 \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 마감 \(3\)/)).toBeInTheDocument();

    // Check Urgent count in the Quick Filter button
    // The button contains "긴급" and the count "3" in a span.
    // We can find the button by text "긴급" and check if it contains "3"
    const urgentBtn = screen.getByText('긴급').closest('button');
    expect(urgentBtn).toBeInTheDocument();
    expect(urgentBtn).toHaveTextContent('3');
  });
});
