import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSRActivitiesInfinite } from '@/hooks/use-sr-infinite';
import { statusLabels } from '@/lib/constants/sr';

import { SRActivities } from '../SRActivities';

/**
 * 활동 이력 패널.
 *
 * 조회 훅만 목으로 둔다 — 서버 액션을 부르기 때문이다. 라이브러리(@tanstack/react-query)
 * 자체는 **실물 QueryClientProvider** 로 감싼다(SRComments.test.tsx 의 교훈: 라이브러리를
 * 통째로 갈아치우는 목은 컴포넌트가 훅을 하나 더 쓰는 순간 위장된 초록불이 된다).
 *
 * 이 화면의 분기는 세 층이다:
 *   1. 상태  — 로딩 / 실패 / 빈 목록 / 목록
 *   2. 항목  — 12가지 활동 유형의 라벨·배지색, 그리고 화이트리스트 밖 유형의 폴백
 *   3. 페이징 — hasNextPage 유무, 가져오는 중 여부, IntersectionObserver 진입 여부
 */

vi.mock('@/hooks/use-sr-infinite', () => ({
  useSRActivitiesInfinite: vi.fn(),
}));

/* ── IntersectionObserver 대역 ───────────────────────────────────────────────
 * jsdom 에는 없다. 콜백을 붙잡아 두고 테스트가 직접 "화면에 들어왔다"를 흉내낸다. */
interface FakeEntry {
  isIntersecting: boolean;
}
type IOCallback = (entries: FakeEntry[]) => void;

class FakeIntersectionObserver {
  static readonly instances: FakeIntersectionObserver[] = [];

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  constructor(readonly fire: IOCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
}

/** 같은 배열을 계속 쓰므로 beforeEach 에서 `length = 0` 으로 비운다. */
const observers = FakeIntersectionObserver.instances;

/**
 * 실물 provider. 클라이언트는 테스트마다 새로 만들되 **리렌더마다 새로 만들지는
 * 않는다** — wrapper 안에서 `new QueryClient()` 를 부르면 리렌더가 캐시를 통째로
 * 갈아치워 조용히 이상하게 동작한다.
 */
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const fetchNextPage = vi.fn();

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { name: string; image: string | null };
}

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  type: 'CREATED',
  description: 'SR 이 생성되었습니다.',
  createdAt: '2026-03-04T05:06:00.000Z',
  user: { name: 'Hong Gildong', image: null },
  ...over,
});

/** 조회 훅의 반환값. 화면이 읽는 필드만 채운다. */
const listed = (
  pages: Activity[][],
  extra: { hasNextPage?: boolean; isFetchingNextPage?: boolean } = {}
) =>
  vi.mocked(useSRActivitiesInfinite).mockReturnValue({
    data: { pages: pages.map((activities) => ({ activities })) },
    fetchNextPage,
    hasNextPage: extra.hasNextPage ?? false,
    isFetchingNextPage: extra.isFetchingNextPage ?? false,
    isLoading: false,
    error: null,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  observers.length = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SRActivities — 상태', () => {
  it('로딩 중에는 스크린리더에도 알린다', () => {
    vi.mocked(useSRActivitiesInfinite).mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('활동 이력을 불러오는 중')).toBeInTheDocument();
    // 로딩 중에는 목록도 제목도 없다.
    expect(screen.queryByText(/활동 이력 \(/)).not.toBeInTheDocument();
  });

  it('실패하면 오류 문구를 내고 목록을 그리지 않는다', () => {
    vi.mocked(useSRActivitiesInfinite).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('boom'),
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('활동 이력을 불러오는데 실패했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('활동 이력이 없습니다.')).not.toBeInTheDocument();
  });

  /**
   * 로딩도 실패도 아닌데 `data` 가 아직 undefined 인 순간이 있다(캐시 초기화 직후).
   * `data?.pages... || []` 폴백이 없으면 여기서 죽는다.
   */
  it('data 가 undefined 여도 빈 목록으로 그린다', () => {
    vi.mocked(useSRActivitiesInfinite).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: null,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('활동 이력 (0)')).toBeInTheDocument();
    expect(screen.getByText('활동 이력이 없습니다.')).toBeInTheDocument();
  });

  it('빈 페이지만 와도 빈 목록으로 그린다', () => {
    listed([[]]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('활동 이력 (0)')).toBeInTheDocument();
    expect(screen.getByText('활동 이력이 없습니다.')).toBeInTheDocument();
  });

  it('여러 페이지를 하나로 이어 붙이고 그 총합을 제목에 쓴다', () => {
    listed([
      [
        activity({ id: 'a1', description: '첫 페이지 1' }),
        activity({ id: 'a2', description: '첫 페이지 2' }),
      ],
      [activity({ id: 'a3', description: '둘째 페이지 1' })],
    ]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('활동 이력 (3)')).toBeInTheDocument();
    expect(screen.getByText('첫 페이지 1')).toBeInTheDocument();
    expect(screen.getByText('둘째 페이지 1')).toBeInTheDocument();
    expect(screen.queryByText('활동 이력이 없습니다.')).not.toBeInTheDocument();
  });
});

describe('SRActivities — 활동 유형', () => {
  /** prisma `SRActivityType` 전수. 라벨은 컴포넌트의 정본 맵과 같아야 한다. */
  const labels = {
    CREATED: '생성',
    STATUS_CHANGED: '상태 변경',
    PRIORITY_CHANGED: '우선순위 변경',
    ASSIGNED: '담당자 지정',
    REASSIGNED: '담당자 변경',
    COMMENTED: '댓글',
    ATTACHMENT_ADDED: '첨부 추가',
    ATTACHMENT_REMOVED: '첨부 삭제',
    REOPENED: '재요청',
    COMPLETED: '완료',
    // '반려' 가 아니다 — SR 상세 화면은 상태 타임라인과 활동 이력을 나란히 그리므로
    // 같은 enum 이 '거절'/'반려' 두 이름으로 보였다. 아래 정본 대조 테스트가 짝이다.
    REJECTED: '거절',
    INTAKE_UPDATED: '접수 정보 수정',
  } as const;

  /** 실물 Badge 의 cva 정의에서 따온 variant 별 대표 클래스. */
  const colors = {
    CREATED: 'bg-primary/10',
    STATUS_CHANGED: 'bg-primary/10',
    PRIORITY_CHANGED: 'bg-secondary',
    ASSIGNED: 'bg-primary/10',
    REASSIGNED: 'bg-secondary',
    COMMENTED: 'bg-secondary',
    ATTACHMENT_ADDED: 'bg-secondary',
    ATTACHMENT_REMOVED: 'bg-secondary',
    REOPENED: 'bg-destructive',
    COMPLETED: 'bg-primary/10',
    REJECTED: 'bg-destructive',
    INTAKE_UPDATED: 'bg-secondary',
  } as const;

  it.each(Object.keys(labels) as (keyof typeof labels)[])(
    '%s 는 한국어 라벨과 지정된 배지색으로 그린다',
    (type) => {
      listed([[activity({ type })]]);

      render(<SRActivities srId="sr-1" />, { wrapper });

      const badge = screen.getByText(labels[type]);
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain(colors[type]);
      // 영문 enum 이 그대로 새어 나오면 안 된다 — 이 화면의 원래 결함이 그것이었다.
      expect(screen.queryByText(type)).not.toBeInTheDocument();
    }
  );

  /**
   * 라벨 드리프트 잠금.
   *
   * 위 표는 컴포넌트를 그대로 베낀 것이라, 둘이 함께 '반려' 로 돌아가도 통과한다.
   * 여기서는 **정본**(`lib/constants/sr.ts` 의 statusLabels)과 대조한다 —
   * 활동 유형 맵과 상태 맵은 키 공간이 달라 별개지만, 이름이 겹치는 REJECTED 는
   * 한 화면에 나란히 보이므로 문구가 같아야 한다.
   */
  it('REJECTED 활동 라벨은 상태 라벨 정본과 같은 문구를 쓴다', () => {
    listed([[activity({ type: 'REJECTED' })]]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(statusLabels.REJECTED).toBe('거절');
    expect(screen.getByText(statusLabels.REJECTED)).toBeInTheDocument();
    expect(screen.queryByText('반려')).not.toBeInTheDocument();
  });

  it('세 가지 배지색이 실제로 서로 다르다', () => {
    // 위 표를 그대로 베낀 단언이 아니라는 것을 못박는다.
    listed([
      [
        activity({ id: 'a1', type: 'CREATED' }),
        activity({ id: 'a2', type: 'COMMENTED' }),
        activity({ id: 'a3', type: 'REOPENED' }),
      ],
    ]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    const seen = new Set([
      screen.getByText('생성').className,
      screen.getByText('댓글').className,
      screen.getByText('재요청').className,
    ]);
    expect(seen.size).toBe(3);
  });

  /**
   * 스키마가 앞서 나가 화면이 모르는 유형이 내려온 경우. 원문을 그대로 보이고
   * 배지색은 secondary 로 떨어져야 한다.
   */
  it('모르는 유형은 원문을 그대로 쓰고 secondary 로 떨어진다', () => {
    listed([[activity({ type: 'ESCALATED' })]]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    const badge = screen.getByText('ESCALATED');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-secondary');
  });

  it('작성자 이름의 이니셜을 두 글자까지 만든다', () => {
    listed([
      [
        activity({ id: 'a1', type: 'CREATED', user: { name: 'Hong Gildong', image: null } }),
        activity({ id: 'a2', type: 'COMMENTED', user: { name: '홍길동', image: null } }),
        activity({
          id: 'a3',
          type: 'ASSIGNED',
          user: { name: 'ann bee cee dee', image: null },
        }),
      ],
    ]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('HG')).toBeInTheDocument();
    expect(screen.getByText('홍')).toBeInTheDocument();
    // 네 단어라도 두 글자에서 자른다.
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('프로필 이미지가 있든 없든 이름과 설명을 낸다', () => {
    // jsdom 은 이미지를 실제로 불러오지 않아 Radix Avatar 는 늘 fallback 을 그린다.
    // 여기서 보는 것은 `activity.user.image || ''` 폴백이 렌더를 깨뜨리지 않는다는 것.
    listed([
      [
        activity({ id: 'a1', user: { name: 'With Image', image: 'https://example.test/a.png' } }),
        activity({ id: 'a2', user: { name: 'No Image', image: null } }),
      ],
    ]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('With Image')).toBeInTheDocument();
    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  it('발생 시각을 항목마다 낸다', () => {
    listed([[activity({ createdAt: '2026-03-04T05:06:00.000Z' })]]);

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});

describe('SRActivities — 페이징', () => {
  it('다음 페이지가 없으면 더 보기도 관찰자도 없다', () => {
    listed([[activity()]], { hasNextPage: false });

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    expect(observers).toHaveLength(0);
  });

  it('다음 페이지가 있으면 더 보기 버튼을 내고 누르면 가져온다', () => {
    listed([[activity()]], { hasNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    const more = screen.getByRole('button', { name: '더 보기' });
    fireEvent.click(more);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('가져오는 중에는 버튼 대신 스피너를 내고 관찰자를 붙이지 않는다', () => {
    listed([[activity()]], { hasNextPage: true, isFetchingNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).not.toBeNull();
    // 이미 가져오는 중이라면 관찰자를 새로 붙여 중복 호출을 만들면 안 된다.
    expect(observers).toHaveLength(0);
  });

  it('목록이 비어 있으면 트리거 자체가 없어 관찰자를 붙이지 않는다', () => {
    // 빈 상태에서는 `<>...</>` 가지가 통째로 렌더되지 않아 ref 가 비어 있다.
    listed([[]], { hasNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(screen.getByText('활동 이력이 없습니다.')).toBeInTheDocument();
    expect(observers).toHaveLength(0);
  });

  it('트리거가 화면에 들어오면 다음 페이지를 가져온다', () => {
    listed([[activity()]], { hasNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(observers).toHaveLength(1);
    expect(observers[0]!.observe).toHaveBeenCalledTimes(1);

    observers[0]!.fire([{ isIntersecting: true }]);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('화면 밖으로 나가는 신호로는 가져오지 않는다', () => {
    listed([[activity()]], { hasNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    observers[0]!.fire([{ isIntersecting: false }]);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('빈 entries 가 와도 죽지 않고 가져오지 않는다', () => {
    listed([[activity()]], { hasNextPage: true });

    render(<SRActivities srId="sr-1" />, { wrapper });

    expect(() => observers[0]!.fire([])).not.toThrow();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('언마운트하면 관찰자를 끊는다', () => {
    listed([[activity()]], { hasNextPage: true });

    const { unmount } = render(<SRActivities srId="sr-1" />, { wrapper });
    expect(observers[0]!.disconnect).not.toHaveBeenCalled();

    unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});
