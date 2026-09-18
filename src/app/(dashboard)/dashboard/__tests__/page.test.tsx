import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from '../page';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

// 보는 사람. 기본은 ADMIN 이고, 역할별 카드 노출은 아래 '접수 대기 카드' 스위트가 바꿔 가며 본다.
const viewer = vi.hoisted(() => ({ roles: ['ADMIN'] as string[], permissions: [] as string[] }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    roles: viewer.roles,
    permissions: viewer.permissions,
    hasAnyRole: (roles: string[]) => roles.some((role) => viewer.roles.includes(role)),
    hasRole: () => false,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    isAdmin: () => true,
  }),
}));

const STATS = {
  summary: {
    total: 10,
    inProgress: 3,
    completed: 4,
    pending: 3,
    requested: 0,
    urgent: 1,
    myAssigned: 0,
    myAssignedInProgress: 0,
  },
  byStatus: {},
  byPriority: {},
  byClient: [],
  recentSRs: [],
  waitingSRs: [],
  myAssignedSRs: [],
  performance: { avgProcessingHours: 5, slaComplianceRate: 90, avgWaitingHours: 2 },
  trend: [],
};

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function fail(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: '권한이 없습니다.' }),
    text: async () => '',
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer.roles = ['ADMIN'];
  viewer.permissions = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('첫 로딩에는 스켈레톤을, 성공하면 통계를 그린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(STATS));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(createElement(DashboardPage), { wrapper });

    expect(screen.queryByRole('heading', { name: '대시보드' })).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '대시보드' })).toBeTruthy();
    });
    expect(screen.getByText('10')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/stats', expect.anything());
  });

  it('실패하면 토스트만 띄우고 스켈레톤을 유지한다(4xx 는 재시도하지 않는다)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(403));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(createElement(DashboardPage), { wrapper });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '대시보드 통계를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    });
    expect(screen.queryByRole('heading', { name: '대시보드' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('재조회 중에는 스켈레톤으로 되돌아가지 않는다(isPending, isFetching 아님)', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(STATS))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );
    vi.stubGlobal('fetch', fetchMock);
    const { client, wrapper } = setup();

    render(createElement(DashboardPage), { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '대시보드' })).toBeTruthy();
    });

    // await 하면 안 된다 — invalidateQueries 는 재조회가 끝날 때까지 resolve 되지 않는데
    // 두 번째 응답을 일부러 붙잡아 두고 있기 때문이다.
    void client.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // 두 번째 요청이 아직 떠 있는 동안에도 화면은 이전 데이터를 계속 보여야 한다.
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeTruthy();

    resolveSecond?.(ok(STATS));
  });
});

/**
 * 접수 대기 카드 — 각 항목이 접수 화면(/srs/[id]/intake)으로 연결되므로 접수할 수 있는 사람에게만 보인다.
 * 접수는 운영 관리자(ADMIN·MANAGER 또는 SR:INTAKE) 업무다(소유자 결정 2026-09-18). 예전에는 ENGINEER 에게도
 * 보여서, 눌러 들어가면 "접수 처리 권한이 없습니다" 화면이 나왔다.
 */
describe('DashboardPage — 접수 대기 카드', () => {
  const WITH_WAITING = {
    ...STATS,
    summary: { ...STATS.summary, requested: 2 },
    waitingSRs: [
      {
        id: 'sr-1',
        srNumber: 'SR-001',
        title: '대기 중인 요청',
        priority: 'MEDIUM',
        client: { name: '가나' },
        requester: { name: '김신청' },
        createdAt: new Date().toISOString(),
      },
    ],
  };

  it.each([
    ['ADMIN', ['ADMIN'], [], true],
    ['MANAGER', ['MANAGER'], [], true],
    ['SR:INTAKE 를 받은 커스텀 역할', ['TRIAGE'], ['SR:INTAKE'], true],
    ['ENGINEER', ['ENGINEER'], ['SR:READ', 'SR:UPDATE'], false],
  ])('%s → 카드 노출 %s', async (_label, roles, permissions, visible) => {
    viewer.roles = roles as string[];
    viewer.permissions = permissions as string[];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(WITH_WAITING)));
    const { wrapper } = setup();

    render(createElement(DashboardPage), { wrapper });
    await waitFor(() => expect(screen.getByRole('heading', { name: '대시보드' })).toBeTruthy());

    expect(screen.queryByText('접수 대기 SR') !== null).toBe(visible);
  });
});
