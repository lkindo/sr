'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';

import {
  applyTheme,
  isThemePreference,
  type ResolvedTheme,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

type ThemeState = { preference: ThemePreference; resolvedTheme: ResolvedTheme };
type ThemeContextValue = ThemeState & { setTheme: (preference: ThemePreference) => void };

const initialState: ThemeState = { preference: 'system', resolvedTheme: 'light' };
export const ThemeContext = createContext<ThemeContextValue>({
  ...initialState,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 서버와 첫 클라이언트 렌더를 같게 유지한다. 실제 캔버스는 head 스크립트가 먼저 칠한다.
  const [state, setState] = useState<ThemeState>(initialState);
  const preferenceRef = useRef<ThemePreference>('system');

  const updateTheme = useCallback((preference: ThemePreference, systemIsDark: boolean) => {
    const resolvedTheme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;
    preferenceRef.current = preference;
    applyTheme(resolvedTheme, preference);
    setState({ preference, resolvedTheme });
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.(THEME_MEDIA_QUERY);
    let preference: ThemePreference = 'system';
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(saved)) preference = saved;
    } catch {
      // 저장소가 막혀도 시스템 모드와 현재 탭의 수동 선택은 쓸 수 있다.
    }
    updateTheme(preference, media?.matches ?? false);

    const onSystemChange = (event: MediaQueryListEvent) => {
      if (preferenceRef.current === 'system') updateTheme('system', event.matches);
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      updateTheme(
        isThemePreference(event.newValue) ? event.newValue : 'system',
        media?.matches ?? false
      );
    };

    media?.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      media?.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [updateTheme]);

  const setTheme = useCallback(
    (preference: ThemePreference) => {
      updateTheme(preference, window.matchMedia?.(THEME_MEDIA_QUERY).matches ?? false);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // 현재 화면에는 즉시 적용하고, 저장 불가 때문에 선택을 되돌리지 않는다.
      }
    },
    [updateTheme]
  );

  return <ThemeContext.Provider value={{ ...state, setTheme }}>{children}</ThemeContext.Provider>;
}
