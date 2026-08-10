import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientTable } from '../ClientTable';

/**
 * 고객사 목록 표(데스크톱).
 *
 * 로직이 없는 표현 컴포넌트지만, 그렇다고 볼 것이 없는 것은 아니다. 이 파일이 실제로
 * 정하는 것은 **무엇을 언제 보여 주는가** 세 가지다:
 *
 *   1. `loading` → 빈 목록 안내 → 행. 이 순서가 뒤집히면 첫 로딩 때마다 "등록된 고객사가
 *      없습니다" 가 번쩍인다(사용자에게는 "데이터가 날아갔다"로 읽힌다).
 *   2. 선택 필드(`industry`·`contactPerson`·`contactEmail`)와 집계(`_count`)의 **빈 값 표시**.
 *      `client._count?.users || 0` 은 `_count` 자체가 없는 응답(목록 API 가 include 를
 *      빼고 주는 경우)에서도 `undefined명` 이 나오지 않게 하는 유일한 방어선이다.
 *   3. 펼침 상태. `expandedRows` 는 부모가 들고 있으므로 이 컴포넌트는 **넘겨받은 집합을
 *      그대로 읽기만** 해야 하고, 토글은 클릭을 부모로 되돌리는 것으로 끝나야 한다.
 *      (여기서 자체 state 를 두면 부모가 담아 둔 펼침 상태와 어긋난다.)
 *
 * UI 프리미티브는 실물을 쓴다 — Table·Badge·Button 은 포털이나 포인터 이벤트를 요구하지
 * 않는 순수 마크업이라 대역으로 바꿀 이유가 없고, 배지 variant 같은 판정은 실물이라야
 * 확인할 수 있다. 반대로 `next/link` 와 아이콘은 이 컴포넌트가 검증할 대상이 아니라
 * 최소 대역으로 바꾼다(라우터 컨텍스트·SVG 내부 구조에 테스트를 묶지 않기 위해서다).
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

/** 선택 필드와 집계가 전부 채워진 고객사. */
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
  industry: null,
  contactPerson: null,
  contactEmail: '',
  isActive: false,
};

const USERS_OF_FULL = [
  { user: { id: 'u-1', name: '김사용', email: 'kim.u@example.com' } },
  { user: { id: 'u-2', name: '이사용', email: 'lee.u@example.com' } },
];

const onToggleRowExpansion = vi.fn();
const onUsersClick = vi.fn();
const onCreateClient = vi.fn();

type Props = React.ComponentProps<typeof ClientTable>;

const renderTable = (overrides: Partial<Props> = {}) =>
  render(
    <ClientTable
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

/** 고객사명이 들어 있는 행. 행 단위로 좁혀야 두 고객사의 '-' 가 섞이지 않는다. */
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientTable — 무엇을 보여 줄지 고르는 순서', () => {
  it('로딩 중이면 행 대신 로딩만 보여 준다', () => {
    renderTable({ loading: true });

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('가나 주식회사')).not.toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
  });

  // 로딩이 빈 목록보다 앞이라는 것이 핵심이다. 순서가 뒤집히면 매 조회마다
  // "없습니다" 가 먼저 뜨고, 사용자는 데이터가 사라진 것으로 받아들인다.
  it('로딩 중이면 목록이 비어 있어도 빈 목록 안내를 쓰지 않는다', () => {
    renderTable({ loading: true, clients: [] });

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
  });

  it('목록이 비면 안내와 함께 등록 버튼을 준다', () => {
    renderTable({ clients: [] });

    expect(screen.getByText('등록된 고객사가 없습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '첫 고객사 등록하기' }));

    expect(onCreateClient).toHaveBeenCalledTimes(1);
  });

  it('목록이 있으면 로딩도 빈 안내도 없이 행을 그린다', () => {
    renderTable();

    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
    expect(screen.queryByText('등록된 고객사가 없습니다.')).not.toBeInTheDocument();
    expect(rowOf('가나 주식회사')).toBeInTheDocument();
    expect(rowOf('다라 주식회사')).toBeInTheDocument();
  });
});

describe('ClientTable — 행의 값', () => {
  it('채워진 필드는 그대로 싣고 상세 링크를 건다', () => {
    renderTable();
    const row = within(rowOf('가나 주식회사'));

    expect(screen.getByText('가나 주식회사').getAttribute('href')).toBe('/clients/c-1');
    expect(row.getByText('C001')).toBeInTheDocument();
    expect(row.getByText('제조')).toBeInTheDocument();
    expect(row.getByText('김담당')).toBeInTheDocument();
    expect(row.getByText('kim@example.com')).toBeInTheDocument();
    expect(row.getByText('3명')).toBeInTheDocument();
    expect(row.getByText('7건')).toBeInTheDocument();
  });

  // `_count` 가 통째로 없는 응답에서 `undefined명` 이 나오지 않아야 한다.
  it('선택 필드가 비면 -, 집계가 없으면 0 으로 채운다', () => {
    renderTable();
    const row = within(rowOf('다라 주식회사'));

    // 산업·담당자·이메일 셋 다 빈 값이다.
    expect(row.getAllByText('-')).toHaveLength(3);
    expect(row.getByText('0명')).toBeInTheDocument();
    expect(row.getByText('0건')).toBeInTheDocument();
  });

  // 문구뿐 아니라 variant 도 갈린다. 문구만 보면 배지가 항상 같은 색으로 나와도 통과한다.
  it('활성 여부에 따라 배지의 문구와 variant 가 함께 갈린다', () => {
    renderTable();

    expect(screen.getByText('활성').className).toContain('bg-primary/10');
    expect(screen.getByText('비활성').className).toContain('bg-secondary');
  });

  it('사용자 배지를 누르면 고객사와 이벤트를 부모로 넘긴다', () => {
    renderTable();

    fireEvent.click(within(rowOf('가나 주식회사')).getByText('3명'));

    expect(onUsersClick).toHaveBeenCalledTimes(1);
    // 이벤트를 함께 넘기는 것은 부모가 stopPropagation 을 걸 수 있어야 하기 때문이다.
    expect(onUsersClick).toHaveBeenCalledWith(FULL, expect.objectContaining({ type: 'click' }));
  });
});

describe('ClientTable — 펼침', () => {
  it('접힌 행은 오른쪽 화살표만 두고 사용자 영역을 열지 않는다', () => {
    renderTable();

    expect(screen.getAllByTestId('icon-chevron-right')).toHaveLength(2);
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument();
    expect(screen.queryByText(/소속 사용자/)).not.toBeInTheDocument();
  });

  it('펼쳐진 행만 아래 화살표와 사용자 영역을 갖는다', () => {
    renderTable({
      expandedRows: new Set(['c-1']),
      clientUsers: { 'c-1': USERS_OF_FULL },
    });

    expect(screen.getAllByTestId('icon-chevron-down')).toHaveLength(1);
    expect(screen.getAllByTestId('icon-chevron-right')).toHaveLength(1);
    expect(screen.getByText('소속 사용자 (2명)')).toBeInTheDocument();
    expect(screen.getByText('김사용').closest('a')?.getAttribute('href')).toBe('/users/u-1');
    expect(screen.getByText('lee.u@example.com')).toBeInTheDocument();
  });

  // 펼침은 부모가 들고 있다. 여기서 자체 state 를 두면 부모의 집합과 어긋난다.
  it('토글 버튼은 자기 id 를 부모로 되돌릴 뿐이다', () => {
    renderTable();

    fireEvent.click(within(rowOf('다라 주식회사')).getByRole('button'));

    expect(onToggleRowExpansion).toHaveBeenCalledWith('c-2');
    // 부모가 다시 그려 주기 전까지는 접힌 그대로다.
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument();
  });

  // 사용자 조회가 아직 안 끝났으면 `clientUsers` 에 키 자체가 없다. `|| []` 가 없으면
  // 여기서 `undefined.length` 로 화면이 통째로 죽는다.
  it.each([
    ['키가 아직 없을 때', {} as Record<string, unknown[]>],
    ['빈 배열일 때', { 'c-1': [] } as Record<string, unknown[]>],
  ])('%s 는 빈 안내를 보여 준다', (_label, clientUsers) => {
    renderTable({ expandedRows: new Set(['c-1']), clientUsers });

    expect(screen.getByText('소속 사용자 (0명)')).toBeInTheDocument();
    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
  });

  it('여러 행을 동시에 펼칠 수 있다', () => {
    renderTable({
      expandedRows: new Set(['c-1', 'c-2']),
      clientUsers: { 'c-1': USERS_OF_FULL, 'c-2': [] },
    });

    expect(screen.getAllByTestId('icon-chevron-down')).toHaveLength(2);
    expect(screen.getByText('소속 사용자 (2명)')).toBeInTheDocument();
    expect(screen.getByText('소속 사용자 (0명)')).toBeInTheDocument();
  });
});
