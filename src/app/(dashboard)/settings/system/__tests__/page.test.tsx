import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SystemSettingsPage from '../page';

/**
 * 시스템 설정 화면이 React Query 로 옮겨진 뒤에도 **화면에 보이는 계약**이 같은지 본다.
 *
 * 이 화면의 회귀는 조용하다:
 *  - 조회 실패는 **토스트로만** 알린다. 폼은 빈 값으로 계속 그려져야 한다 —
 *    useQuery 의 `error` 를 화면에 노출하면 그게 회귀다(기존 코드는 노출하지 않았다).
 *  - 첫 로딩만 '로딩 중...' 이다. `isPending` 이 아니라 `isFetching` 을 물리면
 *    저장 뒤 재조회마다 폼 전체가 사라졌다 나타난다.
 *  - 저장 뒤에는 `qk.settings.system` 무효화로 재조회가 뒤따라야 한다.
 *  - 저장 뒤에도 사용자가 입력하던 값이 서버 값으로 되돌아가면 안 된다.
 *    (PUT 이 아직 스텁이라 GET 은 예전 값을 그대로 돌려준다.)
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

const SETTINGS = {
  siteName: 'SR Management System v1.0',
  siteDescription: '서비스 요청 관리 시스템',
  adminEmail: 'admin@example.com',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecurity: 'TLS',
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
      <SystemSettingsPage />
    </QueryClientProvider>
  );
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;

const fill = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });

const callsWithMethod = (method: string) =>
  fetchMock.mock.calls.filter((call) => (call[1]?.method ?? 'GET') === method);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(SETTINGS));
});

describe('SystemSettingsPage', () => {
  it('첫 로딩 동안 로딩 문구를 보이고, 받은 설정으로 폼을 채운다', async () => {
    renderPage();

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('시스템 설정')).toBeInTheDocument());

    expect(input('site-name')).toHaveValue('SR Management System v1.0');
    expect(input('site-description')).toHaveValue('서비스 요청 관리 시스템');
    expect(input('admin-email')).toHaveValue('admin@example.com');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/settings/system');
  });

  it('조회가 실패해도 화면에는 에러를 노출하지 않고 토스트만 띄운다', async () => {
    // 403 을 쓰는 이유: 이 라우트는 ADMIN 전용이고, retryUnlessClientError 가
    // 4xx 를 재시도하지 않으므로 테스트가 재시도 지연을 기다리지 않는다.
    fetchMock.mockResolvedValue(jsonResponse({ error: '관리자 권한이 필요합니다.' }, 403));

    renderPage();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '시스템 설정을 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );

    // 폼은 계속 그려지고 값만 비어 있다 — 기존 동작과 같다.
    expect(screen.getByText('시스템 설정')).toBeInTheDocument();
    expect(input('site-name')).toHaveValue('');
    expect(screen.queryByText('관리자 권한이 필요합니다.')).not.toBeInTheDocument();
  });

  it('저장하면 PUT 을 보내고 성공 토스트 뒤 설정을 다시 읽는다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('시스템 설정')).toBeInTheDocument());

    fill('site-name', '새 사이트 이름');
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '시스템 설정이 저장되었습니다.',
      })
    );

    const put = callsWithMethod('PUT')[0]!;
    expect(put[0]).toBe('/api/settings/system');
    expect(JSON.parse((put[1] as { body: string }).body)).toEqual({
      siteName: '새 사이트 이름',
      siteDescription: '서비스 요청 관리 시스템',
      adminEmail: 'admin@example.com',
    });

    // onSettled 의 invalidateQueries 가 재조회를 일으킨다.
    await waitFor(() => expect(callsWithMethod('GET')).toHaveLength(2));

    // 재조회 결과(예전 값)가 사용자가 입력한 값을 덮어쓰면 안 된다.
    expect(input('site-name')).toHaveValue('새 사이트 이름');
  });

  it('저장이 실패하면 서버 메시지를 오류 토스트로 보여 준다', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('시스템 설정')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '저장 권한이 없습니다.' }, 403));
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '저장 권한이 없습니다.',
        variant: 'destructive',
      })
    );
  });
});
