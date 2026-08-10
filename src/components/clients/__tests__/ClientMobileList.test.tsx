import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientMobileList } from '../ClientMobileList';

/**
 * 고객사 목록(모바일 카드).
 *
 * 데스크톱 `ClientTable` 과 **같은 props 로 같은 상태를 다르게 그린다.** 그래서 이 스위트가
 * 실제로 지키는 것은 두 화면의 계약이 어긋나지 않는가다:
 *
 *   - 로딩 → 빈 목록 → 카드 순서가 표와 같아야 한다.
 *   - 펼침 상태는 부모의 `expandedRows` 만 따르고, 토글은 id 를 되돌리는 것으로 끝난다.
 *
 * 다만 **빈 값 표시는 표와 일부러 다르다.** 산업은 여기서 `'미지정'` 이고 표에서는 `'-'` 다.
 * 좁은 화면에서는 라벨 없이 값만 놓이기 때문인데, 이 차이는 의도된 것이므로 문구를 그대로
 * 단언해 둔다(양쪽을 '-' 로 통일하려는 리팩터가 오면 여기서 걸린다).
 *
 * `next/link` 와 아이콘만 최소 대역으로 바꾼다. Badge·Button 은 실물이라야 variant 판정을
 * 확인할 수 있고, 포털도 포인터 이벤트도 요구하지 않는다.
 */

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    ChevronDown: () => <div data-testid="icon-chevron-down" />,
    ChevronRight: () => <div data-testid="icon-chevron-right" />,
  };
});

const FULL = {
  id: 'c-1',
  code: 'C001',
  name: '가나 주식회사',
  industry: '제조',
  contactPerson: '김담당',
  contactEmail: 'kim@example.com',
  isActive: true,
  _count: { users: 3, srs: 7 },
};

/** 선택 필드가 비어 있고 `_count` 자체가 없는 고객사. */
const BARE = {
  id: 'c-2',
  code: 'C002',
  name: '다라 주식회사',
  industry: '',
  contactPerson: null,
  contactEmail: null,
  isActive: false,
};

const USERS_OF_FULL = [
  { user: { id: 'u-1', name: '김사용', email: 'kim.u@example.com' } },
  { user: { id: 'u-2', name: '이사용', email: 'lee.u@example.com' } },
];

const onToggleRowExpansion = vi.fn();
const onUsersClick = vi.fn();
const onCreateClient = vi.fn();

type Props = React.ComponentProps<typeof ClientMobileList>;

const renderList = (overrides: Partial<Props> = {}) =>
  render(
    <ClientMobileList
      clients={[FULL, BARE]}
      loading={false}
      expandedRows={new Set<string>()}
      clientUsers={{}}
      onToggleRowExpansion={onToggleRowExpansion}
      onUsersClick={onUsersClick}
      onCreateClient={onCreateClient}
      {...overrides}
    />
  );

/**
 * 고객사명이 들어 있는 카드. `MobileListCard` 의 루트만 `border` 토큰을 그대로 갖는다
 * (안쪽 구분선은 `border-t` 라 걸리지 않는다).
 */
const cardOf = (name: string) => screen.getByText(name).closest('.border') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientMobileList — 무엇을 보여 줄지 고르는 순서', () => {
  it('로딩 중이면 카드 대신 로딩만 보여 준다', () => {
    renderList({ loading: true });

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('가나 주식회사')).not.toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
  });

  // 표와 같은 순서여야 한다. 뒤집히면 조회할 때마다 "없습니다" 가 먼저 번쩍인다.
  it('로딩 중이면 목록이 비어 있어도 빈 목록 안내를 쓰지 않는다', () => {
    renderList({ loading: true, clients: [] });

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
  });

  it('목록이 비면 안내와 함께 등록 버튼을 준다', () => {
    renderList({ clients: [] });

    expect(screen.getByText('등록된 고객사가 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '첫 고객사 등록하기' }));

    expect(onCreateClient).toHaveBeenCalledTimes(1);
  });

  it('목록이 있으면 로딩도 빈 안내도 없이 카드를 그린다', () => {
    renderList();

    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
    expect(cardOf('가나 주식회사')).toBeInTheDocument();
    expect(cardOf('다라 주식회사')).toBeInTheDocument();
  });
});

describe('ClientMobileList — 카드의 값', () => {
  it('채워진 필드는 그대로 싣고 상세 링크를 건다', () => {
    renderList();
    const card = within(cardOf('가나 주식회사'));

    expect(screen.getByText('가나 주식회사').getAttribute('href')).toBe('/clients/c-1');
    expect(card.getByText('(C001)')).toBeInTheDocument();
    expect(card.getByText('제조')).toBeInTheDocument();
    expect(card.getByText('김담당')).toBeInTheDocument();
    expect(card.getByText('kim@example.com')).toBeInTheDocument();
    expect(card.getByText('사용자 3')).toBeInTheDocument();
    expect(card.getByText('SR 7')).toBeInTheDocument();
  });

  // 산업만 '미지정' 이다 — 라벨 없이 값만 놓이는 자리라 '-' 로는 무슨 칸인지 알 수 없다.
  it('산업은 미지정, 담당자·이메일은 -, 집계가 없으면 0 으로 채운다', () => {
    renderList();
    const card = within(cardOf('다라 주식회사'));

    expect(card.getByText('미지정')).toBeInTheDocument();
    expect(card.getAllByText('-')).toHaveLength(2);
    expect(card.getByText('사용자 0')).toBeInTheDocument();
    expect(card.getByText('SR 0')).toBeInTheDocument();
  });

  it('활성 여부에 따라 배지의 문구와 variant 가 함께 갈린다', () => {
    renderList();

    expect(screen.getByText('활성').className).toContain('bg-primary/10');
    expect(screen.getByText('비활성').className).toContain('bg-secondary');
  });

  it('사용자 배지를 누르면 고객사와 이벤트를 부모로 넘긴다', () => {
    renderList();

    fireEvent.click(within(cardOf('가나 주식회사')).getByText('사용자 3'));

    expect(onUsersClick).toHaveBeenCalledTimes(1);
    expect(onUsersClick).toHaveBeenCalledWith(FULL, expect.objectContaining({ type: 'click' }));
  });
});

describe('ClientMobileList — 펼침', () => {
  it('접힌 카드는 오른쪽 화살표만 두고 사용자 영역을 열지 않는다', () => {
    renderList();

    expect(screen.getAllByTestId('icon-chevron-right')).toHaveLength(2);
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument();
    expect(screen.queryByText(/소속 사용자/)).not.toBeInTheDocument();
  });

  it('펼쳐진 카드만 아래 화살표와 사용자 영역을 갖는다', () => {
    renderList({
      expandedRows: new Set(['c-1']),
      clientUsers: { 'c-1': USERS_OF_FULL },
    });

    expect(screen.getAllByTestId('icon-chevron-down')).toHaveLength(1);
    expect(screen.getAllByTestId('icon-chevron-right')).toHaveLength(1);
    // 표는 '(2명)', 모바일은 좁아서 '(2)' 다.
    expect(screen.getByText('소속 사용자 (2)')).toBeInTheDocument();
    expect(screen.getByText('김사용').closest('a')?.getAttribute('href')).toBe('/users/u-1');
    expect(screen.getByText('lee.u@example.com')).toBeInTheDocument();
  });

  it('토글 버튼은 자기 id 를 부모로 되돌릴 뿐이다', () => {
    renderList();

    fireEvent.click(within(cardOf('다라 주식회사')).getByRole('button'));

    expect(onToggleRowExpansion).toHaveBeenCalledWith('c-2');
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument();
  });

  // 조회가 끝나기 전에는 `clientUsers` 에 키 자체가 없다. `|| []` 가 없으면
  // `undefined.length` 로 목록 전체가 죽는다.
  it.each([
    ['키가 아직 없을 때', {} as Record<string, unknown[]>],
    ['빈 배열일 때', { 'c-1': [] } as Record<string, unknown[]>],
  ])('%s 는 빈 안내를 보여 준다', (_label, clientUsers) => {
    renderList({ expandedRows: new Set(['c-1']), clientUsers });

    expect(screen.getByText('소속 사용자 (0)')).toBeInTheDocument();
    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
  });

  it('여러 카드를 동시에 펼칠 수 있다', () => {
    renderList({
      expandedRows: new Set(['c-1', 'c-2']),
      clientUsers: { 'c-1': USERS_OF_FULL, 'c-2': [] },
    });

    expect(screen.getAllByTestId('icon-chevron-down')).toHaveLength(2);
    expect(screen.getByText('소속 사용자 (2)')).toBeInTheDocument();
    expect(screen.getByText('소속 사용자 (0)')).toBeInTheDocument();
  });
});
