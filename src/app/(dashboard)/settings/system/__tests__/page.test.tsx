import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SystemSettingsPage from '../page';

/**
 * 시스템 설정 화면 — **실제로 적용 중인 값을 보여 주는 읽기 전용 화면**.
 *
 * 예전 화면은 사이트 이름·설명·관리자 이메일을 입력받아 "설정 저장" 으로 PUT 을 보냈지만 서버는
 * 아무것도 저장하지 않고 성공을 돌려줬다. "지금 백업"·"캐시 삭제" 버튼은 클릭 핸들러가 없었고,
 * "마지막 백업: 2025-01-12 10:30", "세션 24시간", "최소 6자" 는 JSX 에 박힌 값이었다.
 * 지켜야 하는 것:
 *  - 서버가 준 실제 값(세션·비밀번호 정책·메일 서버)을 보여 준다.
 *  - 저장·백업·캐시 삭제처럼 **동작하지 않는 조작을 제공하지 않는다**.
 *  - 조회 실패는 토스트로만 알린다(기존 동작).
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
  session: {
    idleLogoutMinutes: 30,
    idleWarningMinutes: 1,
    tokenMaxAgeHours: 8,
    absoluteMaxAgeHours: 12,
  },
  loginLock: { maxFailures: 10, windowMinutes: 15, lockMinutes: 15 },
  passwordPolicy: '8~100자, 대문자·소문자·숫자·특수문자를 각각 1개 이상 포함',
  mailServer: {
    host: 'mail.example.org',
    port: 2525,
    configured: true,
    credentialsConfigured: true,
  },
};

const IDLE_TEXT = '입력이 30분간 없으면 로그아웃(1분 전에 경고)';

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
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(SETTINGS));
});

describe('SystemSettingsPage', () => {
  it('첫 로딩 동안 로딩 문구를 보이고, 서버가 준 실제 값을 보여 준다', async () => {
    renderPage();

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    // 사용자가 실제로 겪는 규칙(유휴 로그아웃)과 토큰 수명·절대 수명을 따로 보여 준다(결정 D13).
    expect(await screen.findByText(IDLE_TEXT)).toBeInTheDocument();
    expect(screen.getByText('마지막 사용 후 8시간 · 로그인 후 최대 12시간')).toBeInTheDocument();
    expect(screen.getByText('15분 안에 10번 틀리면 15분 동안 로그인 거부')).toBeInTheDocument();
    expect(screen.getByText(SETTINGS.passwordPolicy)).toBeInTheDocument();
    expect(screen.getByText('mail.example.org:2525')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/settings/system');
  });

  it('메일 서버 환경변수가 없으면 기본값을 쓰고 있다고 알린다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...SETTINGS,
        mailServer: {
          host: 'smtp.gmail.com',
          port: 587,
          configured: false,
          credentialsConfigured: true,
        },
      })
    );
    renderPage();

    expect(await screen.findByText('smtp.gmail.com:587')).toBeInTheDocument();
    expect(
      screen.getByText(/EMAIL_SERVER_HOST 가 설정되지 않아 기본값을 씁니다/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/알림 메일이 발송되지 않습니다/)).not.toBeInTheDocument();
  });

  it('발송 계정이 없으면 호스트가 맞아도 메일이 나가지 않는다고 알린다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...SETTINGS,
        mailServer: { ...SETTINGS.mailServer, credentialsConfigured: false },
      })
    );
    renderPage();

    expect(await screen.findByText('mail.example.org:2525')).toBeInTheDocument();
    expect(screen.getByText(/알림 메일이 발송되지 않습니다/)).toBeInTheDocument();
  });

  it('정상 설정이면 메일 경고를 띄우지 않는다', async () => {
    renderPage();

    await screen.findByText('mail.example.org:2525');
    expect(screen.queryByText(/기본값을 씁니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/알림 메일이 발송되지 않습니다/)).not.toBeInTheDocument();
  });

  it('동작하지 않는 조작(저장·지금 백업·캐시 삭제)과 가짜 값을 보여 주지 않는다', async () => {
    renderPage();
    await screen.findByText(IDLE_TEXT);

    for (const name of ['설정 저장', '지금 백업', '캐시 삭제', '변경']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/2025-01-12/)).not.toBeInTheDocument();
    expect(screen.queryByText(/24시간/)).not.toBeInTheDocument();
    expect(screen.queryByText(/최소 6자/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // 조회 외의 요청을 보내지 않는다.
    expect(fetchMock.mock.calls.every((call) => (call[1]?.method ?? 'GET') === 'GET')).toBe(true);
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
    expect(screen.getByText('시스템 설정')).toBeInTheDocument();
    expect(screen.queryByText('관리자 권한이 필요합니다.')).not.toBeInTheDocument();
  });
});
