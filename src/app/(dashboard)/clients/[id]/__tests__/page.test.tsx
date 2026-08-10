import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClientDetailPage from '../page';

/**
 * 고객사 상세 화면의 조회·변이 계층.
 *
 * fetch 를 React Query 로 옮기면서 **말없이 바뀌기 쉬운 네 가지**를 못박는다:
 *
 *   1. `/api/clients/[id]` 는 목록 봉투가 아니라 **bare object** 를 준다(예외 라우트).
 *      apiList 로 잘못 옮기면 `.data` 가 undefined 라 화면이 통째로 빈다.
 *   2. **404 는 목록으로 되돌려보낸다.** 예전에는 성공 경로 안의 `response.status === 404`
 *      분기였고 지금은 `ApiError.status` 다 — 그 분기가 사라지면 없는 고객사에서 멈춘다.
 *      그 밖의 실패는 화면에 머물며 고정 문구만 띄운다.
 *   3. **카테고리 삭제 실패는 서버 메시지를 그대로 노출한다.** SR 이 걸린 카테고리를 서버가
 *      막을 때 그 이유("비활성화하라")를 사용자가 봐야 하기 때문이다. 고정 문구로 뭉개면 회귀다.
 *   4. **사용자 제외는 읽기-수정-쓰기다.** GET 으로 읽은 소속에서 이 고객사만 빼고 PATCH 로
 *      되쓴다. 필터가 뒤집히면 사용자의 다른 고객사 소속이 통째로 날아간다.
 */

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const push = vi.fn();
// vitest.config 의 alias 가 next/navigation 을 공용 목으로 바꾸지만 그 목에는 useParams 가
// 없다. 이 화면은 라우트 파라미터로 조회 대상을 정하므로 여기서 직접 준다.
// (factory 안에서 `push` 를 **함수 본문**으로만 참조한다 — 팩토리는 import 시점에 실행되므로
//  최상단에서 참조하면 TDZ 로 죽는다.)
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cl-1' }),
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// 다이얼로그 4종은 전부 닫힌 채로 렌더된다. 실물을 끌어오면 server action 과 자기 쿼리까지
// 딸려 와서 이 테스트가 보려는 것(조회·변이)과 무관한 실패가 난다.
vi.mock('@/components/clients/ClientDialog', () => ({ ClientDialog: () => null }));
vi.mock('@/components/clients/DeleteClientDialog', () => ({ DeleteClientDialog: () => null }));
vi.mock('@/components/clients/ServiceCategoryDialog', () => ({
  ServiceCategoryDialog: () => null,
}));
vi.mock('@/components/users/UserDialog', () => ({ UserDialog: () => null }));

/* eslint-disable @typescript-eslint/no-explicit-any */
// Radix 프리미티브 대역. Tabs 는 **전부 펼쳐서** 그린다 — 여기서 볼 것은 탭 전환이 아니라
// 사용자 탭 안의 "제외" 버튼이 어떤 요청을 내보내는가다.
vi.mock('@/components/ui', () => {
  const passthrough = ({ children }: any) => <div>{children}</div>;
  return {
    Button: ({ children, onClick, disabled, ['aria-label']: ariaLabel }: any) => (
      <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
        {children}
      </button>
    ),
    Badge: ({ children }: any) => <span>{children}</span>,
    Separator: () => <hr />,
    Table: ({ children }: any) => <table>{children}</table>,
    TableHeader: ({ children }: any) => <thead>{children}</thead>,
    TableBody: ({ children }: any) => <tbody>{children}</tbody>,
    TableRow: ({ children }: any) => <tr>{children}</tr>,
    TableHead: ({ children }: any) => <th>{children}</th>,
    TableCell: ({ children }: any) => <td>{children}</td>,
    Tabs: passthrough,
    TabsList: passthrough,
    TabsTrigger: ({ children }: any) => <button>{children}</button>,
    TabsContent: passthrough,
  };
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ⚠️ 봉투(`{data, meta}`)가 아니다. 이 라우트는 bare object 를 준다. */
const CLIENT = {
  id: 'cl-1',
  code: 'C001',
  name: '테스트 고객사',
  isActive: true,
  serviceCategories: [{ id: 'cat-1', categoryName: '장애처리', slaHours: 4, priority: 'HIGH' }],
  users: [{ user: { id: 'u-1', name: '김사용', email: 'kim@example.com' } }],
  srs: [],
};

/** 이 사용자는 두 고객사에 속해 있다 — 필터가 한쪽만 지우는지 보려면 두 개가 필요하다. */
const USER_DETAIL = {
  id: 'u-1',
  clients: [{ client: { id: 'cl-1' } }, { client: { id: 'cl-2' } }],
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * 실물 QueryClientProvider 로 감싼다. `@tanstack/react-query` 를 통째로 목킹하면
 * useQuery 만 있고 나머지가 없어서 죽는다.
 *
 * `retry: false` 는 여기서 안전망일 뿐이다 — 이 화면의 쿼리는 자기 `retry` 옵션
 * (`retryUnlessClientError`)을 갖고 있어 **전역 설정을 덮는다.** 그래서 실패 케이스는
 * 전부 4xx 로 만든다(5xx 면 백오프 재시도가 붙어 waitFor 가 늘어진다).
 */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ClientDetailPage />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('고객사 상세 — 조회', () => {
  it('bare object 응답을 그대로 그린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, CLIENT));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    // 최초 조회 동안에는 예전 `loading` state 와 같은 문구가 뜬다.
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();

    expect(await screen.findByText('장애처리')).toBeInTheDocument();
    expect(screen.getByText('김사용')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/clients/cl-1');
  });

  it('404 면 토스트를 띄우고 목록으로 되돌려보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Client not found' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/clients'));
    expect(toast).toHaveBeenCalledWith({
      title: '오류',
      description: '고객사를 찾을 수 없습니다.',
      variant: 'destructive',
    });
    // 4xx 는 retryUnlessClientError 가 막는다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 가 아닌 실패는 고정 문구만 띄우고 화면에 머문다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: '권한이 없습니다.' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '고객사 정보를 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );
    // 서버가 준 '권한이 없습니다.' 를 노출하지 않는 것이 기존 catch 의 계약이다.
    expect(toast).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('고객사를 찾을 수 없습니다.')).toBeInTheDocument();
  });
});

describe('고객사 상세 — 서비스 카테고리 삭제', () => {
  it('confirm 을 취소하면 아무 요청도 하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, CLIENT));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );

    renderPage();
    await screen.findByText('장애처리');
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '장애처리 삭제' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('삭제에 성공하면 성공 토스트 후 다시 조회한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(jsonResponse(200, { success: true }));
      return Promise.resolve(jsonResponse(200, CLIENT));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );

    renderPage();
    await screen.findByText('장애처리');
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '장애처리 삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '서비스 카테고리가 삭제되었습니다.',
      })
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/clients/cl-1/categories/cat-1');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });
    // 예전 fetchClient() 재호출 자리 — 상세를 다시 읽어야 표에서 사라진다.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/clients/cl-1');
  });

  it('서버가 막으면 그 이유를 그대로 보여준다 (참조 무결성 계약)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          jsonResponse(409, {
            error: '이 카테고리를 사용하는 SR이 3건 있습니다. 삭제 대신 비활성화하세요.',
          })
        );
      }
      return Promise.resolve(jsonResponse(200, CLIENT));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );

    renderPage();
    await screen.findByText('장애처리');

    fireEvent.click(screen.getByRole('button', { name: '장애처리 삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '이 카테고리를 사용하는 SR이 3건 있습니다. 삭제 대신 비활성화하세요.',
        variant: 'destructive',
      })
    );
  });
});

describe('고객사 상세 — 사용자 제외 (읽기-수정-쓰기)', () => {
  it('읽은 소속에서 이 고객사만 빼서 PATCH 한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/users/u-1' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      if (url === '/api/users/u-1') return Promise.resolve(jsonResponse(200, USER_DETAIL));
      return Promise.resolve(jsonResponse(200, CLIENT));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );

    renderPage();
    await screen.findByText('김사용');
    fetchMock.mockClear();

    // 사용자 행의 제외 버튼은 아이콘뿐이라 이름이 없다. 표에서 유일한 버튼이다.
    const userRow = screen.getByText('kim@example.com').closest('tr')!;
    fireEvent.click(userRow.querySelector('button')!);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '사용자가 고객사에서 제외되었습니다.',
      })
    );

    // 1단계: 현재 소속을 읽는다.
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/users/u-1');
    // 2단계: 이 고객사만 빠진 목록을 되쓴다. cl-2 는 남아야 한다.
    const patch = fetchMock.mock.calls[1]!;
    expect(patch[0]).toBe('/api/users/u-1');
    expect((patch[1] as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      clientIds: ['cl-2'],
    });
  });

  it('어느 단계에서 실패하든 고정 문구만 보여준다', async () => {
    // 1단계 GET 이 403 으로 실패하는 경우. 서버 메시지는 삼키는 것이 기존 계약이다.
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/users/u-1' && init?.method !== 'PATCH') {
        return Promise.resolve(jsonResponse(403, { error: '이 사용자를 볼 권한이 없습니다.' }));
      }
      return Promise.resolve(jsonResponse(200, CLIENT));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );

    renderPage();
    await screen.findByText('김사용');

    const userRow = screen.getByText('kim@example.com').closest('tr')!;
    fireEvent.click(userRow.querySelector('button')!);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '사용자 제외에 실패했습니다.',
        variant: 'destructive',
      })
    );
    // PATCH 까지 가지 않는다 — 읽기가 실패하면 쓰기를 하면 안 된다.
    expect(
      fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH')
    ).toBe(false);
  });
});
