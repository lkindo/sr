import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { statusLabels } from '@/lib/constants/sr';

import { SRStatusTimeline } from '../SRStatusTimeline';

/**
 * 상태 변경 이력 타임라인.
 *
 * 이 컴포넌트는 순수 표현 컴포넌트다 — 훅도 서버 호출도 없다. 그래서 목이 하나도
 * 없고, 실물 `Badge` / `Card` 를 그대로 렌더한다. 배지 variant 를 클래스로 단언하려면
 * 실물이어야 하기 때문이다(`@/__tests__/mocks/ui-primitives` 의 Badge 대역은 variant 를
 * 버린다 — 여기서는 쓸 수 없다).
 *
 * 판정이 전부 **맵 조회 + 조건부 렌더**라, 확인해야 할 것은 "렌더되는가" 가 아니라
 * 상태값마다 **어느 가지로 떨어지는가** 다:
 *   - 상태 7종의 라벨·배지색·아이콘 (화이트리스트에 없는 값의 폴백까지)
 *   - 현재 상태 강조 / 비강조
 *   - 첫 항목(최근) / 나머지
 *   - 연결선(마지막 항목만 없음)
 *   - 변경 사유 있음 / 없음
 *   - 경과 시간 6구간, 그리고 주 → 월 경계(26~31일) 전수
 */

/** 컴포넌트가 export 하지 않는 항목 타입. 화면이 읽는 필드가 전부다. */
interface History {
  id: string;
  previousStatus: string | null;
  currentStatus: string;
  changedAt: Date | string;
  changeReason: string | null;
  user: { id: string; name: string; image: string | null };
}

const item = (over: Partial<History> = {}): History => ({
  id: 'h1',
  previousStatus: null,
  currentStatus: 'REQUESTED',
  changedAt: new Date('2026-03-04T05:06:00.000Z'),
  changeReason: null,
  user: { id: 'u1', name: '홍길동', image: null },
  ...over,
});

/**
 * 상태 아이콘. 카드 안의 첫 `svg` 가 아이콘이고(그 다음은 작성자 옆 User 아이콘),
 * lucide 는 컴포넌트마다 다른 클래스(`lucide-clock` 등)를 붙인다.
 *
 * 클래스 문자열을 **문자 그대로 단언하지 않고 서로 비교만** 한다 — lucide 가 클래스
 * 이름을 바꿔도 이 테스트는 살아남되, 맵이 잘못 연결되면 여전히 깨진다.
 */
const iconClassFor = (currentStatus: string): string => {
  const { container, unmount } = render(
    <SRStatusTimeline statusHistory={[item({ currentStatus })]} currentStatus="NONE" />
  );
  const className = container.querySelector('svg')?.getAttribute('class') ?? '';
  unmount();
  return className;
};

describe('SRStatusTimeline — 빈 이력', () => {
  it('빈 배열이면 안내 문구만 낸다', () => {
    render(<SRStatusTimeline statusHistory={[]} currentStatus="REQUESTED" />);

    expect(screen.getByText('상태 변경 이력이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('최근')).not.toBeInTheDocument();
  });

  /**
   * `!statusHistory` 가드. 타입상으로는 올 수 없지만 서버 응답이 필드를 빠뜨리면
   * 실제로 `undefined` 가 온다 — 그때 `.length` 로 죽지 않아야 한다.
   */
  it('undefined 가 와도 죽지 않고 안내 문구를 낸다', () => {
    render(
      <SRStatusTimeline
        statusHistory={undefined as unknown as History[]}
        currentStatus="REQUESTED"
      />
    );

    expect(screen.getByText('상태 변경 이력이 없습니다.')).toBeInTheDocument();
  });
});

describe('SRStatusTimeline — 상태값 전수', () => {
  /** 배지 variant 별 대표 클래스. 실물 Badge 의 cva 정의에서 따온다. */
  const expected = {
    REQUESTED: 'bg-secondary',
    INTAKE: 'bg-primary/10',
    IN_PROGRESS: 'bg-primary/10',
    ON_HOLD: 'bg-secondary',
    COMPLETED: 'bg-primary/10',
    CONFIRMED: 'bg-primary/10',
    REJECTED: 'bg-destructive',
  } as const;

  it.each(Object.keys(expected) as (keyof typeof expected)[])(
    '%s 는 한국어 라벨과 지정된 배지색으로 그린다',
    (status) => {
      render(
        <SRStatusTimeline statusHistory={[item({ currentStatus: status })]} currentStatus="" />
      );

      const badge = screen.getByText(statusLabels[status]);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(expected[status]);
    }
  );

  it('세 가지 배지색이 실제로 서로 다르다', () => {
    // 위 it.each 만 있으면 맵이 통째로 한 색을 가리켜도(표를 그대로 베껴도) 통과한다.
    render(
      <SRStatusTimeline
        statusHistory={[
          item({ id: 'h1', currentStatus: 'REJECTED' }),
          item({ id: 'h2', currentStatus: 'REQUESTED' }),
          item({ id: 'h3', currentStatus: 'COMPLETED' }),
        ]}
        currentStatus=""
      />
    );

    const colors = new Set([
      screen.getByText('거절').className,
      screen.getByText('요청됨').className,
      screen.getByText('완료').className,
    ]);
    expect(colors.size).toBe(3);
  });

  /**
   * 화이트리스트에 없는 상태. 라벨은 `statusLabelOf` 가 원문을 그대로 돌려주고
   * 아이콘은 `|| Clock` 폴백으로 떨어져야 한다.
   */
  it('모르는 상태는 원문 라벨 + Clock 폴백 아이콘', () => {
    render(
      <SRStatusTimeline statusHistory={[item({ currentStatus: 'ESCALATED' })]} currentStatus="" />
    );

    expect(screen.getByText('ESCALATED')).toBeInTheDocument();
  });

  it('아이콘 맵이 상태별로 갈린다 (모르는 상태는 IN_PROGRESS 와 같은 Clock)', () => {
    const requested = iconClassFor('REQUESTED');
    const intake = iconClassFor('INTAKE');
    const inProgress = iconClassFor('IN_PROGRESS');
    const onHold = iconClassFor('ON_HOLD');
    const completed = iconClassFor('COMPLETED');
    const confirmed = iconClassFor('CONFIRMED');
    const rejected = iconClassFor('REJECTED');
    const unknown = iconClassFor('ESCALATED');

    // 같은 아이콘을 쓰기로 한 짝.
    expect(intake).toBe(inProgress);
    expect(completed).toBe(confirmed);
    // 폴백은 Clock 이다.
    expect(unknown).toBe(inProgress);

    // 나머지는 서로 달라야 한다 — 맵이 통째로 한 아이콘을 가리키면 여기서 깨진다.
    const distinct = new Set([requested, inProgress, onHold, completed, rejected]);
    expect(distinct.size).toBe(5);
    expect(requested).not.toBe('');
  });
});

describe('SRStatusTimeline — 항목별 분기', () => {
  it('현재 상태인 항목만 강조한다', () => {
    render(
      <SRStatusTimeline
        statusHistory={[
          item({ id: 'h1', currentStatus: 'IN_PROGRESS' }),
          item({ id: 'h2', currentStatus: 'INTAKE' }),
        ]}
        currentStatus="IN_PROGRESS"
      />
    );

    // 배지: 현재 상태에만 ring 이 붙는다.
    //
    // ⚠️ `ring-2` 로 겨냥하면 안 된다 — Badge 의 기본 클래스에 이미 `focus:ring-2` 가
    //    있어 어느 쪽이든 통과하는(=아무것도 검사하지 않는) 단언이 된다. 강조에만
    //    있는 `ring-primary` 로 겨냥한다.
    expect(screen.getByText('진행중').className).toContain('ring-primary');
    expect(screen.getByText('접수').className).not.toContain('ring-primary');

    // 아이콘 원: 현재 상태만 primary 채움.
    const circles = document.querySelectorAll('div.rounded-full.border-2');
    expect(circles).toHaveLength(2);
    expect(circles[0]!.className).toContain('bg-primary');
    expect(circles[1]!.className).toContain('bg-background');
  });

  it('현재 상태와 일치하는 항목이 하나도 없으면 아무것도 강조하지 않는다', () => {
    render(
      <SRStatusTimeline
        statusHistory={[item({ currentStatus: 'INTAKE' })]}
        currentStatus="REJECTED"
      />
    );

    expect(screen.getByText('접수').className).not.toContain('ring-primary');
    expect(document.querySelector('div.rounded-full.border-2')!.className).toContain(
      'bg-background'
    );
  });

  it('"최근" 배지는 첫 항목에만 붙는다', () => {
    render(
      <SRStatusTimeline
        statusHistory={[
          item({ id: 'h1', currentStatus: 'COMPLETED' }),
          item({ id: 'h2', currentStatus: 'IN_PROGRESS' }),
          item({ id: 'h3', currentStatus: 'INTAKE' }),
        ]}
        currentStatus="COMPLETED"
      />
    );

    expect(screen.getAllByText('최근')).toHaveLength(1);
    // 첫 항목 안에 있어야 한다 — 개수만 세면 마지막에 붙어도 통과한다.
    const rows = document.querySelectorAll('div.space-y-4 > div.relative');
    expect(rows[0]!).toHaveTextContent('최근');
    expect(rows[1]!).not.toHaveTextContent('최근');
  });

  it('연결선은 마지막 항목을 뺀 개수만큼 그린다', () => {
    const { unmount } = render(
      <SRStatusTimeline
        statusHistory={[item({ id: 'h1' }), item({ id: 'h2' }), item({ id: 'h3' })]}
        currentStatus="REQUESTED"
      />
    );
    expect(document.querySelectorAll('div.bg-border')).toHaveLength(2);
    unmount();

    render(<SRStatusTimeline statusHistory={[item()]} currentStatus="REQUESTED" />);
    expect(document.querySelectorAll('div.bg-border')).toHaveLength(0);
  });

  it('변경 사유는 있을 때만 낸다', () => {
    const { unmount } = render(
      <SRStatusTimeline
        statusHistory={[item({ changeReason: '고객사 요청으로 보류' })]}
        currentStatus="ON_HOLD"
      />
    );
    expect(screen.getByText('고객사 요청으로 보류')).toBeInTheDocument();
    unmount();

    render(
      <SRStatusTimeline statusHistory={[item({ changeReason: null })]} currentStatus="REQUESTED" />
    );
    expect(screen.queryByText('고객사 요청으로 보류')).not.toBeInTheDocument();
  });

  it('작성자 이름과 절대 시각을 함께 낸다', () => {
    render(
      <SRStatusTimeline
        statusHistory={[
          item({
            changedAt: new Date('2026-03-04T05:06:00.000Z'),
            user: { id: 'u9', name: '김접수', image: null },
          }),
        ]}
        currentStatus="REQUESTED"
      />
    );

    expect(screen.getByText('김접수')).toBeInTheDocument();
    // 로케일 포맷 자체가 아니라 "연·월·일이 들어간 문자열이 나온다"를 본다.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});

describe('SRStatusTimeline — 경과 시간', () => {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  // 경계에 걸치지 않게 반 칸씩 띄운다 — 렌더 중 흐르는 밀리초로 흔들리지 않는다.
  // 타입 인자를 적지 않으면 표가 `(string | number)[][]` 로 추론돼 `Date.now() - ago`
  // 에서 컴파일이 깨진다.
  it.each<[string, number]>([
    ['방금 전', 30 * 1000],
    ['5분 전', 5.5 * MINUTE],
    ['3시간 전', 3.5 * HOUR],
    ['3일 전', 3.5 * DAY],
    ['1주 전', 10 * DAY],
    ['2개월 전', 61 * DAY],
  ])('%s', (label, ago) => {
    render(
      <SRStatusTimeline
        statusHistory={[item({ changedAt: new Date(Date.now() - ago) })]}
        currentStatus="REQUESTED"
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  /**
   * 주 → 월 경계 전수.
   *
   * 예전에는 주 가지가 `diffWeeks < 4`(27일까지)로 끊기고 월 가지는 `floor(d/30)` 이라
   * **28·29일이 "0개월 전"** 으로 샜다. 위 6구간 표는 61일 하나만 봐서 이 구멍을 놓쳤다.
   * 여기서 하루 단위로 못박아 둔다 — 두 가지가 다시 다른 단위로 갈라지면 빨간불이 된다.
   *
   * 반나절을 얹어 렌더 중 흐르는 밀리초로 경계가 흔들리지 않게 한다.
   */
  it.each<[number, string]>([
    [26, '3주 전'],
    [27, '3주 전'],
    [28, '4주 전'], // ← 예전 "0개월 전"
    [29, '4주 전'], // ← 예전 "0개월 전"
    [30, '1개월 전'],
    [31, '1개월 전'],
    [59, '1개월 전'],
    [60, '2개월 전'],
  ])('%i일 전은 "%s"', (days, label) => {
    render(
      <SRStatusTimeline
        statusHistory={[item({ changedAt: new Date(Date.now() - (days * DAY + 12 * HOUR)) })]}
        currentStatus="REQUESTED"
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('어떤 경과일에도 "0개월 전"/"0주 전" 은 나오지 않는다', () => {
    // 구간 조건을 잘못 만지면 특정 일수만 0 으로 새는 형태로 재발한다.
    // 7~120일을 한 번에 그려 놓고 0 이 섞였는지 본다.
    const days = Array.from({ length: 114 }, (_, i) => i + 7);

    render(
      <SRStatusTimeline
        statusHistory={days.map((d) =>
          item({ id: `h${d}`, changedAt: new Date(Date.now() - (d * DAY + 12 * HOUR)) })
        )}
        currentStatus="REQUESTED"
      />
    );

    expect(screen.queryByText('0개월 전')).not.toBeInTheDocument();
    expect(screen.queryByText('0주 전')).not.toBeInTheDocument();
  });

  it('문자열 날짜도 Date 와 같게 다룬다', () => {
    const ago = new Date(Date.now() - 2 * HOUR);

    const { unmount } = render(
      <SRStatusTimeline statusHistory={[item({ changedAt: ago })]} currentStatus="REQUESTED" />
    );
    expect(screen.getByText('2시간 전')).toBeInTheDocument();
    unmount();

    render(
      <SRStatusTimeline
        statusHistory={[item({ changedAt: ago.toISOString() })]}
        currentStatus="REQUESTED"
      />
    );
    expect(screen.getByText('2시간 전')).toBeInTheDocument();
  });
});
