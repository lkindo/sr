import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientUsersSheet } from '../ClientUsersSheet';

/**
 * 고객사 소속 사용자 시트.
 *
 * 이 컴포넌트가 지켜야 하는 계약은 렌더가 아니라 **언제 조회하는가** 다:
 *
 *   1. 시트가 닫혀 있으면 조회하지 않는다(예전 `open && clientId` 가드).
 *      이 가드는 React Query 로 옮기면서 `enabled` 로 이동했는데, 그 이동이 잘못되면
 *      목록 화면에서 고객사 수만큼의 요청이 조용히 나간다.
 *   2. 닫았다 다시 열면 **다시 조회한다.** 전역 staleTime 이 60초라 쿼리별로 0 을 주지
 *      않으면 그 사이에 바뀐 소속 사용자가 반영되지 않은 목록을 보게 된다.
 *   3. 실패는 서버 메시지가 아니라 **고정 문구** 토스트다(기존 catch 의 계약).
 */

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

// Radix 의 Sheet 는 포털·포인터 이벤트를 요구해서 jsdom 에서 그대로 쓰면 테스트가
// 라이브러리 구현에 묶인다. 여기서 볼 것은 조회 시점이지 Radix 의 렌더가 아니다.
vi.mock('@/components/ui', async () => {
  const { uiMock } = await import('@/__tests__/mocks/ui-primitives');
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ...uiMock(),
    Sheet: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
      open ? <div>{children}</div> : null,
    SheetContent: passthrough,
    SheetHeader: passthrough,
    SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
    TableHeader: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
    TableBody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
    TableRow: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
    TableHead: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
    TableCell: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
  };
});

const CLIENT_WITH_USERS = {
  id: 'cl-1',
  name: '테스트 고객사',
  // ⚠️ `/api/clients/[id]` 는 목록 봉투 없이 bare object 를 준다(예외 라우트).
  users: [
    {
      user: {
        id: 'u-1',
        name: '김사용',
        email: 'kim@example.com',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        roles: [{ role: { id: 'r-1', name: 'USER' } }],
      },
    },
  ],
};

/** api-client 를 실제로 통과시키기 위해 fetch 만 목킹한다. */
const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
});

const errorResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: '서버가 준 메시지' }),
});

function setup() {
  // retry:false, gcTime:0 이 없으면 실패 케이스가 재시도로 타임아웃난다.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const baseProps = {
  onOpenChange: vi.fn(),
  clientId: 'cl-1',
  clientName: '테스트 고객사',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClientUsersSheet — 조회 시점', () => {
  it('닫혀 있으면 조회하지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(<ClientUsersSheet {...baseProps} open={false} />, { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clientId 가 없으면 조회하지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(<ClientUsersSheet {...baseProps} open clientId={null} />, { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('열리면 해당 고객사 상세를 조회하고 소속 사용자를 그린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(CLIENT_WITH_USERS));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(<ClientUsersSheet {...baseProps} open />, { wrapper });

    expect(await screen.findByText('김사용')).toBeInTheDocument();
    expect(screen.getByText('kim@example.com')).toBeInTheDocument();
    expect(screen.getByText('USER')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/clients/cl-1');
  });

  it('닫았다 다시 열면 재조회한다 (staleTime 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(CLIENT_WITH_USERS));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    const { rerender } = render(<ClientUsersSheet {...baseProps} open />, { wrapper });
    await screen.findByText('김사용');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(<ClientUsersSheet {...baseProps} open={false} />);
    rerender(<ClientUsersSheet {...baseProps} open />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('ClientUsersSheet — 실패', () => {
  it('조회에 실패하면 고정 문구로 destructive 토스트를 띄운다', async () => {
    // 404 는 4xx 라 retryUnlessClientError 가 재시도하지 않는다.
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = setup();

    render(<ClientUsersSheet {...baseProps} open />, { wrapper });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '사용자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );
    // 서버가 준 메시지를 그대로 노출하지 않는 것이 기존 계약이다.
    expect(toast).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('등록된 사용자가 없습니다.')).toBeInTheDocument();
  });
});
