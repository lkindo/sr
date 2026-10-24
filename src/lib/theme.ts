export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sr-theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const THEME_META_ID = 'app-theme-color';

// 브라우저 UI의 색. globals.css의 --background와 함께 유지한다.
export const THEME_COLORS = { light: '#f8fafc', dark: '#0c111d' } as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function applyTheme(theme: ResolvedTheme, preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
  // React/Next metadata는 hydration·경로 이동 때 content로 노드를 찾아 재생성한다.
  // bootstrap과 이 함수만 관리하는 단일 meta를 써서 명시 선택이 덮이지 않게 한다.
  let meta = document.querySelector<HTMLMetaElement>(`meta#${THEME_META_ID}`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.id = THEME_META_ID;
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
}

// 사용자 입력 없이 고정 상수로만 구성한다. head에서 동기 실행해 첫 paint 전에 저장된 모드를 적용한다.
// localStorage 차단은 테마 적용 자체를 막지 않도록 별도로 처리한다.
export const THEME_INIT_SCRIPT = `(function(){
  var preference='system';
  try{var saved=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(saved==='light'||saved==='dark'||saved==='system')preference=saved;}catch(e){}
  var theme=preference==='system'?(window.matchMedia&&window.matchMedia(${JSON.stringify(THEME_MEDIA_QUERY)}).matches?'dark':'light'):preference;
  var root=document.documentElement;
  root.classList.toggle('dark',theme==='dark');
  root.classList.toggle('light',theme==='light');
  root.dataset.theme=theme;
  root.dataset.themePreference=preference;
  root.style.colorScheme=theme;
  var meta=document.getElementById(${JSON.stringify(THEME_META_ID)});
  if(!meta){meta=document.createElement('meta');meta.id=${JSON.stringify(THEME_META_ID)};meta.name='theme-color';document.head.appendChild(meta);}
  meta.content=theme==='dark'?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};
})();`;
