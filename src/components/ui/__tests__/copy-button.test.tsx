import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), writeText: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { CopyButton } from '../copy-button';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(() => vi.useRealTimers());

describe('CopyButton', () => {
  it('클립보드 쓰기가 완료되면 성공 안내를 표시하고 클릭 버블링을 막는다', async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CopyButton value="SR-2026-001" message="번호 복사 완료" />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: '복사' }));

    expect(mocks.writeText).toHaveBeenCalledWith('SR-2026-001');
    expect(parentClick).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({ description: '번호 복사 완료' });
      expect(screen.getByRole('button', { name: '복사됨' })).toBeInTheDocument();
    });
  });

  it('2초 뒤 기본 라벨로 돌아간다', async () => {
    vi.useFakeTimers();
    render(<CopyButton value="값" />);

    fireEvent.click(screen.getByRole('button', { name: '복사' }));

    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: '복사됨' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument();
  });

  it('클립보드 쓰기가 거절되면 성공 상태로 바꾸지 않고 오류를 안내한다', async () => {
    mocks.writeText.mockRejectedValueOnce(new Error('permission denied'));
    render(<CopyButton value="값" />);

    fireEvent.click(screen.getByRole('button', { name: '복사' }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        description: '클립보드에 복사하지 못했습니다.',
        variant: 'destructive',
      })
    );
    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument();
  });
});
