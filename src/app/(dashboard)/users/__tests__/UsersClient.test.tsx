import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UsersClient from '../UsersClient';

/**
 * 사용자 관리 화면이 React Query 로 옮겨진 뒤에도 **계약이 그대로인지** 본다.
 *
 * 이 화면에서 회귀는 조용하다. 지키려는 것 넷:
 *
 *  1. **URL 이 조회의 단일 진실**(커밋 94c2fd6). queryKey 에 입력 로컬 상태(searchQuery)를
 *     넣으면 글자마다 요청이 나가고 늦게 온 응답이 URL 이 정한 결과를 덮는다 — 그 커밋이
 *     없앤 경합이 정확히 되살아난다. 그래서 "타이핑해도 목록 요청이 늘지 않는다" 를 단언한다.
 *  2. **고객사·역할은 서로 독립**이다. 예전 `Promise.all` 은 한쪽이 던지면 멀쩡히 도착한
 *     다른 쪽까지 catch 로 버렸다.
 *  3. **403 은 '데이터 없음' 으로 위장하지 않는다.**
 *  4. **일괄 토글은 목록을 한 번만 다시 읽는다.** 예전에는 N명 선택 시 N번 재조회했고,
 *     그 N개의 요청이 서로를 취소하며 경합했다.
 *
 * 자식 컴포넌트는 최소 대역으로 바꾼다. 여기서 보려는 것은 표의 markup 이 아니라
 * **조회·변이 배선**이고, 일괄 작업 버튼·검색창·페이저는 전부 UsersClient 자신에 있다.
 */

const toast = vi.fn();
const push = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, update: vi.fn() }) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isAdmin: () => true }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('@/components/users/UserTable', () => ({
  UserTable: ({ users, loading, clients, onToggleUser, onRefresh }: any) => (
    <div>
      {loading && <span>로딩 중...</span>}
      <div data-testid="clients">{clients.map((c: any) => c.name).join(',')}</div>
      {users.map((u: any) => (
        <button key={u.id} onClick={() => onToggleUser(u.id)}>
          선택 {u.name}
        </button>
      ))}
      <button onClick={onRefresh}>목록 새로고침</button>
    </div>
  ),
}));
vi.mock('@/components/users/UserMobileList', () => ({ UserMobileList: () => null }));
vi.mock('@/components/users/UserDialog', () => ({ UserDialog: () => null }));
vi.mock('@/components/users/AssignRolesDialog', () => ({
  // availableRoles 를 밖으로 내보내야 "고객사가 실패해도 역할은 살아 있다" 를 볼 수 있다.
  AssignRolesDialog: ({ availableRoles }: any) => (
    <div data-testid="roles">{availableRoles.map((r: any) => r.name).join(',')}</div>
  ),
}));
vi.mock('@/components/users/DeleteUserDialog', () => ({ DeleteUserDialog: () => null }));
/* eslint-enable @typescript-eslint/no-explicit-any */

const USERS = [
  {
    id: 'u-1',
    email: 'hong@example.com',
    name: '홍길동',
    isActive: true,
    userType: 'CLIENT' as const,
    roles: [],
    clients: [],
  },
  {
    id: 'u-2',
    email: 'im@example.com',
    name: '임꺽정',
    isActive: true,
    userType: 'CLIENT' as const,
    roles: [],
    clients: [],
  },
];

const USERS_PAGE = {
  data: USERS,
  meta: {
    currentPage: 1,
    pageSize: 10,
    totalItems: 2,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
};

const CLIENTS_PAGE = {
  data: [{ id: 'c-1', name: '테스트 고객사', code: 'C001' }],
  meta: {
    currentPage: 1,
    pageSize: 10,
    totalItems: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
};

/** `/api/roles` 는 봉투 없이 bare 배열을 준다. */
const ROLES = [
  { id: 'r-1', name: 'ADMIN', description: null },
  { id: 'r-2', name: 'MANAGER', description: null },
];

/**
 * 손으로 만든 `{ ok, json }` 리터럴 대신 실제 `Response` 를 쓴다 — api-client 는 성공 응답에서
 * status(204 판별)와 text()(빈 본문 허용)까지 읽으므로, 대역이 좁으면 대역이 통과 여부를 정한다.
 */
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

/** 라우트별 응답. 개별 테스트가 필요한 것만 덮어쓴다. */
let respond: Record<string, () => Response>;

const calls = (predicate: (url: string, init?: RequestInit) => boolean) =>
  fetchMock.mock.calls.filter(([url, init]) => predicate(String(url), init as RequestInit));

const userListCalls = () =>
  calls((url, init) => url.startsWith('/api/users?') && init?.method !== 'PATCH');

const patchCalls = () => calls((_url, init) => init?.method === 'PATCH');

function renderUsers(query = '') {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>
  );
  const client = new QueryClient({
    defaultOptions: {
      // ⚠️ 이 retry:false 는 쿼리별 `retryUnlessClientError` 에 덮인다. 그래서 실패 케이스는
      // 전부 4xx 로 만든다 — 그 함수가 4xx 를 재시도하지 않으므로 실패가 즉시 확정된다.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<UsersClient />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);

  respond = {
    users: () => jsonResponse(USERS_PAGE),
    clients: () => jsonResponse(CLIENTS_PAGE),
    roles: () => jsonResponse(ROLES),
    patch: () => jsonResponse({ success: true }),
  };

  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return respond.patch!();
    if (url.startsWith('/api/users')) return respond.users!();
    if (url.startsWith('/api/clients')) return respond.clients!();
    if (url.startsWith('/api/roles')) return respond.roles!();
    throw new Error(`대역에 없는 요청: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('UsersClient', () => {
  it('URL 파생 조건으로 목록을 조회한다', async () => {
    renderUsers('page=2&q=%ED%99%8D&isActive=false');

    await waitFor(() => expect(screen.getByText('선택 홍길동')).toBeInTheDocument());

    expect(userListCalls()[0]![0]).toBe(
      '/api/users?page=2&pageSize=10&search=%ED%99%8D&isActive=false'
    );
    // 첫 로딩에서만 스피너가 뜬다.
    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
  });

  it('검색어가 없으면 search 파라미터를 붙이지 않는다(서버 해석은 동일)', async () => {
    renderUsers();
    await waitFor(() => expect(userListCalls()).toHaveLength(1));
    expect(userListCalls()[0]![0]).toBe('/api/users?page=1&pageSize=10&isActive=true');
  });

  it('고객사와 역할을 각각 독립적으로 조회한다 — 한쪽이 실패해도 다른 쪽은 남는다', async () => {
    // 403 이라 재시도가 없다. 예전 Promise.all 이었다면 역할 응답까지 catch 로 버려졌다.
    respond.clients = () => jsonResponse({ error: '권한이 없습니다.' }, 403);

    renderUsers();

    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN,MANAGER'));
    expect(screen.getByTestId('clients')).toHaveTextContent('');
    // 메타데이터 실패는 토스트를 띄우지 않는다(예전 catch 의 계약 그대로).
    expect(toast).not.toHaveBeenCalled();
  });

  it('입력에 타이핑해도 목록을 다시 조회하지 않고, 디바운스 뒤 URL 로만 반영한다', async () => {
    renderUsers();
    await waitFor(() => expect(userListCalls()).toHaveLength(1));

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByPlaceholderText('이름, 이메일 검색...'), {
        target: { value: '홍' },
      });

      // queryKey 가 URL 파생값만으로 만들어지므로 입력만으로는 요청이 늘지 않는다.
      // 여기서 실패하면 94c2fd6 이 없앤 두 번째 조회 경로가 되살아난 것이다.
      expect(userListCalls()).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(push).toHaveBeenCalledWith('?q=%ED%99%8D', { scroll: false });
    } finally {
      vi.useRealTimers();
    }

    // URL 은 목(mock)이라 바뀌지 않는다 — 그래서 조회는 여전히 1번이다.
    expect(userListCalls()).toHaveLength(1);
  });

  it('403 이면 "데이터 없음" 이 아니라 권한 없음 화면을 그린다', async () => {
    respond.users = () => jsonResponse({ error: '권한이 없습니다.' }, 403);

    renderUsers();

    await waitFor(() =>
      expect(screen.getByText('사용자 목록을 볼 권한이 없습니다.')).toBeInTheDocument()
    );
    expect(screen.queryByText('사용자 목록')).toBeInTheDocument();
    // 목록 실패는 토스트로 알리지 않는다 — 전용 화면이 대신 말해 준다.
    expect(toast).not.toHaveBeenCalled();
    // 4xx 는 재시도하지 않는다.
    expect(userListCalls()).toHaveLength(1);
  });

  it('일괄 비활성화는 선택한 수만큼 PATCH 하고 목록은 한 번만 다시 읽는다', async () => {
    renderUsers();
    await waitFor(() => expect(screen.getByText('선택 홍길동')).toBeInTheDocument());

    fireEvent.click(screen.getByText('선택 홍길동'));
    fireEvent.click(screen.getByText('선택 임꺽정'));
    expect(screen.getByText('2명 선택')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '일괄 비활성화' }));

    await waitFor(() => expect(patchCalls()).toHaveLength(2));

    // 호출 시그니처는 "현재 상태"를 넘기는 형태다. 원하는 상태를 넘기면 뒤집혀 무동작이 된다.
    expect(
      patchCalls()
        .map(([url]) => url)
        .sort()
    ).toEqual(['/api/users/u-1', '/api/users/u-2']);
    for (const [, init] of patchCalls()) {
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ isActive: false });
    }

    // 성공 토스트는 사람 수만큼(예전과 같다).
    await waitFor(() =>
      expect(toast.mock.calls.filter(([arg]) => arg.title === '상태 변경 완료')).toHaveLength(2)
    );

    // 핵심: 재조회는 N번이 아니라 1번이다(최초 조회 + 무효화 1회 = 2).
    await waitFor(() => expect(userListCalls()).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(userListCalls()).toHaveLength(2);
  });

  it('토글이 실패하면 고정 문구의 오류 토스트를 띄운다', async () => {
    renderUsers();
    await waitFor(() => expect(screen.getByText('선택 홍길동')).toBeInTheDocument());

    respond.patch = () => jsonResponse({ error: '서버가 준 메시지' }, 400);

    fireEvent.click(screen.getByText('선택 홍길동'));
    fireEvent.click(screen.getByRole('button', { name: '일괄 비활성화' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류 발생',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      })
    );
  });

  it('저장·소속 변경 후 목록을 무효화한다', async () => {
    renderUsers();
    await waitFor(() => expect(userListCalls()).toHaveLength(1));

    fireEvent.click(screen.getByText('목록 새로고침'));

    await waitFor(() => expect(userListCalls()).toHaveLength(2));
  });
});
