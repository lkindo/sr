import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_COLORS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '../theme';

function runBootstrap(systemIsDark = false) {
  runInNewContext(THEME_INIT_SCRIPT, {
    document,
    window: { matchMedia: () => ({ matches: systemIsDark }) },
    localStorage: window.localStorage,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
});

describe('첫 화면 테마 스크립트', () => {
  it('React 실행 전에 저장된 야간 선택과 브라우저 색을 적용한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootstrap(false);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.themePreference).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark
    );
  });

  it('저장된 주간 선택은 OS 야간보다 우선한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runBootstrap(true);
    expect(document.documentElement).toHaveClass('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('저장소 차단 시에도 OS 야간을 첫 화면에 적용한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    runBootstrap(true);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.themePreference).toBe('system');
  });

  it('잘못된 저장값을 DOM 클래스에 넣지 않는다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    runBootstrap(false);
    expect(document.documentElement.className).toBe('light');
  });

  it('초기화가 반복되어도 OS와 무관하게 적용되는 브라우저 색 meta 하나를 유지한다', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootstrap(false);
    const meta = document.querySelector('meta[name="theme-color"]');
    runBootstrap(false);
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="theme-color"]')).toBe(meta);
    expect(meta).not.toHaveAttribute('media');
    expect(meta).toHaveAttribute('content', THEME_COLORS.dark);
  });
});
