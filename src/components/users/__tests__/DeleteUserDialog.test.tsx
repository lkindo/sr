import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 사용자 삭제 다이얼로그 — 일괄 처리(2026-09-18 소유자 결정 D12).
 *
 * 예전에는 목록의 일괄 삭제가 선택한 사람 중 첫 1명만 넘겨 나머지가 조용히 남았다. 이제 전원을 차례로 처리하고,
 * 한 명이 거부돼도(이력이 있는 계정 등) 나머지를 처리한 뒤 결과를 요약한다.
 */

const mocks = vi.hoisted(() => ({ apiDelete: vi.fn(), toast: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiDelete: mocks.apiDelete }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { DeleteUserDialog } from '../DeleteUserDialog';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const inactive = [
  { id: 'u-1', name: '김일', isActive: false },
  { id: 'u-2', name: '이이', isActive: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiDelete.mockResolvedValue({});
});

describe('DeleteUserDialog — 일괄 처리', () => {
  it('선택한 전원을 영구 삭제하고 건수로 알린다', async () => {
    const onDeleted = vi.fn();
    render(
      <DeleteUserDialog
        open
        onOpenChange={vi.fn()}
        user={null}
        users={inactive}
        onDeleted={onDeleted}
      />,
      { wrapper }
    );

    expect(screen.getByText('선택한 2명')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '영구 삭제' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.apiDelete.mock.calls.map(([url]) => url)).toEqual([
      '/api/users/u-1?hard=true',
      '/api/users/u-2?hard=true',
    ]);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: '성공',
      description: '2명을 영구 삭제했습니다.',
    });
    expect(onDeleted).toHaveBeenCalled();
  });

  it('한 명이 거부돼도 나머지를 처리하고 실패를 이유와 함께 알린다', async () => {
    mocks.apiDelete
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('관리 이력이 있어 완전히 삭제할 수 없습니다.'));
    render(
      <DeleteUserDialog
        open
        onOpenChange={vi.fn()}
        user={null}
        users={inactive}
        onDeleted={vi.fn()}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByRole('button', { name: '영구 삭제' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.apiDelete).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenCalledWith({
      title: '일부 실패',
      description: '1명 영구 삭제, 1명 실패 — 이이: 관리 이력이 있어 완전히 삭제할 수 없습니다.',
      variant: 'destructive',
    });
  });

  it('단일 비활성화는 되돌릴 수 있다고 안내한다(예전 문구는 "되돌릴 수 없다" 였다)', () => {
    render(
      <DeleteUserDialog
        open
        onOpenChange={vi.fn()}
        user={{ id: 'u-3', name: '박삼', isActive: true }}
        onDeleted={vi.fn()}
      />,
      { wrapper }
    );

    expect(screen.getByText(/나중에 다시 활성화할 수 있습니다/)).toBeInTheDocument();
  });
});
