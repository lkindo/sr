import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { THEME_STORAGE_KEY } from '@/lib/theme';

import { ThemeToggle } from '../ThemeToggle';

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeToggle', () => {
  it('키보드로 메뉴를 열고 야간을 선택한 뒤 초점을 트리거에 돌려준다', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const trigger = screen.getByRole('button', { name: '화면 모드: 시스템 (주간)' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitemradio', { name: '시스템' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: '주간' })).toHaveFocus());
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAccessibleName('화면 모드: 야간');
    expect(trigger).toHaveAttribute('title', '화면 모드: 야간');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('공용 레이아웃을 단독 렌더해도 오류가 나지 않는다', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: '화면 모드: 시스템 (주간)' })).toBeVisible();
  });
});
