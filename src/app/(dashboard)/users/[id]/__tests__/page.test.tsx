import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UserDetailPage from '../page';

/**
 * `/users/[id]` 가 React Query 로 옮겨진 뒤에도 **화면에 보이는 계약**이 같은지 본다.
 *
 * 이 화면의 회귀는 전부 조용하다:
 *  - 404 는 토스트가 아니라 `notFound()` 다. 그리고 그 호출은 **렌더 단계**여야 한다
 *    (커밋 94c2fd6). effect/onError 로 내려가면 아무 일도 일어나지 않고 "사용자를 찾을 수
 *    없습니다." 만 남는다 — 응답은 200 이라 크롤러·모니터링에도 정상으로 잡힌다.
 *  - 삭제 실패 문구 재매핑 다섯 갈래. 뭉개면 사용자는 "삭제 실패" 라는 말만 보게 되고,
 *    특히 **진행 중인 SR** 갈래는 서버가 붙여 준 SR 번호가 사라진다.
 *  - 삭제 전 세 가지 사전 차단(권한/자기 자신/시스템 역할)은 **요청을 보내기 전에** 끝나야 한다.
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  notFound: vi.fn(),
  update: vi.fn(),
  session: {
    user: { id: 'admin-1', roles: ['ADMIN'] as string[], permissions: [] as string[] },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: h.toast }),
}));

/**
 * 이 저장소의 vitest alias 는 `next/navigation` 을 공용 목으로 바꾸는데, 거기에는
 * `useParams` 가 없다(이 화면이 처음 쓰는 훅이다). 그래서 여기서만 따로 목을 준다.
 *
 * `notFound` 는 실제로는 예외를 던져 렌더를 끊지만, 여기서는 던지지 않는 spy 로 둔다 —
 * 던지게 하면 에러 경계 없이는 테스트가 렌더 실패로 끝나 "무엇이 불렸는지" 를 볼 수 없다.
 * 대신 아래 404 테스트가 "notFound 가 불렸고 오류 토스트는 뜨지 않았다" 를 함께 단언한다.
 */
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'u-1' }),
  useRouter: () => ({
    push: h.push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/users/u-1',
  useSearchParams: () => new URLSearchParams(),
  notFound: h.notFound,
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: h.session, update: h.update }),
}));

/** 역할 두 개가 `sr.read` 를 공유한다 — 중복 제거가 살아 있으면 권한은 2개로 세어진다. */
const USER = {
  id: 'u-1',
  name: '홍길동',
  email: 'hong@example.com',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  roles: [
    {
      role: {
        id: 'r-1',
        name: 'ENGINEER',
        permissions: [
          { permission: { id: 'p-1', resource: 'sr', action: 'read' } },
          { permission: { id: 'p-2', resource: 'sr', action: 'update' } },
        ],
      },
    },
    {
      role: {
        id: 'r-2',
        name: 'VIEWER',
        permissions: [{ permission: { id: 'p-3', resource: 'sr', action: 'read' } }],
      },
    },
  ],
  clients: [],
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fetchMock = vi.fn();

/** 실물 Provider. 상세 쿼리는 `retry: retryUnlessClientError` 라 4xx 로만 실패시켜야 즉시 확정된다. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserDetailPage />
    </QueryClientProvider>
  );
}

const callsWith = (method: string) =>
  fetchMock.mock.calls.filter((call) => (call[1]?.method ?? 'GET') === method);

/** 사용자를 보여 주는 첫 화면이 그려질 때까지 기다린다. */
const waitForLoaded = () =>
  waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('홍길동'));

/** `user` 를 바꿔 GET 응답으로 돌려준다. */
const respondWithUser = (overrides: Partial<typeof USER> = {}) => {
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
    if ((init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(jsonResponse({ ...USER, ...overrides }));
    }
    return Promise.resolve(jsonResponse({ success: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { user: { id: 'admin-1', roles: ['ADMIN'], permissions: [] } };
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  respondWithUser();
});

describe('UserDetailPage 조회', () => {
  it('로딩 문구를 먼저 보여 주고 사용자 정보를 그린다', async () => {
    renderPage();

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();

    await waitForLoaded();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/u-1');
    // 이메일은 헤더와 '기본 정보' 카드 두 곳에 나온다.
    expect(screen.getAllByText('hong@example.com')).toHaveLength(2);
    // resource.action 중복 제거가 살아 있으면 3개가 아니라 2개다.
    expect(screen.getByText('권한 목록 (2개)')).toBeInTheDocument();
  });

  it('404 면 렌더 중에 notFound() 를 부르고 오류 토스트는 띄우지 않는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '사용자를 찾을 수 없습니다.' }, 404));

    renderPage();

    await waitFor(() => expect(h.notFound).toHaveBeenCalled());
    expect(h.toast).not.toHaveBeenCalled();
    // retryUnlessClientError 가 4xx 를 재시도하지 않으므로 not-found 가 즉시 확정된다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('그 밖의 실패는 오류 토스트와 빈 화면으로 끝난다', async () => {
    // 403 을 쓰는 것은 의도다 — 5xx 였다면 재시도 백오프를 기다려야 한다.
    fetchMock.mockResolvedValue(jsonResponse({ error: '권한이 없습니다.' }, 403));

    renderPage();

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '오류',
        description: '사용자 정보를 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );
    expect(screen.getByText('사용자를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(h.notFound).not.toHaveBeenCalled();
  });
});

describe('UserDetailPage 활성화', () => {
  it('PATCH 를 보내고 성공 토스트 뒤 상세를 다시 읽는다', async () => {
    respondWithUser({ isActive: false });
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '활성화 완료',
        description: '사용자 홍길동이(가) 활성화되었습니다.',
      })
    );

    const patch = callsWith('PATCH')[0]!;
    expect(patch[0]).toBe('/api/users/u-1');
    expect(JSON.parse(patch[1].body)).toEqual({ isActive: true });

    // 무효화가 재조회를 일으킨다. 두 번의 invalidateQueries 가 요청을 **두 번** 내지
    // 않는지도 함께 본다(cancelRefetch 기본값 트랩).
    await waitFor(() => expect(callsWith('GET')).toHaveLength(2));
  });

  it('활성화가 실패하면 오류 토스트만 띄우고 재조회하지 않는다', async () => {
    respondWithUser({ isActive: false });
    renderPage();
    await waitForLoaded();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '권한이 없습니다.' }, 403));
    fireEvent.click(screen.getByTitle('활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '오류 발생',
        description: '사용자 활성화에 실패했습니다.',
        variant: 'destructive',
      })
    );
    expect(callsWith('GET')).toHaveLength(1);
  });
});

describe('UserDetailPage 삭제', () => {
  it('활성 사용자는 hard 없이 DELETE 하고 목록으로 이동한다', async () => {
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() => expect(callsWith('DELETE')).toHaveLength(1));
    expect(callsWith('DELETE')[0]?.[0]).toBe('/api/users/u-1');
    expect(h.toast).toHaveBeenCalledWith({
      title: '비활성화 완료',
      description: '사용자가 성공적으로 비활성화되었습니다.',
    });
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/users'));
  });

  it('비활성 사용자는 ?hard=true 로 완전 삭제한다', async () => {
    respondWithUser({ isActive: false });
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('완전 삭제'));

    await waitFor(() => expect(callsWith('DELETE')).toHaveLength(1));
    expect(callsWith('DELETE')[0]?.[0]).toBe('/api/users/u-1?hard=true');
    expect(h.toast).toHaveBeenCalledWith({
      title: '완전 삭제 완료',
      description: '사용자가 영구적으로 삭제되었습니다.',
    });
  });

  it('confirm 을 취소하면 요청을 보내지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    expect(callsWith('DELETE')).toHaveLength(0);
  });

  it('자신의 계정이면 확인창도 띄우지 않는다', async () => {
    h.session = { user: { id: 'u-1', roles: ['ADMIN'], permissions: [] } };
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '삭제 불가',
        description: '자신의 계정은 삭제할 수 없습니다.',
        variant: 'destructive',
      })
    );
    expect(window.confirm).not.toHaveBeenCalled();
    expect(callsWith('DELETE')).toHaveLength(0);
  });

  it('시스템 역할을 가진 사용자는 요청 전에 막힌다', async () => {
    respondWithUser({
      roles: [{ role: { id: 'r-9', name: 'MANAGER', permissions: [] } }],
    });
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '삭제 제한',
        description: '시스템 관리자 계정은 삭제할 수 없습니다. 역할을 변경하거나 비활성화하세요.',
        variant: 'destructive',
      })
    );
    expect(callsWith('DELETE')).toHaveLength(0);
  });

  it('ADMIN 이 아니면 현재 역할을 알려 주고 막는다', async () => {
    h.session = { user: { id: 'admin-1', roles: ['ENGINEER'], permissions: [] } };
    renderPage();
    await waitForLoaded();

    // PermissionGuard 가 ADMIN 이 아닌 세션에서는 버튼 자체를 숨긴다. 세션이 뒤늦게
    // 강등된 경우를 흉내 내기 위해 버튼이 없다는 것만 확인한다.
    expect(screen.queryByTitle('비활성화')).not.toBeInTheDocument();
  });
});

describe('UserDetailPage 삭제 실패 문구 재매핑', () => {
  const deleteFailsWith = (message: string) => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse(USER));
      }
      return Promise.resolve(jsonResponse({ error: message }, 400));
    });
  };

  const lastDescription = () =>
    (h.toast.mock.calls[h.toast.mock.calls.length - 1]![0] as { description: string }).description;

  it.each([
    ['본인 계정은 삭제할 수 없습니다.', '자신의 계정은 삭제할 수 없습니다.'],
    // SR 번호가 붙은 서버 문구는 **그대로** 나가야 한다. 여기가 뭉개지면 사용자는 어느 SR
    // 때문에 막혔는지 알 수 없다.
    [
      '진행 중인 SR이 할당되어 있습니다: SR-2026-0001, SR-2026-0002',
      '진행 중인 SR이 할당되어 있습니다: SR-2026-0001, SR-2026-0002',
    ],
    ['시스템 운영팀 계정입니다', '시스템 운영팀 사용자는 삭제할 수 없습니다.'],
    [
      'SR 요청 또는 처리 이력이 존재합니다',
      'SR 요청/처리 이력이 있는 사용자는 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.',
    ],
    // 어느 갈래에도 맞지 않으면 서버 문구를 그대로 보여 준다.
    ['알 수 없는 이유로 실패했습니다', '알 수 없는 이유로 실패했습니다'],
  ])('서버가 "%s" 를 주면 "%s" 로 보여 준다', async (serverMessage, expected) => {
    deleteFailsWith(serverMessage);
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() => expect(callsWith('DELETE')).toHaveLength(1));
    await waitFor(() => expect(lastDescription()).toBe(expected));
    expect(h.push).not.toHaveBeenCalled();
  });

  it('서버가 메시지를 주지 않으면 기본 문구를 쓴다', async () => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse(USER));
      }
      return Promise.resolve(jsonResponse({}, 500));
    });
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '삭제 실패',
        description: '삭제 실패',
        variant: 'destructive',
      })
    );
  });

  it('응답 자체가 없으면(네트워크 오류) 고정 문구를 쓴다', async () => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(jsonResponse(USER));
      }
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    renderPage();
    await waitForLoaded();

    fireEvent.click(screen.getByTitle('비활성화'));

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: '삭제 실패',
        description: '사용자 삭제에 실패했습니다.',
        variant: 'destructive',
      })
    );
  });
});
