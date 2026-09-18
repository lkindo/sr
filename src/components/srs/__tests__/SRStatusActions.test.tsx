import { useRouter } from 'next/navigation';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChangeSRStatus } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import {
  canViewerConfirmSR,
  getReopenAvailability,
  type ReopenViewer,
} from '@/lib/sr-state-machine';

import { SRReopenBlockedNotice, SRStatusActions } from '../SRStatusActions';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

vi.mock('@/hooks/use-sr', () => ({
  useChangeSRStatus: vi.fn(),
}));

/**
 * ⚠️ `@tanstack/react-query` 는 **목킹하지 않는다.**
 *
 * 예전에는 여기 `vi.mock('@tanstack/react-query', () => ({ useQueryClient: vi.fn() }))` 가
 * 있었다. 팩토리가 모듈 전체를 갈아치우면서 내보내는 것은 함수 하나뿐이라, 이 트리의
 * 어떤 컴포넌트가 `useMutation` 을 쓰기 시작하는 순간 `useMutation is not a function`
 * 으로 죽는 지뢰였다(실제로 SRStatusChangeDialog 가 그렇게 됐다).
 *
 * 그리고 애초에 필요가 없다 — SRStatusActions 자신은 react-query 를 직접 import 하지
 * 않고, 캐시를 만지는 두 경로는 아래에서 각각 목으로 대체돼 있다:
 * 상태 전이는 `useChangeSRStatus`, 다이얼로그는 `../SRStatusChangeDialog`.
 */

// 다이얼로그는 하나로 합쳐졌다(SRStatusChangeDialog). action 을 testid 에 실어
// "어떤 전이의 다이얼로그가 열렸는가"를 예전과 같은 수준으로 계속 구분할 수 있게 한다.
// 재오픈 다이얼로그는 받은 차단 사유도 함께 드러내 "다이얼로그에도 같은 이유가 간다" 를 본다.
vi.mock('../SRStatusChangeDialog', () => ({
  SRStatusChangeDialog: ({
    action,
    open,
    disabledReason,
  }: {
    action: string;
    open: boolean;
    disabledReason?: string | null;
  }) => (
    <div
      data-testid={`${action}-dialog`}
      data-open={String(open)}
      data-disabled-reason={disabledReason ?? ''}
    />
  ),
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** prisma/seed.ts 가 역할마다 부여하는 SR 권한(재오픈 판정에 쓰이는 것만). */
const SEED_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['SR:UPDATE', 'SR:CONFIRM'],
  MANAGER: ['SR:UPDATE', 'SR:UPDATE_SELF', 'SR:STATUS_CHANGE'],
  ENGINEER: ['SR:UPDATE', 'SR:STATUS_CHANGE'],
  CLIENT_ADMIN: ['SR:UPDATE', 'SR:STATUS_CHANGE', 'SR:CONFIRM'],
  CLIENT_USER: ['SR:UPDATE_SELF', 'SR:CONFIRM'],
};

type Status =
  'REQUESTED' | 'INTAKE' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CONFIRMED' | 'REJECTED';

interface Scenario {
  status: Status;
  userRoles: string[];
  isRequestor: boolean;
  /** 신청자가 운영자(내부 사용자)인가 — 운영자가 자기 이름으로 등록한 SR. 기본값 false. */
  requesterIsInternal?: boolean;
  /** 기본값은 역할별 시드 권한. */
  permissions?: string[];
  completedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
  assigneeId?: string | null;
}

/**
 * 상세 페이지(`srs/[id]/page.tsx`)와 같은 조립 — 재오픈 판정을 **실제 상태 머신으로**
 * 한 번 계산해 버튼과 안내에 같은 값을 준다. 판정 결과를 손으로 만들어 넣으면 이 테스트는
 * 컴포넌트가 prop 을 그리는지만 보게 되고, 규칙과 화면이 갈라지는 것을 못 잡는다.
 */
function Harness({
  status,
  userRoles,
  isRequestor,
  requesterIsInternal = false,
  permissions,
  completedAt = new Date(Date.now() - DAY),
  confirmedAt = null,
  assigneeId = 'eng-1',
}: Scenario) {
  const viewer: ReopenViewer = {
    id: 'viewer',
    roles: userRoles,
    permissions: permissions ?? userRoles.flatMap((role) => SEED_PERMISSIONS[role] ?? []),
    clientIds: ['client-1'],
  };
  const sr = {
    status,
    completedAt,
    confirmedAt,
    assigneeId,
    clientId: 'client-1',
    requesterId: isRequestor ? 'viewer' : 'requester',
    requesterIsInternal,
  };
  const reopen = getReopenAvailability(status, sr, viewer);
  return (
    <>
      <SRStatusActions
        srId="sr-123"
        srNumber="SR-2024-001"
        status={status}
        userRoles={userRoles}
        canConfirm={canViewerConfirmSR(viewer, sr)}
        reopen={reopen}
      />
      <SRReopenBlockedNotice reopen={reopen} />
    </>
  );
}

describe('SRStatusActions Component', () => {
  const mockPush = vi.fn();
  const mockRefresh = vi.fn();
  const mockToast = vi.fn();
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush, refresh: mockRefresh });
    (useToast as any).mockReturnValue({ toast: mockToast });
    (useChangeSRStatus as any).mockReturnValue({ mutateAsync: mockMutateAsync });

    // Mock global fetch
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps: Scenario = {
    status: 'REQUESTED',
    userRoles: ['ADMIN'],
    isRequestor: false,
  };

  const reopenButton = () => screen.getByRole('button', { name: '재오픈' });
  const notice = () => screen.queryByTestId('sr-reopen-blocked-reason');

  describe('Rendering based on Status and Roles', () => {
    it('renders "접수하기" and "거절" for REQUESTED state if user is ADMIN', () => {
      render(<Harness {...defaultProps} />);
      expect(screen.getByText('접수하기')).toBeInTheDocument();
      expect(screen.getByText('거절')).toBeInTheDocument();
    });

    it('renders nothing for REQUESTED state if user is only basic USER', () => {
      render(<Harness {...defaultProps} userRoles={['USER']} />);
      expect(screen.queryByText('접수하기')).not.toBeInTheDocument();
      expect(screen.queryByText('거절')).not.toBeInTheDocument();
    });

    it('renders "완료 처리" and "보류" for IN_PROGRESS state', () => {
      render(<Harness {...defaultProps} status="IN_PROGRESS" />);
      expect(screen.getByText('완료 처리')).toBeInTheDocument();
      expect(screen.getByText('보류')).toBeInTheDocument();
    });

    it('renders "확인 완료" for COMPLETED state if user is Requestor', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={true}
          userRoles={['CLIENT_USER']}
        />
      );
      expect(screen.getByText('확인 완료')).toBeInTheDocument();
    });

    // 소유자 결정(2026-09-18): 운영자가 자기 이름으로 등록한 SR 은 등록한 본인 또는 그 고객사의
    // CLIENT_ADMIN 이 확인한다. 예전에는 MANAGER 신청자에게 버튼이 보였지만 서버가 반드시 거부했고,
    // 다른 사람에게는 버튼이 없어 그 SR 은 영원히 '완료' 에 머물렀다.
    it('운영자(MANAGER)가 자기 이름으로 등록한 SR 은 본인이 확인할 수 있다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={true}
          requesterIsInternal={true}
          userRoles={['MANAGER']}
        />
      );
      expect(screen.getByRole('button', { name: '확인 완료' })).toBeInTheDocument();
    });

    it('운영자가 등록한 SR 은 그 고객사의 CLIENT_ADMIN 도 확인할 수 있다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={false}
          requesterIsInternal={true}
          userRoles={['CLIENT_ADMIN']}
        />
      );
      expect(screen.getByRole('button', { name: '확인 완료' })).toBeInTheDocument();
    });

    it('고객 사용자가 신청한 SR 은 같은 고객사 CLIENT_ADMIN 이라도 대신 확인할 수 없다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={false}
          requesterIsInternal={false}
          userRoles={['CLIENT_ADMIN']}
        />
      );
      expect(screen.queryByRole('button', { name: '확인 완료' })).not.toBeInTheDocument();
    });

    it('신청자가 아닌 MANAGER 는 운영자가 등록한 SR 이라도 확인할 수 없다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={false}
          requesterIsInternal={true}
          userRoles={['MANAGER']}
        />
      );
      expect(screen.queryByRole('button', { name: '확인 완료' })).not.toBeInTheDocument();
    });

    // 접수(INTAKE) 상태에서도 거절할 수 있다 — 전이표(INTAKE → REJECTED)·status 라우트·헌법이 모두
    // 허용하는데 화면에만 버튼이 없어서, 접수 뒤 범위 밖으로 판명된 SR 을 거절할 길이 없었다.
    it('renders "진행 시작" and "거절" for INTAKE state if user can manage', () => {
      render(<Harness {...defaultProps} status="INTAKE" />);
      expect(screen.getByText('진행 시작')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
    });

    it('renders nothing for INTAKE state if user cannot manage', () => {
      render(<Harness {...defaultProps} status="INTAKE" userRoles={['USER']} />);
      expect(screen.queryByText('진행 시작')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
    });

    it('renders "진행 재개" and "거절" for ON_HOLD state', () => {
      render(<Harness {...defaultProps} status="ON_HOLD" />);
      expect(screen.getByText('진행 재개')).toBeInTheDocument();
      expect(screen.getByText('거절')).toBeInTheDocument();
    });

    it('renders nothing for ON_HOLD state if user cannot manage', () => {
      render(<Harness {...defaultProps} status="ON_HOLD" userRoles={['USER']} />);
      expect(screen.queryByText('진행 재개')).not.toBeInTheDocument();
    });

    it('renders "재오픈" for CONFIRMED state if user is requestor or manager', () => {
      render(
        <Harness
          {...defaultProps}
          status="CONFIRMED"
          isRequestor={true}
          userRoles={['CLIENT_USER']}
        />
      );
      expect(screen.getByText('재오픈')).toBeInTheDocument();
      expect(reopenButton()).toBeEnabled();
    });

    it('renders nothing for CONFIRMED state if user is neither requestor nor manager', () => {
      render(
        <Harness {...defaultProps} status="CONFIRMED" isRequestor={false} userRoles={['USER']} />
      );
      expect(screen.queryByText('재오픈')).not.toBeInTheDocument();
      expect(notice()).not.toBeInTheDocument();
    });

    it('renders nothing for REJECTED state', () => {
      render(<Harness {...defaultProps} status="REJECTED" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders "재오픈" for COMPLETED state if user is manager', () => {
      render(
        <Harness {...defaultProps} status="COMPLETED" isRequestor={false} userRoles={['MANAGER']} />
      );
      expect(screen.getByText('재오픈')).toBeInTheDocument();
      expect(reopenButton()).toBeEnabled();
    });

    // PRD 4.5(2026-08-01): ENGINEER 는 재오픈하지 않는다. 막힌 버튼도 보이지 않는다.
    it('does not render "재오픈" for a non-requester ENGINEER', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={false}
          userRoles={['ENGINEER']}
        />
      );
      expect(screen.queryByRole('button', { name: '재오픈' })).not.toBeInTheDocument();
      expect(notice()).not.toBeInTheDocument();
    });
  });

  /**
   * 재오픈이 막힌 경우 — 버튼은 **보이되 비활성**이고, 이유는 화면에 **글로** 보인다.
   *
   * 예전에는 막혀도 버튼이 활성이었고(서버가 400/403), 7일 창만 다이얼로그 안의 작은 빨간
   * 글로 알렸다. 스테이징의 "ADMIN 이 재오픈을 못 한다" 보고가 그 글을 보지 못한 채 들어왔다.
   */
  describe('재오픈이 막힌 경우', () => {
    /**
     * @param title 안내 제목 — 막힌 이유의 요약이다(코드별로 다르다).
     * @param message 안내 본문 — 서버 거부 문구와 같은 글자여야 한다.
     */
    const expectBlocked = (title: string, message: string | RegExp) => {
      // 안내는 제목 뒤에 본문이 온다. 본문 정규식의 ^ 는 그 뒤에 건다.
      const withTitle = (separator: string) =>
        typeof message === 'string'
          ? `${title}${separator}${message}`
          : new RegExp(`^${title}${separator}${message.source.replace(/^\^/, '')}`);

      const button = reopenButton();
      expect(button).toBeDisabled();
      // 모바일에서 버튼은 아이콘뿐이다 — 이름은 '재오픈' 그대로, 이유는 설명으로 연결한다.
      expect(button).toHaveAccessibleName('재오픈');
      expect(button).toHaveAttribute('aria-describedby', 'sr-reopen-blocked-reason');
      expect(button).toHaveAccessibleDescription(withTitle(' '));

      const text = notice();
      expect(text).toBeInTheDocument();
      expect(text).toBeVisible();
      expect(text).toHaveTextContent(withTitle(''));

      // 안내 제목은 **헤딩이 아니다**. 이 안내는 상세 페이지의 h1(SR 번호)과 h2(상세 정보)
      // 사이에 들어가므로, 헤딩으로 그리면 h1 → h5 → h2 가 되어 heading-order 를 깨뜨린다
      // (e2e/21 이 axe 로 같은 회귀를 페이지 전체에서 막는다).
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();

      // 다이얼로그에도 같은 이유가 간다(열린 뒤 막히는 경우의 방어).
      const dialog = screen.getByTestId('reopen-dialog');
      if (typeof message === 'string') {
        expect(dialog).toHaveAttribute('data-disabled-reason', message);
      } else {
        expect(dialog.getAttribute('data-disabled-reason')).toMatch(message);
      }

      // 눌러도 다이얼로그가 열리지 않는다.
      fireEvent.click(button);
      expect(dialog).toHaveAttribute('data-open', 'false');
    };

    it('ADMIN: 완료 후 7일이 지나면 막히고 완료 시각·기한(KST)을 보여 준다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          userRoles={['ADMIN']}
          completedAt="2026-01-05T05:00:00.000Z"
        />
      );
      expectBlocked(
        '재오픈 기한이 지났습니다',
        '완료 후 7일이 지나 재오픈할 수 없습니다. ' +
          '(완료 2026. 01. 05. 14:00 · 재오픈 기한 2026. 01. 12. 14:00) ' +
          '추가 작업이 필요하면 새 SR을 등록해주세요.'
      );
    });

    it('CONFIRMED: 확인 후 7일이 지나면 "확인 후" 로 막힌다', () => {
      render(
        <Harness
          {...defaultProps}
          status="CONFIRMED"
          userRoles={['ADMIN']}
          completedAt={new Date(Date.now() - 20 * DAY)}
          confirmedAt={new Date(Date.now() - 8 * DAY)}
        />
      );
      expectBlocked(
        '재오픈 기한이 지났습니다',
        /^확인 후 7일이 지나 재오픈할 수 없습니다\. \(확인 /
      );
    });

    /**
     * 예전 화면의 버그: CONFIRMED 인데 completedAt 으로 창을 재서, 완료 20일 뒤 확인하고
     * 2일 뒤 재오픈하려는 SR 을 막았다(서버는 허용한다).
     */
    it('CONFIRMED: 늦게 확인한 SR 은 완료가 오래돼도 확인 시각 기준으로 재오픈할 수 있다', () => {
      render(
        <Harness
          {...defaultProps}
          status="CONFIRMED"
          userRoles={['ADMIN']}
          completedAt={new Date(Date.now() - 20 * DAY)}
          confirmedAt={new Date(Date.now() - 2 * DAY)}
        />
      );
      expect(reopenButton()).toBeEnabled();
      expect(reopenButton()).not.toHaveAttribute('aria-describedby');
      expect(notice()).not.toBeInTheDocument();
      expect(screen.getByTestId('reopen-dialog')).toHaveAttribute('data-disabled-reason', '');

      fireEvent.click(reopenButton());
      expect(screen.getByTestId('reopen-dialog')).toHaveAttribute('data-open', 'true');
    });

    it('완료 시각이 없으면(레거시) 막힌다 — fail-closed', () => {
      render(
        <Harness {...defaultProps} status="COMPLETED" userRoles={['ADMIN']} completedAt={null} />
      );
      expectBlocked(
        '재오픈 기한을 확인할 수 없습니다',
        /^완료 시각 기록이 없어 .*관리자에게 문의해주세요\.$/
      );
    });

    it('담당자가 없으면 막힌다', () => {
      render(
        <Harness {...defaultProps} status="COMPLETED" userRoles={['ADMIN']} assigneeId={null} />
      );
      expectBlocked(
        '담당자가 지정되지 않았습니다',
        /^담당자가 지정되지 않아 재오픈할 수 없습니다\./
      );
    });

    it('신청자가 아닌 같은 고객사 CLIENT_USER 는 403 대신 비활성 버튼과 이유를 받는다', () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          userRoles={['CLIENT_USER']}
          isRequestor={false}
        />
      );
      expectBlocked(
        '재오픈 권한이 없습니다',
        '요청자 본인 또는 고객사 관리자만 재오픈할 수 있습니다. ' +
          '재오픈이 필요하면 요청자나 고객사 관리자에게 요청해주세요.'
      );
    });

    it('재오픈 전이 권한이 없는 신청자는 비활성 버튼과 서버 인가 문구를 받는다', () => {
      render(
        <Harness
          {...defaultProps}
          status="CONFIRMED"
          userRoles={['CUSTOM_ROLE']}
          permissions={['SR:UPDATE_SELF']}
          isRequestor={true}
        />
      );
      expectBlocked('재오픈 권한이 없습니다', /^이 상태 변경을 수행할 권한이 없습니다\./);
    });

    it('막히지 않았으면 안내를 그리지 않는다', () => {
      render(<Harness {...defaultProps} status="COMPLETED" userRoles={['ADMIN']} />);
      expect(reopenButton()).toBeEnabled();
      expect(notice()).not.toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('navigates to intake page when "접수하기" is clicked', () => {
      render(<Harness {...defaultProps} />);
      fireEvent.click(screen.getByText('접수하기'));
      expect(mockPush).toHaveBeenCalledWith('/srs/sr-123/intake');
    });

    it('calls status patch API when "진행 재개" is clicked (ON_HOLD)', async () => {
      render(<Harness {...defaultProps} status="ON_HOLD" />);
      fireEvent.click(screen.getByText('진행 재개'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'resume' });
        },
        { timeout: 5000 }
      );

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '성공',
        })
      );
    });

    it('calls status patch API when "진행 시작" is clicked (INTAKE)', async () => {
      render(<Harness {...defaultProps} status="INTAKE" />);
      fireEvent.click(screen.getByText('진행 시작'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'start' });
        },
        { timeout: 5000 }
      );
    });

    it('calls status patch API when "확인 완료" is clicked (COMPLETED)', async () => {
      render(
        <Harness
          {...defaultProps}
          status="COMPLETED"
          isRequestor={true}
          userRoles={['CLIENT_USER']}
        />
      );
      fireEvent.click(screen.getByText('확인 완료'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'confirm' });
        },
        { timeout: 5000 }
      );
    });

    it('shows error toast when mutation fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Network error'));

      render(<Harness {...defaultProps} status="ON_HOLD" />);
      fireEvent.click(screen.getByText('진행 재개'));

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '오류',
              description: 'Network error',
              variant: 'destructive',
            })
          );
        },
        { timeout: 5000 }
      );
    });

    it('successfully changes status on click', async () => {
      mockMutateAsync.mockResolvedValue({ success: true });

      render(<Harness {...defaultProps} status="ON_HOLD" />);
      fireEvent.click(screen.getByText('진행 재개'));

      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith({ action: 'resume' });
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: '성공',
            })
          );
        },
        { timeout: 5000 }
      );
    });
  });
});
