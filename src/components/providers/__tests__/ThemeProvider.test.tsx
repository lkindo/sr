import { useContext } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_COLORS, THEME_STORAGE_KEY } from '@/lib/theme';

import { ThemeContext, ThemeProvider } from '../ThemeProvider';

function Controls() {
  const { preference, resolvedTheme, setTheme } = useContext(ThemeContext);
  return (
    <>
      <output aria-label="적용 모드">{`${preference}:${resolvedTheme}`}</output>
      <button onClick={() => setTheme('light')}>주간</button>
      <button onClick={() => setTheme('dark')}>야간</button>
      <button onClick={() => setTheme('system')}>시스템</button>
    </>
  );
}

let systemIsDark: boolean;
let listeners: Set<(event: MediaQueryListEvent) => void>;

function changeSystem(dark: boolean) {
  systemIsDark = dark;
  act(() => listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent)));
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  systemIsDark = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemIsDark;
    },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }));
  document.head.innerHTML = '';
  document.documentElement.className = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
});

describe('ThemeProvider', () => {
  it('저장된 선택이 없으면 OS 변경에 즉시 따라간다', () => {
    renderTheme();
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('system:light');
    changeSystem(true);
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('system:dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveClass('light');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark
    );
  });

  it('저장된 주간 선택은 OS 야간 설정 및 후속 변경보다 우선한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    systemIsDark = true;
    renderTheme();
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('light:light');
    changeSystem(false);
    changeSystem(true);
    expect(document.documentElement).toHaveClass('light');
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('light:light');
  });

  it('수동 선택을 저장하고 시스템으로 돌아오면 현재 OS 설정을 적용한다', () => {
    renderTheme();
    fireEvent.click(screen.getByRole('button', { name: '야간' }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByRole('button', { name: '시스템' }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('system:light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLORS.light
    );
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="theme-color"]')).not.toHaveAttribute('media');
  });

  it('저장소 읽기와 쓰기가 차단되어도 현재 탭의 선택은 유지한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    renderTheme();
    fireEvent.click(screen.getByRole('button', { name: '야간' }));
    changeSystem(false);
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('dark:dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('잘못된 저장값은 시스템 모드로 복구한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'invalid');
    systemIsDark = true;
    renderTheme();
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('system:dark');
  });

  it('다른 탭의 선택 및 저장소 비우기를 반영한다', () => {
    renderTheme();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' })
      );
    });
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('dark:dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(screen.getByLabelText('적용 모드')).toHaveTextContent('system:light');
  });

  it('해제 시 OS 설정 구독을 정리한다', () => {
    const { unmount } = renderTheme();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
