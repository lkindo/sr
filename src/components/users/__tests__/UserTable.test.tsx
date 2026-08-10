import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientSummary } from '@/types/client.types';
import type { UserListItem } from '@/types/user-view';

import { UserTable } from '../UserTable';

/**
 * 사용자 목록 표(데스크톱).
 *
 * 이 표는 **자기 분기보다 자식이 크다.** 고객사 칸 하나가 상태에 따라 세 컴포넌트로
 * 갈라지고(`ClientAssignDropdown` / `ClientApprovalActions` / `ClientBadgeWithActions`),
 * 그 셋이 전부 `PATCH|DELETE /api/users/{id}/client` 계열 변이를 들고 있다. 그래서
 * 자식을 대역으로 바꾸면 **여기서 볼 것이 거의 남지 않는다** — 남는 건 셀 개수뿐이다.
 * 이 파일은 자식을 실물로 렌더하고, 표가 어느 갈래를 고르는지와 그 갈래가 실제로
 * 어떤 요청을 보내는지를 함께 단언한다.
 *
 * 다루는 갈림길:
 *  - 로딩 / 빈 목록(검색 중·아님) / 목록 있음
 *  - 전체선택 아이콘: 전원 선택 · 일부 선택 · 목록이 비었을 때(0 === 0 이지만 체크 아님)
 *  - 유형 라벨·배지 변형 (`getUserTypeLabel` × `getUserTypeBadgeVariant`)
 *  - 고객사 칸: 시스템 운영팀(할당 불가) / 미소속(할당 드롭다운) / PENDING(승인·거절) /
 *    APPROVED(뱃지 + 변경·해제)
 *  - 역할 없음 / 있음, 활성 / 비활성
 *
 * ⚠️ `fetch` 대역은 손으로 만든 `{ ok, json }` 이 아니라 **진짜 `Response`** 여야 한다.
 * `api-client` 는 성공 경로에서 `status`(204 판별)와 `text()`(빈 본문 허용)를 함께 읽는다.
 */

const toast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

/**
 * Radix 의 Popover(Popper 의 크기 측정)가 ResizeObserver 를 요구하는데 jsdom 에는 없다.
 * `vi.stubGlobal` 이 아니라 직접 대입한다 — 아래 `vi.unstubAllGlobals()` 가 fetch 스텁을
 * 걷어낼 때 이것까지 사라지면 두 번째 테스트부터 팝오버가 터진다.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const CLIENTS: ClientSummary[] = [
  { id: 'c-1', name: '알파 고객사', code: 'ALPHA' },
  { id: 'c-2', name: '베타 고객사', code: 'BETA' },
];

const makeUser = (over: Partial<UserListItem> = {}): UserListItem => ({
  id: 'u-1',
  email: 'hong@example.com',
  name: '홍길동',
  isActive: true,
  userType: 'CLIENT',
  roles: [],
  clients: [],
  ...over,
});

const role = (name: string) => ({ role: { id: `r-${name}`, name } });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (respond: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => respond(url, init))
  );

const okFetch = () => stubFetch(() => jsonResponse({ data: {} }));

const baseProps = {
  users: [] as UserListItem[],
  loading: false,
  searchQuery: '',
  selectedUserIds: new Set<string>(),
  clients: CLIENTS,
  onToggleAll: vi.fn(),
  onToggleUser: vi.fn(),
  onRefresh: vi.fn(),
};

const renderTable = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
};

/**
 * 체크 아이콘 판별.
 *
 * 두 아이콘 모두 접근 가능한 이름이 없어(아이콘 전용 버튼) 렌더된 svg 로 구분한다.
 * lucide 는 `lucide-<icon>` 클래스를 붙이고, `CheckSquare` 는 `square-check-big` 이다.
 */
const isChecked = (button: HTMLElement) =>
  (button.querySelector('svg')?.getAttribute('class') ?? '').includes('lucide-square-check-big');

/** 헤더의 전체선택 버튼 → 그다음부터 각 행의 선택 버튼. */
const selectionButtons = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.querySelector('svg.lucide-square, svg.lucide-square-check-big'));

beforeEach(() => {
  vi.clearAllMocks();
  okFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserTable — 목록 상태', () => {
  it('loading 이면 스피너만 보이고 행은 그리지 않는다', () => {
    renderTable(<UserTable {...baseProps} users={[makeUser()]} loading />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
  });

  it('목록이 비어 있고 검색 중이 아니면 등록 안내를 보여준다', () => {
    renderTable(<UserTable {...baseProps} />);

    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
  });

  // 같은 "빈 화면"이라도 검색 결과 0건과 데이터 0건은 사용자가 할 일이 다르다.
  it('목록이 비어 있고 검색어가 있으면 검색 결과 안내를 보여준다', () => {
    renderTable(<UserTable {...baseProps} searchQuery="홍" />);

    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('등록된 사용자가 없습니다.')).not.toBeInTheDocument();
  });

  it('행이 있으면 이름·이메일을 그리고 이름은 상세로 링크한다', () => {
    renderTable(<UserTable {...baseProps} users={[makeUser()]} />);

    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute('href', '/users/u-1');
    expect(screen.getByText('hong@example.com')).toBeInTheDocument();
  });
});

describe('UserTable — 선택 상태', () => {
  const users = [makeUser(), makeUser({ id: 'u-2', name: '임꺽정', email: 'im@example.com' })];

  it('전원 선택이면 전체선택이 체크로 보인다', () => {
    renderTable(
      <UserTable {...baseProps} users={users} selectedUserIds={new Set(['u-1', 'u-2'])} />
    );

    expect(isChecked(selectionButtons()[0]!)).toBe(true);
  });

  it('일부만 선택이면 전체선택은 체크가 아니다', () => {
    renderTable(<UserTable {...baseProps} users={users} selectedUserIds={new Set(['u-1'])} />);

    const [all, first, second] = selectionButtons();
    expect(isChecked(all!)).toBe(false);
    expect(isChecked(first!)).toBe(true);
    expect(isChecked(second!)).toBe(false);
  });

  // size 0 === length 0 이라 `users.length > 0` 가 없으면 빈 목록이 "전원 선택"으로 보인다.
  it('목록이 비어 있으면 전체선택은 체크가 아니다', () => {
    renderTable(<UserTable {...baseProps} />);

    expect(isChecked(selectionButtons()[0]!)).toBe(false);
  });

  it('전체선택·행 선택 클릭이 각각의 콜백으로 간다', () => {
    const onToggleAll = vi.fn();
    const onToggleUser = vi.fn();
    renderTable(
      <UserTable
        {...baseProps}
        users={users}
        onToggleAll={onToggleAll}
        onToggleUser={onToggleUser}
      />
    );

    const [all, first] = selectionButtons();
    fireEvent.click(all!);
    fireEvent.click(first!);

    expect(onToggleAll).toHaveBeenCalledTimes(1);
    expect(onToggleUser).toHaveBeenCalledWith('u-1');
  });
});

describe('UserTable — 유형·역할·활성 배지', () => {
  // 라벨은 역할 → userType → 소속 순으로 판정된다. 순서가 뒤집히면 ADMIN 이
  // '기술 지원팀'으로 보이는 식으로 조용히 어긋난다.
  it.each([
    ['ADMIN 역할이면 시스템 운영팀', { roles: [role('ADMIN')] }, '시스템 운영팀'],
    ['ENGINEER 타입이면 기술 지원팀', { userType: 'ENGINEER' as const }, '기술 지원팀'],
    ['CLIENT 타입이면 고객사 담당자', { userType: 'CLIENT' as const }, '고객사 담당자'],
  ])('%s', (_label, over, expected) => {
    renderTable(<UserTable {...baseProps} users={[makeUser(over)]} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('역할이 없으면 "역할 없음", 있으면 역할 배지를 전부 그린다', () => {
    renderTable(
      <UserTable
        {...baseProps}
        users={[
          makeUser(),
          makeUser({
            id: 'u-2',
            name: '임꺽정',
            roles: [role('CLIENT_USER'), role('CLIENT_MANAGER')],
          }),
        ]}
      />
    );

    expect(screen.getByText('역할 없음')).toBeInTheDocument();
    expect(screen.getByText('CLIENT_USER')).toBeInTheDocument();
    expect(screen.getByText('CLIENT_MANAGER')).toBeInTheDocument();
  });

  it.each([
    [true, '활성'],
    [false, '비활성'],
  ])('isActive=%s 면 %s 배지를 그린다', (isActive, label) => {
    renderTable(<UserTable {...baseProps} users={[makeUser({ isActive })]} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('UserTable — 고객사 칸의 갈래', () => {
  it.each([['ADMIN'], ['MANAGER'], ['ENGINEER']])(
    '%s 역할이면 고객사를 할당할 수 없다고 표시한다',
    (roleName) => {
      renderTable(<UserTable {...baseProps} users={[makeUser({ roles: [role(roleName)] })]} />);

      expect(screen.getByText('할당 불가')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /고객사 할당/ })).not.toBeInTheDocument();
    }
  );

  it('시스템 역할이 아니고 소속이 없으면 할당 드롭다운을 그린다', () => {
    renderTable(<UserTable {...baseProps} users={[makeUser({ roles: [role('CLIENT_USER')] })]} />);

    expect(screen.getByRole('button', { name: /고객사 할당/ })).toBeInTheDocument();
  });

  it('PENDING 소속은 승인/거절 액션으로, APPROVED 소속은 뱃지로 그린다', () => {
    renderTable(
      <UserTable
        {...baseProps}
        users={[
          makeUser({ clients: [{ client: CLIENTS[0]!, status: 'PENDING' }] }),
          makeUser({
            id: 'u-2',
            name: '임꺽정',
            clients: [{ client: CLIENTS[1]!, status: 'APPROVED' }],
          }),
        ]}
      />
    );

    expect(screen.getByText('알파 고객사 · 승인 대기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /베타 고객사/ })).toHaveAttribute(
      'href',
      '/clients/c-2'
    );
  });

  // `status` 는 optional 이다. 값이 없는 기존 소속이 승인 대기로 보이면 안 된다.
  it('status 가 없는 소속은 승인 대기가 아니라 뱃지로 본다', () => {
    renderTable(
      <UserTable {...baseProps} users={[makeUser({ clients: [{ client: CLIENTS[0]! }] })]} />
    );

    expect(screen.queryByText(/승인 대기/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /알파 고객사/ })).toBeInTheDocument();
  });

  it('소속이 여러 개면 전부 그린다', () => {
    renderTable(
      <UserTable
        {...baseProps}
        users={[
          makeUser({
            clients: [
              { client: CLIENTS[0]!, status: 'APPROVED' },
              { client: CLIENTS[1]!, status: 'PENDING' },
            ],
          }),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: /알파 고객사/ })).toBeInTheDocument();
    expect(screen.getByText('베타 고객사 · 승인 대기')).toBeInTheDocument();
  });
});

/**
 * 여기부터는 표가 고른 자식이 **실제로 무엇을 보내는지**를 본다.
 * 목록 화면에서 이 요청들이 잘못 나가면 사용자의 고객사 소속이 통째로 바뀐다.
 */
describe('UserTable — 고객사 할당 드롭다운', () => {
  const unassigned = [makeUser({ roles: [role('CLIENT_USER')] })];

  const openDropdown = () => fireEvent.click(screen.getByRole('button', { name: /고객사 할당/ }));

  it('검색어로 목록을 좁히고, 하나도 안 맞으면 안내를 보여준다', async () => {
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    const search = await screen.findByPlaceholderText('고객사 검색...');
    expect(screen.getByText('알파 고객사')).toBeInTheDocument();
    expect(screen.getByText('베타 고객사')).toBeInTheDocument();

    // 코드로도 걸린다(name || code).
    fireEvent.change(search, { target: { value: 'beta' } });
    expect(screen.queryByText('알파 고객사')).not.toBeInTheDocument();
    expect(screen.getByText('베타 고객사')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '없는고객사' } });
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('고객사를 고르면 force 없이 PATCH 하고 성공 토스트를 띄운다', async () => {
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={unassigned} onRefresh={onRefresh} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/client');
    expect(init!.method).toBe('PATCH');
    // force 를 안 보내는 것이 계약이다 — 항상 보내면 확인 다이얼로그가 무력화된다.
    expect(JSON.parse(init!.body as string)).toEqual({ clientId: 'c-1' });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '홍길동님이 알파 고객사에 할당되었습니다.' })
    );
  });

  it('진행 중 SR 이 함께 처리되면 재할당 권고를 덧붙인다', async () => {
    stubFetch(() => jsonResponse({ data: { ongoingSRsHandled: 3 } }));
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('진행 중인 SR 3건은 재할당을 권장합니다.'),
        })
      )
    );
  });

  // 409 는 실패가 아니라 확인 요구다. 빨간 토스트가 함께 뜨면 회귀다.
  it('409 ONGOING_SRS 면 토스트 대신 확인 다이얼로그를 띄우고 확인 시 force 로 재요청한다', async () => {
    let call = 0;
    stubFetch(() => {
      call += 1;
      return call === 1
        ? jsonResponse({ code: 'ONGOING_SRS', data: { ongoingSRCount: 2 } }, 409)
        : jsonResponse({ data: { ongoingSRsHandled: 2 } });
    });
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    expect(await screen.findByText('진행 중인 SR이 있습니다')).toBeInTheDocument();
    expect(document.body.textContent).toContain('진행 중인 SR 2건이 있습니다');
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));

    fireEvent.click(screen.getByRole('button', { name: '계속 할당' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls).toHaveLength(2));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string)).toEqual({
      clientId: 'c-1',
      force: true,
    });
  });

  // 취소는 "아무 일도 없었다" 여야 한다 — 확인 상태가 남으면 다음 할당 때 다시 뜬다.
  it('확인 다이얼로그를 취소하면 닫히고 강제 요청도 나가지 않는다', async () => {
    stubFetch(() => jsonResponse({ code: 'ONGOING_SRS', data: { ongoingSRCount: 2 } }, 409));
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));
    await screen.findByText('진행 중인 SR이 있습니다');

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(screen.queryByText('진행 중인 SR이 있습니다')).not.toBeInTheDocument()
    );
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  // 서버가 건수를 안 주면 0 으로 읽는다(다이얼로그가 undefined 를 그리면 안 된다).
  it('409 본문에 건수가 없으면 0건으로 보여준다', async () => {
    stubFetch(() => jsonResponse({ code: 'ONGOING_SRS' }, 409));
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    await screen.findByText('진행 중인 SR이 있습니다');
    expect(document.body.textContent).toContain('진행 중인 SR 0건이 있습니다');
  });

  it('할당이 실패하면 서버 메시지로 오류 토스트를 띄운다', async () => {
    stubFetch(() => jsonResponse({ error: '이미 다른 고객사에 소속되어 있습니다.' }, 400));
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '이미 다른 고객사에 소속되어 있습니다.',
        })
      )
    );
  });

  it('요청이 도는 동안 트리거가 처리 중으로 잠긴다', async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    renderTable(<UserTable {...baseProps} users={unassigned} />);
    openDropdown();

    fireEvent.click(await screen.findByText('알파 고객사'));

    const trigger = await screen.findByRole('button', { name: /처리 중/ });
    expect(trigger).toBeDisabled();
  });
});

describe('UserTable — PENDING 소속 승인/거절', () => {
  const pending = [makeUser({ clients: [{ client: CLIENTS[0]!, status: 'PENDING' }] })];

  it('승인은 POST 로 보내고 승인 토스트를 띄운다', async () => {
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={pending} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: '알파 고객사 소속 승인' }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/client/approve');
    expect(init!.method).toBe('POST');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '소속 승인 완료',
        description: '알파 고객사 소속이 승인되었습니다.',
      })
    );
  });

  // 승인과 거절은 같은 URL 에 메서드로만 갈린다. 여기가 뒤바뀌면 승인이 거절이 된다.
  it('거절은 같은 URL 에 DELETE 로 보내고 거절 토스트를 띄운다', async () => {
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={pending} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: '알파 고객사 소속 거절' }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/client/approve');
    expect(init!.method).toBe('DELETE');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '소속 신청 거절',
        description: '알파 고객사 소속 신청이 거절되었습니다.',
      })
    );
  });

  it('실패하면 오류 토스트를 띄우고 onChanged 는 부르지 않는다', async () => {
    stubFetch(() => jsonResponse({ error: '권한이 없습니다.' }, 403));
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={pending} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: '알파 고객사 소속 승인' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류 발생',
          variant: 'destructive',
          description: '권한이 없습니다.',
        })
      )
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('처리 중에는 승인·거절 버튼이 함께 잠긴다', async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    renderTable(<UserTable {...baseProps} users={pending} />);

    fireEvent.click(screen.getByRole('button', { name: '알파 고객사 소속 승인' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '알파 고객사 소속 거절' })).toBeDisabled()
    );
  });
});

describe('UserTable — 소속 고객사 변경/해제', () => {
  const assigned = [makeUser({ clients: [{ client: CLIENTS[0]!, status: 'APPROVED' }] })];

  /** 뱃지 옆 아이콘 버튼 둘: [변경, 해제]. 접근 가능한 이름이 없어 위치로 잡는다. */
  const badgeActions = () => {
    const link = screen.getByRole('link', { name: /알파 고객사/ });
    return within(link.parentElement as HTMLElement).getAllByRole('button');
  };

  it('변경 목록에는 현재 고객사가 빠진다', async () => {
    renderTable(<UserTable {...baseProps} users={assigned} />);

    fireEvent.click(badgeActions()[0]!);

    expect(await screen.findByText('고객사 변경')).toBeInTheDocument();
    expect(screen.getByText('베타 고객사')).toBeInTheDocument();
    // 뱃지의 이름은 link 안에 남아 있으므로 팝오버 목록에만 없으면 된다.
    expect(screen.getAllByText('알파 고객사')).toHaveLength(1);
  });

  it('다른 고객사를 고르면 PATCH 하고 변경 토스트를 띄운다', async () => {
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={assigned} onRefresh={onRefresh} />);

    fireEvent.click(badgeActions()[0]!);
    fireEvent.click(await screen.findByText('베타 고객사'));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).toEqual({
      clientId: 'c-2',
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '홍길동님의 고객사가 베타 고객사(으)로 변경되었습니다.',
      })
    );
  });

  it('변경도 409 면 확인 다이얼로그를 띄우고 확인 시 force 로 재요청한다', async () => {
    let call = 0;
    stubFetch(() => {
      call += 1;
      return call === 1
        ? jsonResponse({ code: 'ONGOING_SRS', data: { ongoingSRCount: 5 } }, 409)
        : jsonResponse({ data: { ongoingSRsHandled: 5 } });
    });
    renderTable(<UserTable {...baseProps} users={assigned} />);

    fireEvent.click(badgeActions()[0]!);
    fireEvent.click(await screen.findByText('베타 고객사'));

    expect(await screen.findByText('진행 중인 SR이 있습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계속 변경' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls).toHaveLength(2));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string)).toEqual({
      clientId: 'c-2',
      force: true,
    });
  });

  it('변경 확인 다이얼로그를 취소하면 닫히고 강제 요청도 나가지 않는다', async () => {
    stubFetch(() => jsonResponse({ code: 'ONGOING_SRS', data: { ongoingSRCount: 5 } }, 409));
    renderTable(<UserTable {...baseProps} users={assigned} />);

    fireEvent.click(badgeActions()[0]!);
    fireEvent.click(await screen.findByText('베타 고객사'));
    await screen.findByText('진행 중인 SR이 있습니다');

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(screen.queryByText('진행 중인 SR이 있습니다')).not.toBeInTheDocument()
    );
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it('해제는 확인 다이얼로그를 거쳐 DELETE 로 보낸다', async () => {
    const onRefresh = vi.fn();
    renderTable(<UserTable {...baseProps} users={assigned} onRefresh={onRefresh} />);

    fireEvent.click(badgeActions()[1]!);

    expect(await screen.findByText('고객사 소속 해제')).toBeInTheDocument();
    // 다이얼로그를 열기만 해서는 아무것도 보내지 않는다.
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '해제' }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/client');
    expect(init!.method).toBe('DELETE');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '홍길동님의 고객사 소속이 해제되었습니다.' })
    );
  });

  it('해제가 실패하면 오류 토스트를 띄운다', async () => {
    stubFetch(() => jsonResponse({ error: '해제할 수 없습니다.' }, 400));
    renderTable(<UserTable {...baseProps} users={assigned} />);

    fireEvent.click(badgeActions()[1]!);
    fireEvent.click(await screen.findByRole('button', { name: '해제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: '해제할 수 없습니다.' })
      )
    );
  });

  // 두 변이는 하나의 `isProcessing` 을 공유한다 — 어느 쪽이 돌든 둘 다 잠긴다.
  it('해제가 도는 동안 변경 버튼도 함께 잠긴다', async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    renderTable(<UserTable {...baseProps} users={assigned} />);

    fireEvent.click(badgeActions()[1]!);
    fireEvent.click(await screen.findByRole('button', { name: '해제' }));

    await waitFor(() => expect(badgeActions()[0]!).toBeDisabled());
    expect(badgeActions()[1]!).toBeDisabled();
  });
});
