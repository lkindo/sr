import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CompanyUsersPage from '../page';

/**
 * 자사 사용자 — 고객사 관리자 전용 화면 (헌법 §1.1, 소유자 결정 2026-09-18 D6).
 *
 * 지키는 것:
 *  - 고객사 관리자에게만 보인다(서버도 자기 고객사 사용자만 준다 — GET /api/users 의 테넌트 스코프).
 *  - 가입 승인 대기자는 승인·거절, 나머지는 비활성화·재활성화. 자기 자신은 비활성화할 수 없다.
 *  - 사용자 생성·역할 부여 조작은 없다(PRD 권한표).
 *  - 한 번에 불러오는 수를 넘으면 그 사실을 적는다(조용히 자르지 않는다).
 */

const viewer = vi.hoisted(() => ({ roles: ['CLIENT_ADMIN'] as string[] }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasAnyRole: (roles: string[]) => roles.some((role) => viewer.roles.includes(role)),
  }),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'me' } }, status: 'authenticated' }),
}));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const USERS = [
  {
    id: 'me',
    name: '나관리',
    email: 'me@client.com',
    isActive: true,
    roles: [{ role: { name: 'CLIENT_ADMIN' } }],
    clients: [{ clientId: 'c1', status: 'APPROVED' }],
  },
  {
    id: 'pending-1',
    name: '신입',
    email: 'new@client.com',
    isActive: true,
    roles: [{ role: { name: 'CLIENT_USER' } }],
    clients: [{ clientId: 'c1', status: 'PENDING' }],
  },
  {
    id: 'active-1',
    name: '재직자',
    email: 'on@client.com',
    isActive: true,
    roles: [{ role: { name: 'CLIENT_USER' } }],
    clients: [{ clientId: 'c1', status: 'APPROVED' }],
  },
  {
    id: 'inactive-1',
    name: '퇴사자',
    email: 'off@client.com',
    isActive: false,
    roles: [{ role: { name: 'CLIENT_USER' } }],
    clients: [{ clientId: 'c1', status: 'APPROVED' }],
  },
];

const listBody = (users: unknown[], totalItems = users.length) => ({
  data: users,
  meta: {
    currentPage: 1,
    pageSize: 100,
    totalItems,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
});

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fetchMock = vi.fn();

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CompanyUsersPage />, { wrapper });
}

const callsTo = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

beforeEach(() => {
  vi.clearAllMocks();
  viewer.roles = ['CLIENT_ADMIN'];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET'
      ? jsonResponse(200, listBody(USERS))
      : jsonResponse(200, { success: true })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('자사 사용자', () => {
  it('고객사 관리자가 아니면 목록을 조회하지 않고 안내만 보인다', () => {
    viewer.roles = ['MANAGER'];
    renderPage();

    expect(screen.getByText('고객사 관리자만 볼 수 있는 화면입니다.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('상태별로 할 수 있는 조작만 보이고, 생성·역할 변경 조작은 없다', async () => {
    renderPage();

    expect(await screen.findByText('신입')).toBeInTheDocument();
    expect(screen.getByText('가입 승인 대기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신입 가입 승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신입 가입 거절' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재직자 비활성화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '퇴사자 다시 활성화' })).toBeInTheDocument();
    // 자기 자신은 비활성화할 수 없다(스스로 잠기는 사고 방지).
    expect(screen.queryByRole('button', { name: '나관리 비활성화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /사용자 추가|역할/ })).not.toBeInTheDocument();
  });

  it('승인은 가입 승인 API 를, 거절은 같은 경로의 DELETE 를 부른다', async () => {
    renderPage();
    await screen.findByText('신입');

    fireEvent.click(screen.getByRole('button', { name: '신입 가입 승인' }));
    await waitFor(() => expect(callsTo('POST')).toHaveLength(1));
    expect(callsTo('POST')[0]![0]).toBe('/api/users/pending-1/client/approve');

    fireEvent.click(screen.getByRole('button', { name: '신입 가입 거절' }));
    await waitFor(() => expect(callsTo('DELETE')).toHaveLength(1));
    expect(callsTo('DELETE')[0]![0]).toBe('/api/users/pending-1/client/approve');
  });

  it('비활성화는 확인을 받은 뒤 isActive=false 로 수정한다', async () => {
    renderPage();
    await screen.findByText('재직자');

    fireEvent.click(screen.getByRole('button', { name: '재직자 비활성화' }));

    await waitFor(() => expect(callsTo('PATCH')).toHaveLength(1));
    const [url, init] = callsTo('PATCH')[0]!;
    expect(url).toBe('/api/users/active-1');
    expect(JSON.parse(init.body)).toEqual({ isActive: false });
  });

  it('확인을 취소하면 비활성화하지 않는다', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );
    renderPage();
    await screen.findByText('재직자');

    fireEvent.click(screen.getByRole('button', { name: '재직자 비활성화' }));

    expect(callsTo('PATCH')).toHaveLength(0);
  });

  it('한 번에 불러온 수보다 많으면 그 사실을 적는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, listBody(USERS, 250)));
    renderPage();

    expect(await screen.findByText('전체 250명 중 4명을 표시합니다.')).toBeInTheDocument();
  });
});
