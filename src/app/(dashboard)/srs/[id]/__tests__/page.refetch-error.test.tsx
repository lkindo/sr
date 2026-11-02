import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSRDetails: vi.fn(),
  refetch: vi.fn(),
  stub: (name: string) => ({ [name]: () => null }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sr-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-1' } } }) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasAnyRole: () => false, roles: [], permissions: [] }),
}));
vi.mock('@/hooks/use-sr', () => ({
  useSRDetails: mocks.useSRDetails,
  useDeleteSR: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/components/srs/DeleteSRDialog', () => mocks.stub('DeleteSRDialog'));
vi.mock('@/components/srs/DueDateAdjustDialog', () => mocks.stub('DueDateAdjustDialog'));
vi.mock('@/components/srs/EditSRDialog', () => mocks.stub('EditSRDialog'));
vi.mock('@/components/srs/IntakeInfoCard', () => mocks.stub('IntakeInfoCard'));
vi.mock('@/components/srs/SRActivities', () => mocks.stub('SRActivities'));
vi.mock('@/components/srs/SRAttachments', () => mocks.stub('SRAttachments'));
vi.mock('@/components/srs/SRComments', () => ({
  SRComments: () => <textarea aria-label="댓글 초안" />,
}));
vi.mock('@/components/srs/SRDueDateField', () => mocks.stub('SRDueDateField'));
vi.mock('@/components/srs/SRStatusActions', () => ({
  SRStatusActions: () => null,
  SRReopenBlockedNotice: () => null,
}));
vi.mock('@/components/srs/SRStatusBadge', () => mocks.stub('SRStatusBadge'));
vi.mock('@/components/srs/SRStatusTimeline', () => mocks.stub('SRStatusTimeline'));

import SRDetailPage from '../page';

const SR = {
  id: 'sr-1',
  srNumber: 'SR-20261101-0001',
  title: '프린터 고장',
  description: '내용',
  status: 'IN_PROGRESS',
  clientId: 'client-1',
  requesterId: 'req-1',
  assigneeId: null,
  client: { id: 'client-1', code: 'C1', name: '고객사' },
  requester: { id: 'req-1', name: '신청자', email: 'r@example.com' },
  assignee: null,
  serviceCategory: { id: 'cat-1', name: '장애', slaHours: 24 },
  requestedPriority: 'MEDIUM',
  actualPriority: 'MEDIUM',
  priority: 'MEDIUM',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  statusHistory: [],
  version: 1,
};

const query = (overrides: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  error: null,
  refetch: mocks.refetch,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SR 상세의 조회 실패', () => {
  // 실시간 갱신의 재조회가 한 번 실패했다고 화면을 바꾸면 작성 중인 내용이 사라진다.
  it('보여 줄 내용이 있으면 재조회가 실패해도 화면을 유지하고 알린다', () => {
    mocks.useSRDetails.mockReturnValue(query({ data: SR, error: new Error('network') }));

    render(<SRDetailPage />);

    expect(screen.getByText('프린터 고장')).toBeInTheDocument();
    expect(screen.getByLabelText('댓글 초안')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('최신 내용을 불러오지 못했습니다');

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('보여 줄 내용이 없으면 오류 화면을 보여 준다', () => {
    mocks.useSRDetails.mockReturnValue(query({ error: new Error('권한이 없습니다') }));

    render(<SRDetailPage />);

    expect(screen.getByText('SR을 불러올 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('권한이 없습니다')).toBeInTheDocument();
  });

  it('정상이면 알림을 띄우지 않는다', () => {
    mocks.useSRDetails.mockReturnValue(query({ data: SR }));

    render(<SRDetailPage />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SR 상세의 탭 전환', () => {
  it('다른 탭을 보고 돌아와도 쓰던 댓글이 남고, 보는 동안에는 숨겨진다', () => {
    mocks.useSRDetails.mockReturnValue(query({ data: SR }));
    render(<SRDetailPage />);

    const draft = screen.getByLabelText('댓글 초안');
    fireEvent.change(draft, { target: { value: '쓰던 댓글' } });

    fireEvent.mouseDown(screen.getByRole('tab', { name: /활동/ }), { button: 0 });
    const panel = screen.getByLabelText('댓글 초안').closest('[role="tabpanel"]');
    expect(panel).toHaveAttribute('data-state', 'inactive');
    expect(panel).toHaveClass('data-[state=inactive]:hidden');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /댓글/ }), { button: 0 });
    expect(screen.getByLabelText('댓글 초안')).toHaveValue('쓰던 댓글');
  });
});
