import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from '../page';

/**
 * 프로필 화면이 React Query 로 옮겨진 뒤에도 **화면에 보이는 계약**이 같은지 본다.
 *
 * 이 화면에서 회귀가 나면 조용하다는 것이 핵심이다:
 *  - 조회 실패는 화면(로드 실패 블록)과 토스트 **양쪽**에 나와야 한다. 한쪽만 남아도
 *    사용자는 "빈 화면" 또는 "사라지는 알림" 중 하나만 보게 된다.
 *  - 저장 성공 뒤에는 반드시 재조회가 뒤따라야 한다(예전 `fetchProfile()`,
 *    지금은 `invalidateQueries`). 빠지면 화면이 옛 값을 계속 보여 준다.
 *  - 비밀번호 불일치 검증은 **요청을 보내기 전에** 끝나야 한다. mutation 안으로
 *    옮기면 서버 왕복 없이도 버튼이 '변경 중...' 으로 깜빡인다.
 */

const toast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

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

const PROFILE = {
  id: 'u-1',
  name: '홍길동',
  email: 'hong@example.com',
  image: '',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: [{ role: { id: 'r-1', name: 'ADMIN' } }],
  clients: [],
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fetchMock = vi.fn();

/** 실물 Provider 로 감싼다. retry:false / gcTime:0 이 없으면 실패 케이스가 재시도로 늘어진다. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>
  );
}

/**
 * 비밀번호 폼은 '보안' 탭 안에 있고, Radix Tabs 는 비활성 탭을 마운트하지 않는다.
 * Radix 는 탭을 click 이 아니라 mousedown 에서 전환하므로 click 만 보내면 아무 일도 없다.
 */
const openSecurityTab = () => fireEvent.mouseDown(screen.getByRole('tab', { name: /보안/ }));

/** 마지막 fetch 호출의 [url, init]. */
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;

const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;

const fill = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id)!, { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(PROFILE));
});

describe('ProfilePage', () => {
  it('프로필을 불러와 폼과 카드에 채운다', async () => {
    renderPage();

    expect(screen.getByText('프로필 정보를 불러오는 중...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('hong@example.com')).toBeInTheDocument());
    expect(document.getElementById('name')).toHaveValue('홍길동');
  });

  it('조회가 실패하면 로드 실패 화면과 오류 토스트가 함께 나온다', async () => {
    // 403 을 쓰는 것은 의도다 — retryUnlessClientError 가 4xx 를 재시도하지 않으므로
    // 실패가 즉시 확정된다. 5xx 였다면 백오프 1초를 기다려야 한다(아래에서 호출 수로 단언).
    fetchMock.mockResolvedValue(jsonResponse({ error: '권한이 없습니다.' }, 403));

    renderPage();

    await waitFor(() => expect(screen.getByText('프로필 로드 실패')).toBeInTheDocument());

    // 서버 메시지가 아니라 화면 고정 문구를 쓰는 것이 이 화면의 계약이다.
    expect(screen.getByText('프로필 정보를 불러오는데 실패했습니다.')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith({
      title: '오류',
      description: '프로필 정보를 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('저장하면 PATCH 를 보내고 성공 토스트 뒤 프로필을 다시 읽는다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('hong@example.com')).toBeInTheDocument());

    fill('name', '임꺽정');
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '프로필이 업데이트되었습니다.',
      })
    );

    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/profile');
    expect(bodyOf(patch)).toEqual({ name: '임꺽정', image: '' });

    // onSettled 의 invalidateQueries 가 재조회를 일으킨다.
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'GET')).toHaveLength(2)
    );
  });

  it('저장이 실패하면 서버 메시지를 오류 토스트로 보여 준다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('hong@example.com')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '이름이 너무 깁니다.' }, 400));
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '이름이 너무 깁니다.',
        variant: 'destructive',
      })
    );
  });

  it('새 비밀번호가 일치하지 않으면 요청을 보내지 않는다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('hong@example.com')).toBeInTheDocument());

    openSecurityTab();
    await waitFor(() => expect(document.getElementById('currentPassword')).toBeInTheDocument());

    fill('currentPassword', 'old-secret');
    fill('newPassword', 'new-secret');
    fill('confirmPassword', 'typo-secret');
    fireEvent.click(screen.getByRole('button', { name: /비밀번호 변경/ }));

    expect(toast).toHaveBeenCalledWith({
      title: '오류',
      description: '새 비밀번호가 일치하지 않습니다.',
      variant: 'destructive',
    });
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });

  it('비밀번호를 변경하면 POST 를 보내고 입력 필드를 비운다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('hong@example.com')).toBeInTheDocument());

    openSecurityTab();
    await waitFor(() => expect(document.getElementById('currentPassword')).toBeInTheDocument());

    fill('currentPassword', 'old-secret');
    fill('newPassword', 'new-secret');
    fill('confirmPassword', 'new-secret');

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    fireEvent.click(screen.getByRole('button', { name: /비밀번호 변경/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '비밀번호가 변경되었습니다.',
      })
    );

    const call = lastCall();
    expect(call[0]).toBe('/api/profile/password');
    expect(bodyOf(call)).toEqual({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
      confirmPassword: 'new-secret',
    });
    await waitFor(() => expect(document.getElementById('currentPassword')).toHaveValue(''));
  });
});
