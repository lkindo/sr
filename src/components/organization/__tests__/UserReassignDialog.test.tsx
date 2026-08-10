import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserReassignDialog } from '../UserReassignDialog';

/**
 * 사용자 소속(고객사) 변경 확인 다이얼로그.
 *
 * 이 화면의 계약은 두 가지다.
 *
 * 1. **진행 중인 SR 이 있으면 그 사실을 숨기지 않는다.** 소속을 옮겨도 기존 SR 은
 *    따라가지 않으므로, 목록을 보여 주지 않으면 관리자는 남의 고객사에 매달린 SR 을
 *    모른 채 이동시킨다. 다만 경고는 호출부가 확인 API 를 돌린 뒤에만 켠다
 *    (`showWarning`) — 그래서 "SR 은 있는데 아직 경고 단계가 아닌" 상태가 존재하고,
 *    그때 경고가 새어 나오면 1단계 확인이 무의미해진다.
 * 2. **확인 버튼이 `force` 를 무엇으로 보내는가.** 경고 단계에서 누른 확인만
 *    `onConfirm(true)` 여야 한다. 여기가 뒤집히면 1단계 확인이 그대로 강제 이동이 된다.
 *
 * `@/components/ui` 는 공용 대역(`src/__tests__/mocks/ui-primitives`)을 쓰되,
 * 그 대역에 없는 AlertDialog 계열만 이 파일에서 얹는다. 공용 대역은 건드리지 않는다.
 */

vi.mock('@/components/ui', async () => {
  const { uiMock } = await import('@/__tests__/mocks/ui-primitives');

  interface Children {
    children?: ReactNode;
  }
  interface RootProps extends Children {
    open?: boolean;
  }
  interface ActionProps extends Children {
    onClick?: (event: MouseEvent) => void;
    disabled?: boolean;
  }

  const box = ({ children }: Children) => <div>{children}</div>;

  return {
    ...uiMock(),
    AlertDialog: ({ children, open }: RootProps) => (open ? <div>{children}</div> : null),
    AlertDialogContent: box,
    AlertDialogHeader: box,
    AlertDialogFooter: box,
    AlertDialogTitle: ({ children }: Children) => <h2>{children}</h2>,
    AlertDialogDescription: box,
    AlertDialogCancel: ({ children, disabled }: ActionProps) => (
      <button disabled={disabled}>{children}</button>
    ),
    AlertDialogAction: ({ children, onClick, disabled }: ActionProps) => (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

type Props = Parameters<typeof UserReassignDialog>[0];
type OngoingSR = NonNullable<Props['ongoingSRs']>[number];

const makeSR = (over: Partial<OngoingSR> = {}): OngoingSR => ({
  id: 'sr-1',
  srNumber: 'SR-2026-001',
  title: '로그인 실패',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  clientName: '이전 고객사',
  ...over,
});

const onConfirm = vi.fn();
const onOpenChange = vi.fn();

const baseProps: Props = {
  open: true,
  onOpenChange,
  userName: '홍길동',
  sourceClientName: '이전 고객사',
  targetClientName: '새 고객사',
  onConfirm,
};

function renderDialog(props: Partial<Props> = {}) {
  return render(<UserReassignDialog {...baseProps} {...props} />);
}

/** 경고 블록이 떠 있는가. 제목의 아이콘이 아니라 블록 본문으로 판정한다. */
const warningShown = () => screen.queryByText(/진행 중인 SR .*건이 있습니다/) !== null;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserReassignDialog — 기본 표시', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    renderDialog({ open: false });

    expect(screen.queryByText('사용자 소속 변경')).not.toBeInTheDocument();
  });

  // 옵션 prop 을 전부 생략한 기본값 경로. 경고도 로딩도 없어야 한다.
  it('선택 prop 을 생략하면 경고 없이 평범한 확인창이다', () => {
    renderDialog();

    expect(screen.getByText('사용자 소속 변경')).toBeInTheDocument();
    expect(warningShown()).toBe(false);
    expect(screen.getByRole('button', { name: '확인' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).not.toBeDisabled();
  });

  it('누구를 어디서 어디로 옮기는지 모두 보여 준다', () => {
    renderDialog({ sourceClientName: 'A사', targetClientName: 'B사', userName: '김철수' });

    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.getByText('A사')).toBeInTheDocument();
    expect(screen.getByText('B사')).toBeInTheDocument();
  });
});

describe('UserReassignDialog — 경고 블록의 두 조건', () => {
  // 경고는 `ongoingSRs 가 있다` **그리고** `showWarning` 일 때만 뜬다.
  // 네 조합 중 하나만 참이다.
  it('SR 목록이 비어 있으면 showWarning 이어도 경고는 없다', () => {
    renderDialog({ ongoingSRs: [], showWarning: true });

    expect(warningShown()).toBe(false);
  });

  it('SR 이 있어도 showWarning 이 아니면 경고는 없다 (1단계 확인)', () => {
    renderDialog({ ongoingSRs: [makeSR()], showWarning: false });

    expect(warningShown()).toBe(false);
    expect(screen.queryByText('SR-2026-001')).not.toBeInTheDocument();
  });

  it('둘 다 참일 때만 경고와 목록을 편다', () => {
    renderDialog({
      ongoingSRs: [makeSR(), makeSR({ id: 'sr-2', srNumber: 'SR-2026-002' })],
      showWarning: true,
    });

    expect(screen.getByText('진행 중인 SR 2건이 있습니다')).toBeInTheDocument();
    expect(screen.getByText('진행 중인 SR 목록')).toBeInTheDocument();
    expect(screen.getByText('SR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('SR-2026-002')).toBeInTheDocument();
  });

  it('SR 카드에 번호·제목·고객사를 함께 싣는다', () => {
    renderDialog({
      ongoingSRs: [makeSR({ title: '결제 오류', clientName: '한빛' })],
      showWarning: true,
    });

    expect(screen.getByText('결제 오류')).toBeInTheDocument();
    expect(screen.getByText('고객사: 한빛')).toBeInTheDocument();
  });

  it('담당자가 배정된 SR 만 담당자를 표기한다', () => {
    renderDialog({
      ongoingSRs: [
        makeSR({ assigneeName: '이영희' }),
        makeSR({ id: 'sr-2', srNumber: 'SR-2026-002' }),
      ],
      showWarning: true,
    });

    expect(screen.getByText('담당자: 이영희')).toBeInTheDocument();
    expect(screen.queryAllByText(/^담당자: /)).toHaveLength(1);
  });
});

describe('UserReassignDialog — 상태·우선순위 배지', () => {
  const withSR = (over: Partial<OngoingSR>) =>
    renderDialog({ ongoingSRs: [makeSR(over)], showWarning: true });

  // 진행 중으로 간주되는 상태 전부. 하나라도 매핑이 빠지면 관리자에게
  // 'ON_HOLD' 같은 원문 코드가 그대로 노출된다.
  it.each([
    ['REQUESTED', '요청됨'],
    ['INTAKE', '접수중'],
    ['IN_PROGRESS', '진행중'],
    ['ON_HOLD', '보류'],
  ])('상태 %s 는 "%s" 로 보여 준다', (status, label) => {
    withSR({ status });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('모르는 상태 코드는 코드 그대로 보여 준다 (숨기지 않는다)', () => {
    withSR({ status: 'ESCALATED' });

    expect(screen.getByText('ESCALATED')).toBeInTheDocument();
  });

  it.each([
    ['CRITICAL', '긴급'],
    ['HIGH', '높음'],
    ['MEDIUM', '보통'],
    ['LOW', '낮음'],
  ])('우선순위 %s 는 "%s" 로 보여 준다', (priority, label) => {
    withSR({ priority });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('모르는 우선순위 코드는 코드 그대로 보여 준다', () => {
    withSR({ priority: 'TRIVIAL' });

    expect(screen.getByText('TRIVIAL')).toBeInTheDocument();
  });
});

describe('UserReassignDialog — 확인 버튼', () => {
  // 여기가 이 컴포넌트에서 가장 위험한 분기다. 1단계 확인이 force=true 를 보내면
  // 진행 중인 SR 경고를 건너뛴 채 이동이 확정된다.
  it('경고 단계가 아니면 force 없이(false) 확인한다', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('경고 단계의 버튼은 무엇을 감수하는지 라벨에 적고 force 로 확인한다', () => {
    renderDialog({ ongoingSRs: [makeSR()], showWarning: true });

    const button = screen.getByRole('button', { name: '진행 중인 SR 유지하고 이동' });
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
  });

  // 확인을 눌러도 다이얼로그가 스스로 닫히면 안 된다. 서버 응답을 기다려야 하고,
  // 실패하면 같은 자리에서 다시 시도할 수 있어야 한다.
  it.each([[false], [true]])('showWarning=%s 에서 기본 닫힘 동작을 막는다', (showWarning) => {
    renderDialog({ ongoingSRs: [makeSR()], showWarning });

    const label = showWarning ? '진행 중인 SR 유지하고 이동' : '확인';
    const notCancelled = fireEvent.click(screen.getByRole('button', { name: label }));

    expect(notCancelled).toBe(false); // preventDefault 가 불렸다는 뜻
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('UserReassignDialog — 처리 중', () => {
  const stages: Array<[boolean, string]> = [
    [false, '확인'],
    [true, '진행 중인 SR 유지하고 이동'],
  ];

  it.each(stages)('showWarning=%s: 처리 중에는 두 버튼을 모두 잠근다', (showWarning, idleLabel) => {
    renderDialog({ ongoingSRs: [makeSR()], showWarning, isLoading: true });

    expect(screen.queryByRole('button', { name: idleLabel })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /처리 중/ })).toBeDisabled();
    // 취소까지 막아야 요청이 날아간 뒤 창을 닫아 결과를 놓치는 일을 막는다.
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });

  it('잠긴 확인 버튼은 눌러도 onConfirm 을 부르지 않는다', () => {
    renderDialog({ isLoading: true });

    fireEvent.click(screen.getByRole('button', { name: /처리 중/ }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
