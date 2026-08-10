import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClientsPage from '../page';

/**
 * 고객사 목록 화면의 조회 계층.
 *
 * 이 화면의 계약은 "표가 예쁘게 그려지는가" 가 아니라 **어떤 응답이 화면을 이기는가** 다.
 * 검색 입력에 디바운스가 없어 키 입력마다 요청이 나가므로, 늦게 도착한 옛 응답이 최신
 * 결과를 덮으면 검색창에는 'TEST001' 이 있는데 표에는 전체 목록이 떠 있게 된다.
 * 예전 코드는 수동 AbortController + `finally` 가드로 그 경합을 막았고(커밋 c95334e),
 * 지금은 React Query 의 키별 캐시가 같은 일을 한다. 그 등가성이 이 파일의 주제다:
 *
 *   1. 이전 요청은 **실제로 abort 된다**(queryFn 이 signal 을 넘기지 않으면 안 일어난다).
 *   2. 늦게 온 옛 응답이 최신 표를 덮지 않는다.
 *   3. 검색 중에도 표가 비지 않는다(keepPreviousData) — 로딩은 첫 조회에서만 켠다.
 *   4. 행 확장은 펼칠 때만 요청하고, 실패는 **조용하다**(기존 `catch {}` 계약).
 */

vi.mock('@/components/clients/ClientTable', () => ({
  ClientTable: ({ clients, loading, expandedRows, clientUsers, onToggleRowExpansion }: any) => (
    <div data-testid="client-table">
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="expanded">{Array.from(expandedRows as Set<string>).join(',')}</span>
      {clients.map((client: any) => (
        <div key={client.id} data-testid={`row-${client.code}`}>
          <button
            data-testid={`toggle-${client.id}`}
            onClick={() => onToggleRowExpansion(client.id)}
          >
            toggle
          </button>
          <span data-testid={`users-${client.id}`}>
            {(clientUsers[client.id] ?? []).map((uc: any) => uc.user.name).join(',')}
          </span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/clients/ClientMobileList', () => ({
  ClientMobileList: ({ clients }: any) => (
    <div data-testid="client-mobile-list">{clients.length}</div>
  ),
}));

// 저장 성공 콜백만 있으면 된다. 실물은 서버 액션을 import 해서 jsdom 으로 끌고 올 수 없다.
vi.mock('@/components/clients/ClientDialog', () => ({
  ClientDialog: ({ onSaved }: any) => (
    <button data-testid="client-saved" onClick={onSaved}>
      saved
    </button>
  ),
}));

vi.mock('@/components/clients/ClientUsersSheet', () => ({ ClientUsersSheet: () => null }));

vi.mock('@/components/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isAdmin: () => true }),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

/** 목록 라우트의 `{data, meta}` 봉투. 목이 이 형태를 지켜야 봉투 검사가 의미를 갖는다. */
function listResponse(clients: Array<{ id: string; code: string }>, totalItems = clients.length) {
  return jsonResponse(200, {
    data: clients.map((client) => ({ ...client, name: client.code, isActive: true })),
    meta: {
      currentPage: 1,
      pageSize: 10,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / 10)),
      hasPreviousPage: false,
      hasNextPage: totalItems > 10,
    },
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * 실물 Provider 로 감싼다(`@tanstack/react-query` 자체를 목킹하지 않는다).
 *
 * 기본값은 `retry: false, gcTime: 0` 이다. 다만 **행 확장 캐시**를 보는 테스트만은 앱의
 * 전역 기본값(ClientLayout.tsx: staleTime 60초 / gcTime 5분)을 그대로 준다 — gcTime 0 이면
 * 행을 접는 순간 캐시가 사라져서 "접었다 펴도 다시 안 부른다" 를 확인할 수 없다.
 */
function renderPage(queryDefaults: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, ...queryDefaults } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<ClientsPage />, { wrapper });
}

const APP_CACHE_DEFAULTS = { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000 };

const typeSearch = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('고객사명, 코드로 검색...'), { target: { value } });

const listCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter((call) => String(call[0]).startsWith('/api/clients?'));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClientsPage - 목록', () => {
  it('봉투에서 목록과 전체 건수를 꺼내 그린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse([{ id: 'c1', code: 'TEST001' }], 42));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByTestId('row-TEST001')).toBeInTheDocument();
    expect(screen.getByTestId('client-mobile-list')).toHaveTextContent('1');
    // meta.totalItems 는 표의 행 수가 아니라 서버가 준 전체 건수다.
    expect(screen.getByText('42')).toBeInTheDocument();

    // 'all' 필터와 빈 검색어는 URL 에 아예 나타나지 않는다(예전 if 문과 같은 결과).
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/clients?page=1&pageSize=10');
    expect(toast).not.toHaveBeenCalled();
  });

  it('첫 조회 동안에만 로딩을 켠다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    renderPage();

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('검색어를 넣으면 그 값이 실린 URL 로 다시 조회한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse([{ id: 'c1', code: 'TEST001' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId('row-TEST001');

    typeSearch('TEST001');

    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2));
    expect(listCalls(fetchMock)[1]![0]).toBe('/api/clients?page=1&pageSize=10&search=TEST001');
  });

  it('검색어가 바뀌면 이전 요청을 abort 하고, 늦게 온 옛 응답이 표를 덮지 않는다', async () => {
    // 이 화면이 가진 가장 비싼 버그의 회귀 가드다. 첫 요청(검색어 없음)을 일부러 붙잡아 두고
    // 검색 결과가 먼저 도착하게 만든 뒤, 옛 응답을 나중에 풀어 준다.
    const signals: Array<AbortSignal | undefined> = [];
    let releaseStaleResponse: (() => void) | undefined;

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      if (!url.includes('search=')) {
        return new Promise<Response>((resolve) => {
          releaseStaleResponse = () =>
            resolve(
              listResponse([
                { id: 'c1', code: 'TEST001' },
                { id: 'c2', code: 'TEST002' },
              ])
            );
        });
      }
      return Promise.resolve(listResponse([{ id: 'c1', code: 'TEST001' }]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    typeSearch('TEST001');
    await screen.findByTestId('row-TEST001');
    expect(screen.queryByTestId('row-TEST002')).not.toBeInTheDocument();

    // (1) queryFn 이 signal 을 넘겼는가. 넘기지 않으면 React Query 는 취소를 시도조차 하지 않는다.
    expect(signals[0]).toBeDefined();
    expect(signals[0]!.aborted).toBe(true);

    // (2) 그래도 옛 응답이 도착했다고 치자. 다른 queryKey 의 캐시로 들어가므로 화면은 그대로다.
    releaseStaleResponse!();
    await Promise.resolve();
    await waitFor(() => expect(screen.queryByTestId('row-TEST002')).not.toBeInTheDocument());
    expect(screen.getByTestId('row-TEST001')).toBeInTheDocument();
  });

  it('검색 중에는 표를 비우지 않는다(keepPreviousData)', async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (!url.includes('search=')) {
        return Promise.resolve(
          listResponse([
            { id: 'c1', code: 'TEST001' },
            { id: 'c2', code: 'TEST002' },
          ])
        );
      }
      return new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId('row-TEST002');

    typeSearch('TEST001');
    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2));

    // 응답을 기다리는 동안 이전 결과가 그대로 보인다. 로딩(=isPending)도 켜지지 않는다 —
    // isFetching 을 물렸다면 여기서 표가 '로딩 중...' 으로 바뀐다.
    expect(screen.getByTestId('row-TEST002')).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');

    resolveSecond!(listResponse([{ id: 'c1', code: 'TEST001' }]));
    await waitFor(() => expect(screen.queryByTestId('row-TEST002')).not.toBeInTheDocument());
  });

  it('조회가 실패하면 고정 문구 토스트를 한 번 띄우고 재시도하지 않는다', async () => {
    // 403 을 쓰는 것은 의도다 — retryUnlessClientError 가 4xx 를 재시도하지 않으므로
    // 실패가 즉시 확정된다(5xx 였다면 백오프 1초를 기다려야 한다).
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '고객사 목록을 불러오지 못했습니다.',
        variant: 'destructive',
      })
    );
    expect(toast).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('고객사를 저장하면 목록을 다시 읽는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse([{ id: 'c1', code: 'TEST001' }]));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByTestId('row-TEST001');

    fireEvent.click(screen.getByTestId('client-saved'));

    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2));
  });
});

describe('ClientsPage - 행 확장', () => {
  const detail = {
    users: [{ user: { id: 'u1', name: '홍길동', email: 'hong@example.com' } }],
  };

  /** 목록 1건 + 상세(행 확장) 응답. */
  function stubFetch(detailResponse: Response) {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        String(url).startsWith('/api/clients?')
          ? listResponse([{ id: 'c1', code: 'TEST001' }])
          : detailResponse
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('펼칠 때만 상세를 조회해 소속 사용자를 채운다', async () => {
    const fetchMock = stubFetch(jsonResponse(200, detail));

    renderPage();
    await screen.findByTestId('row-TEST001');

    // 펼치기 전에는 상세 요청이 없다. (있으면 목록 화면에서 고객사 수만큼 요청이 샌다.)
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/clients/c1')).toBe(false);

    fireEvent.click(screen.getByTestId('toggle-c1'));

    // 행은 즉시 펼쳐지고 사용자 목록만 뒤따른다.
    expect(screen.getByTestId('expanded')).toHaveTextContent('c1');
    await waitFor(() => expect(screen.getByTestId('users-c1')).toHaveTextContent('홍길동'));
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/clients/c1')).toHaveLength(1);
  });

  it('접었다 다시 펴도 캐시가 있으면 다시 조회하지 않는다', async () => {
    const fetchMock = stubFetch(jsonResponse(200, detail));

    renderPage(APP_CACHE_DEFAULTS);
    await screen.findByTestId('row-TEST001');

    fireEvent.click(screen.getByTestId('toggle-c1'));
    await waitFor(() => expect(screen.getByTestId('users-c1')).toHaveTextContent('홍길동'));

    fireEvent.click(screen.getByTestId('toggle-c1'));
    expect(screen.getByTestId('expanded')).toHaveTextContent('');

    fireEvent.click(screen.getByTestId('toggle-c1'));
    await waitFor(() => expect(screen.getByTestId('users-c1')).toHaveTextContent('홍길동'));

    // 예전 수동 dict 캐시(`if (!clientUsers[clientId])`)가 하던 일을 캐시가 그대로 한다.
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/clients/c1')).toHaveLength(1);
  });

  it('상세 조회가 실패해도 조용하다', async () => {
    const fetchMock = stubFetch(jsonResponse(500, { error: 'boom' }));

    renderPage();
    await screen.findByTestId('row-TEST001');

    fireEvent.click(screen.getByTestId('toggle-c1'));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/clients/c1')).toHaveLength(1)
    );

    // 기존 `catch {}` 계약: 토스트도 재시도도 없고, 행은 '등록된 사용자가 없습니다.' 로 남는다.
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByTestId('users-c1')).toHaveTextContent('');
    expect(screen.getByTestId('expanded')).toHaveTextContent('c1');
  });
});
