import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RolesPage from '../page';

/**
 * 역할 목록 화면의 조회 계층.
 *
 * 이 화면의 위험은 표를 예쁘게 그리는 데 있지 않다. **403 과 빈 목록을 구분하는 것**에 있다.
 * 둘을 뭉개면 권한이 없는 사용자에게 "등록된 역할이 없습니다." 라고 말하게 되는데, 그건
 * 화면이 하는 거짓말이다(page.tsx 의 accessDenied 주석 참조). fetch 를 React Query 로
 * 옮기면서 403 이 성공 경로의 조기 return 에서 `error` 로 자리를 옮겼으므로, 그 분기가
 * 살아 있는지를 여기서 못박는다.
 */

vi.mock('@/components/roles/RoleTable', () => ({
  RoleTable: ({ roles }: any) => <div data-testid="role-table">{roles.length}</div>,
}));
vi.mock('@/components/roles/RoleMobileList', () => ({
  RoleMobileList: ({ roles }: any) => <div data-testid="role-mobile-list">{roles.length}</div>,
}));
vi.mock('@/components/roles/RoleDialog', () => ({ RoleDialog: () => null }));
vi.mock('@/components/roles/PermissionBoard', () => ({ PermissionBoard: () => null }));
vi.mock('@/components/roles/DeleteRoleDialog', () => ({ DeleteRoleDialog: () => null }));

vi.mock('@/components/ui', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

/**
 * 실물 Provider 로 감싼다. `@tanstack/react-query` 를 통째로 목킹하면 useQuery 만 있고
 * useQueryClient 가 없어서 죽는다 — 그 함정은 CLAUDE.md 에 기록돼 있다.
 *
 * `retry: false` / `gcTime: 0` 은 실패 케이스가 재시도로 타임아웃나지 않게 하기 위한 것이다.
 * (403 은 컴포넌트가 준 `retryUnlessClientError` 가 이미 막지만, 그 밖의 실패는 여기서 막힌다.)
 */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<RolesPage />, { wrapper });
}

/** 이 라우트는 봉투 없이 bare 배열을 돌려준다. 목도 그 형태를 지켜야 의미가 있다. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RolesPage', () => {
  it('bare 배열 응답을 목록으로 그린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        { id: 'r1', name: '관리자', permissions: [{ id: 'p1', permission: {} }] },
        // permissions 가 빠진 역할도 온다. 빈 배열로 정규화되지 않으면 표가 터진다.
        { id: 'r2', name: '일반사용자' },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByTestId('role-table')).toHaveTextContent('2');
    expect(screen.getByTestId('role-mobile-list')).toHaveTextContent('2');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roles',
      expect.objectContaining({ method: 'GET' })
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it('403 이면 빈 목록이 아니라 권한 없음 화면을 보여 준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' })));

    renderPage();

    expect(await screen.findByText('역할 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    // "데이터 없음" 으로 위장하지 않는다: 표도, 등록 버튼도 나오면 안 된다.
    expect(screen.queryByTestId('role-table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /등록/ })).not.toBeInTheDocument();
    // 403 은 전용 화면이 말해 주므로 토스트를 띄우지 않는다(기존 동작 그대로).
    expect(toast).not.toHaveBeenCalled();
  });

  it('403 을 재시도하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Forbidden' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await screen.findByText('역할 목록을 볼 권한이 없습니다.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('403 이 아닌 실패는 토스트로 알리고 평소 화면을 그린다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));

    renderPage();

    // 5xx 는 `retryUnlessClientError` 가 한 번 더 시도하게 두므로(그게 이 헬퍼의 요점이다)
    // waitFor 기본 1초로는 재시도 지연을 못 넘긴다. 이 여유는 재시도가 살아 있다는 증거다.
    await waitFor(
      () =>
        expect(toast).toHaveBeenCalledWith({
          title: '오류',
          description: '역할 목록을 불러오는데 실패했습니다.',
          variant: 'destructive',
        }),
      { timeout: 5000 }
    );
    // 실패해도 권한 없음 화면으로 가지 않는다 — 목록이 0건인 평소 화면이다.
    expect(screen.getByTestId('role-table')).toHaveTextContent('0');
    expect(screen.queryByText('역할 목록을 볼 권한이 없습니다.')).not.toBeInTheDocument();
  });

  it('첫 조회 동안 로딩 문구를 보여 준다', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    renderPage();

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });
});
