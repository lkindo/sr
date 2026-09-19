import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '@/lib/query-keys';

import MyRequestsPage from '../page';

const viewer = vi.hoisted(() => ({ canCreate: true }));
const toast = vi.fn();

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isAdmin: () => false,
    hasPermission: () => viewer.canCreate,
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/srs/CreateSRDialog', () => ({
  CreateSRDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="새 SR 요청" /> : null,
}));
vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  const { uiMock } = await import('@/__tests__/mocks/ui-primitives');
  const { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } = uiMock();
  return { ...actual, Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const request = {
  id: 'sr-1',
  srNumber: 'SR-001',
  title: '메일 접속 오류 확인',
  status: 'REQUESTED',
  requestedPriority: 'MEDIUM',
  createdAt: '2026-09-18T00:00:00Z',
  updatedAt: '2026-09-18T00:00:00Z',
  waitingMinutes: 0,
  waitingHours: 0,
  progressPercentage: 10,
  client: { id: 'client-1', code: 'TEST', name: '테스트 고객사' },
  serviceCategory: { id: 'category-1', categoryName: '메일', slaHours: 8, priority: 'MEDIUM' },
  _count: { comments: 0, attachments: 0 },
};

function response(data: (typeof request)[] = [], total = data.length) {
  return new Response(
    JSON.stringify({
      data,
      meta: { totalPages: 1, totalItems: data.length },
      stats: { total, requested: total, inProgress: 0, completed: 0 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function failure() {
  return new Response(JSON.stringify({ error: '목록을 가져올 수 없습니다.' }), { status: 403 });
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<MyRequestsPage />, { wrapper });
  return { client, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer.canCreate = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('내 요청 목록의 오류와 빈 상태', () => {
  it('첫 조회 실패를 빈 목록으로 표시하지 않고 다시 시도하면 요청을 보여 준다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(response([request]));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('요청 목록을 불러오지 못했습니다');
    expect(screen.queryByText('전체 요청')).not.toBeInTheDocument();
    expect(screen.queryByText('요청한 SR이 없습니다')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첫 SR 요청하기' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText(request.title)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('필터 결과가 없으면 첫 요청을 권하지 않고 조건을 해제해 기존 요청을 다시 보여 준다', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          new URL(url, 'http://localhost').searchParams.has('status')
            ? response([], 1)
            : response([request])
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const { user } = setup();
    await screen.findByText(request.title);

    await user.selectOptions(screen.getAllByRole('combobox')[0]!, 'COMPLETED');

    expect(await screen.findByText('조건에 맞는 요청이 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첫 SR 요청하기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '조건 초기화' }));
    expect(await screen.findByText(request.title)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('all');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it('빈 목록에서 생성 권한이 없으면 생성 버튼과 작성 안내를 노출하지 않는다', async () => {
    viewer.canCreate = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    setup();

    expect(await screen.findByText('요청한 SR이 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /SR 요청/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/첫 SR을 요청하여/)).not.toBeInTheDocument();
  });

  it('진짜 최초의 빈 목록에서는 권한 있는 사용자가 첫 요청을 작성할 수 있다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: '첫 SR 요청하기' }));

    expect(screen.getByRole('dialog', { name: '새 SR 요청' })).toBeInTheDocument();
  });

  it('배경 갱신 실패 시 이전 요청을 보존하고 재시도 경로를 제공한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([request]))
      .mockResolvedValueOnce(failure());
    vi.stubGlobal('fetch', fetchMock);
    const { client } = setup();
    await screen.findByText(request.title);

    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.myRequests.all });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('이전 결과를 표시하고 있습니다');
    expect(screen.getByText(request.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
