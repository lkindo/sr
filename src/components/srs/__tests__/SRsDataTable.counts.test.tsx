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
    vi.mocked(usePermissions).mockReturnValue({
      hasAnyRole: () => true,
      hasPermission: () => true,
      isAdmin: () => true,
    } as any);
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
    globalCounts: {
      waiting: 2,
      inProgress: 2,
      urgent: 3,
      dueToday: 3,
      overdue: 4,
      myAssigned: 0,
    },
  };

  // '지연 중'(헌법 §3, 결정 D10) — 대시보드 카드와 같은 범위(overdue=1)로 거르고, 숫자는 서버 집계를 그대로 쓴다.
  it('지연 빠른 필터는 건수를 보이고 누르면 overdue=1 로 거른다', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as never);
    render(<SRsDataTable {...defaultProps} />);

    const button = screen.getByText('지연').closest('button')!;
    expect(button).toHaveTextContent('4');
    fireEvent.click(button);

    const url = new URL(String(push.mock.calls[0]![0]), 'http://localhost');
    expect(url.searchParams.get('overdue')).toBe('1');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('overdue=1 이 걸려 있으면 지연 빠른 필터가 켜진 것으로 보고, 다시 누르면 해제한다', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as never);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('overdue=1') as never);
    render(<SRsDataTable {...defaultProps} />);

    fireEvent.click(screen.getByText('지연').closest('button')!);

    const url = new URL(String(push.mock.calls[0]![0]), 'http://localhost');
    expect(url.searchParams.get('overdue')).toBeNull();
  });

  // 배지 '긴급' 은 CRITICAL + HIGH 를 센다(서버 getSRBadgeCounts). 눌러서 간 목록도 같은 범위여야
  // 숫자와 목록이 맞는다 — 예전에는 CRITICAL 만 걸어서 배지 3건인데 목록은 1건처럼 보였다.
  it('긴급 빠른 필터는 배지와 같은 범위(CRITICAL + HIGH)로 거른다', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as never);
    render(<SRsDataTable {...defaultProps} />);

    fireEvent.click(screen.getByText('긴급').closest('button')!);

    const url = new URL(String(push.mock.calls[0]![0]), 'http://localhost');
    expect(url.searchParams.getAll('priority')).toEqual(['CRITICAL', 'HIGH']);
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('여러 값 우선순위 필터가 걸려 있으면 긴급 빠른 필터가 켜진 것으로 본다', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, refresh: vi.fn() } as never);
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('priority=CRITICAL&priority=HIGH') as never
    );
    render(<SRsDataTable {...defaultProps} />);

    // 켜진 상태에서 다시 누르면 필터를 해제한다(handleQuickFilter(null)).
    fireEvent.click(screen.getByText('긴급').closest('button')!);

    const url = new URL(String(push.mock.calls[0]![0]), 'http://localhost');
    expect(url.searchParams.getAll('priority')).toEqual([]);
  });

  // 등록 버튼은 서버(policies.canCreateSR — ADMIN 또는 SR:CREATE)와 같은 규칙으로만 보인다. ENGINEER 는 시드상
  // SR:CREATE 가 없어 예전에는 누르면 반드시 403 이었다.
  it('SR 생성 권한이 없으면 등록 버튼을 보이지 않는다', () => {
    vi.mocked(usePermissions).mockReturnValue({
      hasAnyRole: (roles: string[]) => roles.includes('ENGINEER'),
      hasPermission: () => false,
      isAdmin: () => false,
      roles: ['ENGINEER'],
      permissions: ['SR:READ', 'SR:UPDATE'],
    } as never);
    render(<SRsDataTable {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /등록/ })).not.toBeInTheDocument();
  });

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
