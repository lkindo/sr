import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrganizationPage from '../page';

/**
 * 조직 구조 화면의 조회·변이 계층.
 *
 * 이 화면이 React Query 로 옮겨지면서 사라진 것이 세 가지다:
 *   1. 행 확장 지연로딩을 손으로 쌓던 `clientUsers` dict(state)
 *   2. 사용자 상태 변경 뒤 **펼쳐진 고객사를 for 루프로 하나씩** 다시 조회하던 직렬 N+1
 *   3. 소속 변경 성공 뒤 목록·양쪽 고객사를 `Promise.all` 로 모아 한 번에 setState 하던 배치
 * 셋 다 `invalidateQueries({ queryKey: qk.clients.all })` 한 줄로 대체됐으므로, 여기서는
 * **요청이 어디로 몇 번 나가는지**를 못박는다.
 *
 * 가장 깨지기 쉬운 계약은 409 다. `ONGOING_SRS` 는 실패가 아니라 "확인이 필요한 상태" 라서
 * `onError` 로 흘리면 경고 UI 대신 오류 토스트가 뜨고 끝난다. 그 회귀를 잡는 테스트가 아래
 * '409 는 실패가 아니라 경고 UI 다' 이다.
 */

vi.mock('@/components/organization/OrganizationTree', () => ({
  OrganizationTree: ({
    clients,
    expandedClients,
    clientUsers,
    onToggleClient,
    onToggleUserStatus,
    onDragEnd,
  }: any) => (
    <div>
      <span data-testid="client-count">{clients.length}</span>
      {clients.map((client: any) => (
        <div key={client.id}>
          <button onClick={() => onToggleClient(client.id)}>{`toggle-${client.id}`}</button>
          <span data-testid={`expanded-${client.id}`}>
            {expandedClients.has(client.id) ? 'open' : 'closed'}
          </span>
          <span data-testid={`users-${client.id}`}>
            {(clientUsers[client.id] ?? []).map((user: any) => user.name).join(',')}
          </span>
        </div>
      ))}
      {/*
        실물 트리는 카드가 그리고 있는 **현재 상태**(`user.isActive`)를 그대로 넘긴다.
        뒤집기는 페이지의 mutation 이 한다 — 여기서 원하는 상태를 넘기면 계약이 어긋난다.
      */}
      <button onClick={() => onToggleUserStatus('u1', true)}>toggle-active-user</button>
      <button onClick={() => onToggleUserStatus('u2', false)}>toggle-inactive-user</button>
      <button
        onClick={() =>
          onDragEnd({
            active: {
              data: {
                current: { userId: 'u1', sourceClientId: 'c1', user: { id: 'u1', name: '홍길동' } },
              },
            },
            over: { data: { current: { clientId: 'c2' } } },
          })
        }
      >
        drag-u1-to-c2
      </button>
    </div>
  ),
}));

/** 다이얼로그는 세 가지 상태만 밖으로 드러내면 된다: 열림 / 경고 / 진행 중. */
vi.mock('@/components/organization/UserReassignDialog', () => ({
  UserReassignDialog: ({ open, onConfirm, isLoading, ongoingSRs, showWarning }: any) =>
    open ? (
      <div>
        <span data-testid="dialog-state">
          {showWarning ? `warn:${ongoingSRs.length}` : 'no-warn'}
        </span>
        <span data-testid="dialog-loading">{isLoading ? 'loading' : 'idle'}</span>
        <button onClick={() => onConfirm(showWarning)}>confirm-reassign</button>
      </div>
    ) : null,
}));

vi.mock('@/components/clients/ClientDialog', () => ({ ClientDialog: () => null }));
vi.mock('@/components/users/UserDialog', () => ({ UserDialog: () => null }));

vi.mock('@/components/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

/**
 * 실물 Provider 로 감싼다. `@tanstack/react-query` 를 통째로 목킹하면 useQueries·
 * useQueryClient 가 없어서 죽는다.
 */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<OrganizationPage />, { wrapper });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const CLIENTS = [
  { id: 'c1', code: 'ALPHA', name: '알파', isActive: true, _count: { users: 1, srs: 0 } },
  { id: 'c2', code: 'BETA', name: '베타', isActive: true, _count: { users: 0, srs: 0 } },
];

/** 목록 라우트는 `{data, meta}` 봉투, 상세 라우트는 bare object 다(예외 라우트). */
function clientListResponse() {
  return jsonResponse(200, {
    data: CLIENTS,
    meta: {
      currentPage: 1,
      pageSize: 1000,
      totalItems: CLIENTS.length,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  });
}

/** URL 별 응답을 정하는 목. 반환된 mock 으로 "어디로 몇 번 나갔는지" 를 단언한다. */
function stubFetch(
  overrides: (url: string, init: RequestInit | undefined) => Response | undefined = () => undefined
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const override = overrides(url, init);
    if (override) return override;
    if (url.startsWith('/api/clients?')) return clientListResponse();
    if (url === '/api/clients/c1') {
      return jsonResponse(200, { id: 'c1', users: [{ id: 'u1', name: '홍길동' }] });
    }
    if (url === '/api/clients/c2') return jsonResponse(200, { id: 'c2', users: [] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 특정 URL 로 나간 요청 수. */
function callsTo(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  return fetchMock.mock.calls.filter(([called]) => called === url).length;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrganizationPage', () => {
  it('첫 조회 동안 로딩 문구를 보여 준다', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    renderPage();

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('목록 봉투를 벗겨 통계와 트리를 그린다', async () => {
    const fetchMock = stubFetch();

    renderPage();

    expect(await screen.findByTestId('client-count')).toHaveTextContent('2');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clients?pageSize=1000',
      expect.objectContaining({ method: 'GET' })
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it('행을 펼친 고객사만 사용자를 지연 조회한다', async () => {
    const fetchMock = stubFetch();

    renderPage();
    fireEvent.click(await screen.findByText('toggle-c1'));

    await screen.findByText('홍길동');
    expect(screen.getByTestId('users-c1')).toHaveTextContent('홍길동');
    expect(screen.getByTestId('expanded-c1')).toHaveTextContent('open');
    // 펼치지 않은 고객사는 건드리지 않는다 — 예전 for 루프가 만들던 N+1 이 여기서 죽는다.
    expect(callsTo(fetchMock, '/api/clients/c2')).toBe(0);
  });

  it('사용자 상태 변경 뒤 목록과 펼쳐진 고객사만 다시 가져온다', async () => {
    const fetchMock = stubFetch((url, init) =>
      url === '/api/users/u1' && init?.method === 'PATCH' ? jsonResponse(200, {}) : undefined
    );

    renderPage();
    fireEvent.click(await screen.findByText('toggle-c1'));
    await screen.findByText('홍길동');

    const listCallsBefore = callsTo(fetchMock, '/api/clients?pageSize=1000');
    const c1CallsBefore = callsTo(fetchMock, '/api/clients/c1');

    fireEvent.click(screen.getByText('toggle-active-user'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '사용자 상태가 변경되었습니다.',
      })
    );

    expect(callsTo(fetchMock, '/api/clients?pageSize=1000')).toBeGreaterThan(listCallsBefore);
    expect(callsTo(fetchMock, '/api/clients/c1')).toBeGreaterThan(c1CallsBefore);
    // 접혀 있는 고객사는 무효화돼도 다시 가져오지 않는다(비활성 쿼리).
    expect(callsTo(fetchMock, '/api/clients/c2')).toBe(0);
  });

  /**
   * 회귀 방지: 예전에는 `{ isActive: undefined }` 를 보냈고, `JSON.stringify` 가 undefined 값의
   * 키를 통째로 지우는 바람에 실제로 나간 본문이 `{}` 였다 — 서버는 아무것도 바꾸지 않는데
   * 화면은 성공 토스트를 띄웠다. 본문이 다시 비면 이 테스트가 빨간불이 된다.
   */
  it('사용자 토글은 현재 상태를 뒤집은 값을 본문에 실어 보낸다', async () => {
    const fetchMock = stubFetch((url, init) =>
      (url === '/api/users/u1' || url === '/api/users/u2') && init?.method === 'PATCH'
        ? jsonResponse(200, {})
        : undefined
    );

    renderPage();
    await screen.findByTestId('client-count');

    // 활성 사용자를 토글하면 비활성화 요청이 나간다.
    fireEvent.click(screen.getByText('toggle-active-user'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/u1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) })
      )
    );

    // 비활성 사용자를 토글하면 활성화 요청이 나간다.
    fireEvent.click(screen.getByText('toggle-inactive-user'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/u2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: true }) })
      )
    );

    // 빈 본문은 더 이상 나가지 않는다.
    const patchBodies = fetchMock.mock.calls
      .filter(([url, init]) => String(url).startsWith('/api/users/') && init?.method === 'PATCH')
      .map(([, init]) => init?.body);
    expect(patchBodies).not.toContain('{}');
  });

  it('409 는 실패가 아니라 경고 UI 다 — 토스트 없이 강제 이동을 유도한다', async () => {
    let reassignCalls = 0;
    const fetchMock = stubFetch((url, init) => {
      if (url !== '/api/users/u1/client' || init?.method !== 'PATCH') return undefined;
      reassignCalls += 1;
      if (reassignCalls === 1) {
        return jsonResponse(409, {
          error: '진행 중인 SR이 있습니다.',
          code: 'ONGOING_SRS',
          data: { ongoingSRs: [{ id: 's1' }, { id: 's2' }] },
        });
      }
      return jsonResponse(200, { data: { ongoingSRsHandled: 2 } });
    });

    renderPage();
    fireEvent.click(await screen.findByText('drag-u1-to-c2'));

    // 1차 시도: force 없이 나가고, 409 는 오류가 아니라 경고 상태가 된다.
    fireEvent.click(await screen.findByText('confirm-reassign'));

    expect(await screen.findByTestId('dialog-state')).toHaveTextContent('warn:2');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/u1/client',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ clientId: 'c2', force: false }),
      })
    );
    // 409 로 오류 토스트가 뜨면 그게 회귀다.
    expect(toast).not.toHaveBeenCalled();

    // 2차 시도: 같은 버튼이 이제 force: true 로 나간다.
    fireEvent.click(screen.getByText('confirm-reassign'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '홍길동이(가) 베타(으)로 이동되었습니다. (진행 중인 SR 2건 유지됨)',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/u1/client',
      expect.objectContaining({ body: JSON.stringify({ clientId: 'c2', force: true }) })
    );
    // 성공하면 다이얼로그가 닫힌다.
    await waitFor(() => expect(screen.queryByTestId('dialog-state')).not.toBeInTheDocument());
  });

  it('409 가 아닌 실패는 서버 메시지를 그대로 토스트로 알리고 다이얼로그를 열어 둔다', async () => {
    stubFetch((url, init) =>
      url === '/api/users/u1/client' && init?.method === 'PATCH'
        ? jsonResponse(400, { error: '이동할 수 없는 사용자입니다.' })
        : undefined
    );

    renderPage();
    fireEvent.click(await screen.findByText('drag-u1-to-c2'));
    fireEvent.click(await screen.findByText('confirm-reassign'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '이동할 수 없는 사용자입니다.',
        variant: 'destructive',
      })
    );
    expect(screen.getByTestId('dialog-state')).toHaveTextContent('no-warn');
  });

  it('목록 조회 실패는 토스트로 알리고 빈 트리를 그린다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' })));

    renderPage();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '고객사 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );
    expect(screen.getByTestId('client-count')).toHaveTextContent('0');
  });
});
