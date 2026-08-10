import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RegisterForm from '../RegisterForm';

/**
 * 회원가입 폼의 **고객사 목록 조회**.
 *
 * 이 화면은 무인증 공개 라우트(`/api/clients/public`)에서 고객사를 받아 온다. 예전에는
 * `useEffect` + `fetch` 로 직접 받으면서 `if (clients.length > 0) return` 자기참조 가드와
 * `[clients.length]` 의존성으로 "한 번만 로드" 를 흉내 냈다. React Query 로 옮기면서 그
 * 가드를 지웠으므로, **캐시가 정말로 그 역할을 대신하는지**(계정 유형을 오갔을 때 요청이
 * 다시 나가지 않는지)를 단언한다. 가드도 캐시도 없으면 라디오를 누를 때마다 요청이 나간다.
 *
 * 또 하나: 이 조회의 실패는 **조용해야 한다.** 회원가입 화면에서 "고객사 목록을 못 불러왔다"
 * 는 에러를 띄우면 가입 자체가 막힌 것처럼 보인다. 원래 코드의 `catch { setClients([]) }`
 * 주석이 그 계약("등록된 고객사가 없습니다" 안내로 대체)을 명시하고 있어 그대로 지킨다.
 */

vi.mock('@/app/(auth)/register/actions', () => ({
  registerUser: vi.fn(),
}));

/**
 * Radix 의 RadioGroup(indicator 크기 측정)이 ResizeObserver 를 요구하는데 jsdom 에는 없다.
 * `vi.stubGlobal` 이 아니라 직접 대입하는 이유: 아래 `vi.unstubAllGlobals()` 가 fetch 스텁을
 * 걷어낼 때 이것까지 함께 사라져 두 번째 테스트부터 다시 터진다.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const LOADING = '고객사 목록 로딩 중...';
const EMPTY = '등록된 고객사가 없습니다. 관리자에게 문의하세요.';

const CLIENTS = [
  { id: 'c-1', name: '테스트 고객사 A', code: 'C001' },
  { id: 'c-2', name: '테스트 고객사 B', code: 'C002' },
];

/** 공개 목록 라우트로 나간 요청만 센다. 서버 액션은 fetch 가 아니라 여기 잡히지 않는다. */
function publicListCalls() {
  return vi
    .mocked(global.fetch)
    .mock.calls.filter(([url]) => String(url).includes('/api/clients/public'));
}

function stubFetch(respond: () => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond())
  );
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function renderForm() {
  // gcTime: 0 / mutations retry 0 은 저장소의 훅 테스트 관례를 따른다.
  // queries.retry 는 컴포넌트가 쿼리별로 `retryUnlessClientError` 를 지정하므로 여기서
  // 끄더라도 덮이지 않는다 — 500 케이스가 한 번 재시도하는 것은 의도된 동작이다.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<RegisterForm />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubFetch(() => ok(CLIENTS));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterForm — 고객사 목록 조회', () => {
  it('기본 계정 유형이 CLIENT 이므로 마운트 시 공개 목록을 부르고 그동안 로딩을 보여준다', async () => {
    renderForm();

    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText(LOADING)).not.toBeInTheDocument());
    expect(publicListCalls()).toHaveLength(1);
  });

  it('목록을 받으면 빈 목록 안내 대신 고객사 선택 UI 를 그린다', async () => {
    renderForm();

    await waitFor(() => expect(document.getElementById('client-select')).toBeInTheDocument());
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it('bare 배열이 아니라 {data, meta} 봉투로 와도 목록으로 읽는다', async () => {
    stubFetch(() =>
      ok({
        data: CLIENTS,
        meta: {
          currentPage: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      })
    );
    renderForm();

    await waitFor(() => expect(document.getElementById('client-select')).toBeInTheDocument());
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it('조회에 실패해도 에러를 노출하지 않고 빈 목록 안내만 남긴다', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: '고객사 목록을 불러올 수 없습니다.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    renderForm();

    // 500 은 재시도 대상이라 한 번 더 기다린다.
    await waitFor(() => expect(screen.getByText(EMPTY)).toBeInTheDocument(), { timeout: 5000 });
    // 서버가 준 문구가 화면 어디에도 새지 않아야 한다(회원가입을 막는 에러처럼 보인다).
    expect(screen.queryByText('고객사 목록을 불러올 수 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeNull(); // 안내 Alert 자체는 남는다
  });

  it('ENGINEER 로 갔다가 CLIENT 로 돌아와도 다시 부르지 않는다 (옛 자기참조 가드의 역할)', async () => {
    renderForm();
    await waitFor(() => expect(screen.queryByText(LOADING)).not.toBeInTheDocument());
    expect(publicListCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole('radio', { name: /기술 지원팀/ }));
    await screen.findByText(/기술 지원팀 계정은/);

    fireEvent.click(screen.getByRole('radio', { name: /고객사 담당자/ }));
    await waitFor(() => expect(document.getElementById('client-select')).toBeInTheDocument());

    expect(publicListCalls()).toHaveLength(1);
  });
});
