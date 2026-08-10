import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientSummary } from '@/types/client.types';
import type { UserListItem } from '@/types/user-view';

import { UserMobileList } from '../UserMobileList';

/**
 * 사용자 목록 카드(모바일).
 *
 * 표(`UserTable`)와 같은 데이터를 그리지만 **좁은 화면용으로 잘라 낸다**: 역할과 소속은
 * 첫 항목만 보여 주고 나머지는 `+N` 으로 접는다. 그 잘라내기(`slice(0,1)` + `length > 1`)와
 * "시스템 운영팀은 소속 칸 자체가 다르다" 는 규칙이 이 파일의 고유 분기다.
 *
 * 카드에는 표에 없는 `UserActions` 가 붙는다. 이 컴포넌트는 **누르기 전에 세션 역할로
 * 막는** 게이트가 셋(역할 관리 / 활성화 토글 / 삭제)이고, 삭제만 조건이 셋 더 있다
 * (ADMIN 여부 · 자기 자신 · 시스템 역할 보유자). 여기가 이 그룹에서 가장 조용한 회귀
 * 지점이라 각 게이트의 양쪽 경로를 모두 태운다.
 *
 * ⚠️ `fetch` 대역은 진짜 `Response` 를 쓴다 — `api-client` 가 성공 경로에서 `status` 와
 * `text()` 를 함께 읽기 때문이다.
 */

const toast = vi.fn();
const update = vi.fn();
const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: session.current, update }),
}));

/** Radix Popover(Popper 의 크기 측정)가 요구하는데 jsdom 에 없다. RegisterForm 테스트와 같다. */
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

const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond())
  );

const baseProps = {
  users: [] as UserListItem[],
  loading: false,
  searchQuery: '',
  selectedUserIds: new Set<string>(),
  clients: CLIENTS,
  onToggleUser: vi.fn(),
  onAssignRoles: vi.fn(),
  onToggleActive: vi.fn(),
  onDelete: vi.fn(),
  onRefresh: vi.fn(),
};

const renderList = (ui: ReactElement) => {
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

/** 목록 컨테이너의 직계 자식 = 카드 하나씩. */
const cards = (container: HTMLElement) =>
  Array.from(container.firstElementChild?.children ?? []) as HTMLElement[];

beforeEach(() => {
  vi.clearAllMocks();
  session.current = null;
  stubFetch(() => jsonResponse({ data: {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserMobileList — 목록 상태', () => {
  it('loading 이면 스피너만 보이고 카드는 그리지 않는다', () => {
    renderList(<UserMobileList {...baseProps} users={[makeUser()]} loading />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
  });

  it('비어 있고 검색 중이 아니면 등록 안내를 보여준다', () => {
    renderList(<UserMobileList {...baseProps} />);

    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
  });

  it('비어 있고 검색어가 있으면 검색 결과 안내를 보여준다', () => {
    renderList(<UserMobileList {...baseProps} searchQuery="홍" />);

    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('등록된 사용자가 없습니다.')).not.toBeInTheDocument();
  });

  it('카드는 이름을 상세로 링크하고 이메일을 함께 보여준다', () => {
    renderList(<UserMobileList {...baseProps} users={[makeUser()]} />);

    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute('href', '/users/u-1');
    expect(screen.getByText('hong@example.com')).toBeInTheDocument();
  });

  it.each([
    [true, '활성'],
    [false, '비활성'],
  ])('isActive=%s 면 %s 배지를 그린다', (isActive, label) => {
    renderList(<UserMobileList {...baseProps} users={[makeUser({ isActive })]} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('UserMobileList — 선택 표시', () => {
  const users = [makeUser(), makeUser({ id: 'u-2', name: '임꺽정', email: 'im@example.com' })];

  // 모바일에는 체크 컬럼이 없어 카드 테두리가 선택의 유일한 신호다.
  it('선택된 카드에만 강조 테두리를 붙인다', () => {
    const { container } = renderList(
      <UserMobileList {...baseProps} users={users} selectedUserIds={new Set(['u-2'])} />
    );

    const [first, second] = cards(container);
    expect(first!.className).not.toContain('ring-2');
    expect(second!.className).toContain('ring-2');
    // 공통 클래스는 덮어쓰지 않고 병합돼야 한다.
    expect(second!.className).toContain('rounded-lg');
  });

  it('선택 버튼은 체크 아이콘으로 바뀌고 클릭이 콜백으로 간다', () => {
    const onToggleUser = vi.fn();
    const { container } = renderList(
      <UserMobileList
        {...baseProps}
        users={users}
        selectedUserIds={new Set(['u-1'])}
        onToggleUser={onToggleUser}
      />
    );

    const [first, second] = cards(container);
    // lucide 는 `lucide-<icon>` 클래스를 붙인다. CheckSquare 는 square-check-big 이다.
    expect(first!.querySelector('svg.lucide-square-check-big')).not.toBeNull();
    expect(second!.querySelector('svg.lucide-square-check-big')).toBeNull();

    fireEvent.click(second!.querySelector('button')!);
    expect(onToggleUser).toHaveBeenCalledWith('u-2');
  });
});

describe('UserMobileList — 잘라 내는 목록', () => {
  it('역할이 없으면 "-", 하나면 그 배지, 여럿이면 첫 개와 +N 을 보여준다', () => {
    const { container } = renderList(
      <UserMobileList
        {...baseProps}
        users={[
          makeUser(),
          makeUser({ id: 'u-2', name: '둘', roles: [role('CLIENT_USER')] }),
          makeUser({
            id: 'u-3',
            name: '셋',
            roles: [role('CLIENT_USER'), role('CLIENT_MANAGER'), role('VIEWER')],
          }),
        ]}
      />
    );

    const [none, one, many] = cards(container);
    expect(none!.textContent).toContain('-');
    expect(none!.textContent).not.toContain('CLIENT_USER');

    expect(one!.textContent).toContain('CLIENT_USER');
    expect(one!.textContent).not.toContain('+');

    expect(many!.textContent).toContain('CLIENT_USER');
    // 두 번째 이후는 접힌다.
    expect(many!.textContent).not.toContain('CLIENT_MANAGER');
    expect(many!.textContent).toContain('+2');
  });

  it('소속이 여럿이면 첫 개만 그리고 나머지는 +N 으로 접는다', () => {
    const { container } = renderList(
      <UserMobileList
        {...baseProps}
        users={[
          makeUser({
            clients: [
              { client: CLIENTS[0]!, status: 'APPROVED' },
              { client: CLIENTS[1]!, status: 'APPROVED' },
            ],
          }),
        ]}
      />
    );

    expect(screen.getByRole('link', { name: /알파 고객사/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /베타 고객사/ })).not.toBeInTheDocument();
    expect(cards(container)[0]!.textContent).toContain('+1');
  });
});

describe('UserMobileList — 고객사 칸의 갈래', () => {
  it.each([['ADMIN'], ['MANAGER'], ['ENGINEER']])(
    '%s 역할이면 소속 대신 시스템 운영팀으로 표시한다',
    (roleName) => {
      const { container } = renderList(
        <UserMobileList {...baseProps} users={[makeUser({ roles: [role(roleName)] })]} />
      );

      // ADMIN 은 유형 배지도 '시스템 운영팀' 이라 텍스트만으로는 두 곳이 잡힌다.
      // 여기서 보려는 것은 **고객사 칸**의 안내(기울임 문구)다.
      expect(container.querySelector('span.italic')?.textContent).toBe('시스템 운영팀');
      expect(screen.queryByRole('button', { name: /고객사 할당/ })).not.toBeInTheDocument();
    }
  );

  it('시스템 역할이 아니고 소속이 없으면 할당 드롭다운을 그린다', () => {
    renderList(
      <UserMobileList {...baseProps} users={[makeUser({ roles: [role('CLIENT_USER')] })]} />
    );

    expect(screen.getByRole('button', { name: /고객사 할당/ })).toBeInTheDocument();
  });

  it('PENDING 소속은 승인/거절 액션으로 그린다', () => {
    renderList(
      <UserMobileList
        {...baseProps}
        users={[makeUser({ clients: [{ client: CLIENTS[0]!, status: 'PENDING' }] })]}
      />
    );

    expect(screen.getByText('알파 고객사 · 승인 대기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '알파 고객사 소속 승인' })).toBeInTheDocument();
  });

  it('APPROVED 소속은 고객사 상세로 링크하는 뱃지로 그린다', () => {
    renderList(
      <UserMobileList
        {...baseProps}
        users={[makeUser({ clients: [{ client: CLIENTS[0]!, status: 'APPROVED' }] })]}
      />
    );

    expect(screen.getByRole('link', { name: /알파 고객사/ })).toHaveAttribute(
      'href',
      '/clients/c-1'
    );
  });

  it('카드에서 고른 고객사도 그대로 할당 요청으로 나간다', async () => {
    const onRefresh = vi.fn();
    renderList(
      <UserMobileList
        {...baseProps}
        users={[makeUser({ roles: [role('CLIENT_USER')] })]}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /고객사 할당/ }));
    fireEvent.click(await screen.findByText('베타 고객사'));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/client');
    expect(init!.method).toBe('PATCH');
    expect(JSON.parse(init!.body as string)).toEqual({ clientId: 'c-2' });
  });
});

/**
 * 카드 하단의 액션 3종(`UserActions`).
 *
 * 세 버튼 모두 **누른 뒤 세션을 다시 읽고** 역할로 막는다. 막힌 경우에는 토스트만 뜨고
 * 콜백이 가지 않아야 한다 — 여기가 뒤집히면 권한 없는 사용자의 클릭이 그대로 서버로 간다.
 */
describe('UserMobileList — 카드 액션의 권한 게이트', () => {
  const renderActions = (over: Partial<UserListItem> = {}, props = {}) =>
    renderList(<UserMobileList {...baseProps} users={[makeUser(over)]} {...props} />);

  it('세션이 없으면 역할 관리를 막고 현재 역할을 "없음"으로 안내한다', async () => {
    const onAssignRoles = vi.fn();
    renderActions({}, { onAssignRoles });

    fireEvent.click(screen.getByRole('button', { name: /역할/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '역할 관리 권한이 없습니다. 현재 역할: 없음',
        })
      )
    );
    expect(onAssignRoles).not.toHaveBeenCalled();
    // 최신 역할로 판정하려고 세션을 먼저 갱신한다.
    expect(update).toHaveBeenCalled();
  });

  it('ADMIN 이 아닌 역할이면 역할 관리를 막고 보유 역할을 나열한다', async () => {
    session.current = { user: { id: 'me', roles: ['MANAGER', 'ENGINEER'] } };
    const onAssignRoles = vi.fn();
    renderActions({}, { onAssignRoles });

    fireEvent.click(screen.getByRole('button', { name: /역할/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '역할 관리 권한이 없습니다. 현재 역할: MANAGER, ENGINEER',
        })
      )
    );
    expect(onAssignRoles).not.toHaveBeenCalled();
  });

  it('ADMIN 이면 역할 관리를 연다', async () => {
    session.current = { user: { id: 'me', roles: ['ADMIN'] } };
    const onAssignRoles = vi.fn();
    renderActions({}, { onAssignRoles });

    fireEvent.click(screen.getByRole('button', { name: /역할/ }));

    await waitFor(() =>
      expect(onAssignRoles).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-1' }))
    );
    expect(toast).not.toHaveBeenCalled();
  });

  // 활성화 토글만 MANAGER 도 허용된다 — ADMIN 전용으로 좁히면 운영이 막힌다.
  it.each([['ADMIN'], ['MANAGER']])('%s 는 활성 토글을 실행한다', async (roleName) => {
    session.current = { user: { id: 'me', roles: [roleName] } };
    const onToggleActive = vi.fn();
    renderActions({ isActive: true }, { onToggleActive });

    fireEvent.click(screen.getByRole('button', { name: '비활성' }));

    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith('u-1', true));
  });

  it('권한이 없으면 활성 토글을 막는다', async () => {
    session.current = { user: { id: 'me', roles: ['CLIENT_USER'] } };
    const onToggleActive = vi.fn();
    renderActions({ isActive: false }, { onToggleActive });

    // 비활성 사용자에게는 버튼 라벨이 "활성" 으로 뒤집힌다.
    fireEvent.click(screen.getByRole('button', { name: '활성' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '사용자 활성화/비활성화 권한이 없습니다. 현재 역할: CLIENT_USER',
        })
      )
    );
    expect(onToggleActive).not.toHaveBeenCalled();
  });

  it('ADMIN 이 아니면 삭제 버튼 자체가 없다', () => {
    session.current = { user: { id: 'me', roles: ['MANAGER'] } };
    renderActions();

    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('ADMIN 이면 일반 사용자를 삭제할 수 있다', async () => {
    session.current = { user: { id: 'me', roles: ['ADMIN'] } };
    const onDelete = vi.fn();
    renderActions({ roles: [role('CLIENT_USER')] }, { onDelete });

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-1' }))
    );
  });

  it('자기 계정은 삭제할 수 없다', async () => {
    session.current = { user: { id: 'u-1', roles: ['ADMIN'] } };
    const onDelete = vi.fn();
    renderActions({}, { onDelete });

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '삭제 불가',
          description: '자신의 계정은 삭제할 수 없습니다.',
        })
      )
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it.each([['ADMIN'], ['MANAGER']])('%s 역할을 가진 계정은 삭제를 막는다', async (roleName) => {
    session.current = { user: { id: 'me', roles: ['ADMIN'] } };
    const onDelete = vi.fn();
    renderActions({ roles: [role(roleName)] }, { onDelete });

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '삭제 제한' }))
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
