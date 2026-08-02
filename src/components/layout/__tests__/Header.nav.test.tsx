import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '@/types/session';

import { Header } from '../Header';

/**
 * ADMIN 으로 로그인했는데 상단 네비게이션에 '조직 관리'·'권한 관리' 가 안 보이던 버그를 고정한다.
 *
 * 원인은 두 겹이었다.
 *  1) 루트 `layout.tsx` 가 `SessionProvider` 에 초기 세션을 안 넘겨서 클라이언트가 항상
 *     빈 세션으로 시작했다. (`ClientLayout.tsx` 에서 수정)
 *  2) Header 는 서버 props 를 `user` 로 병합해 놓고도, 정작 메뉴 필터는 클라이언트 세션만
 *     보는 `hasAnyRole()` 을 불렀다. 그래서 세션이 도착하기 전에는 서버가 아는 역할을
 *     무시했고, 세션 요청이 실패하면 메뉴가 영영 안 나타났다.
 *
 * 아래 첫 케이스가 (2) 의 회귀 테스트다 — 세션이 없어도 서버 props 만으로 메뉴가 나와야 한다.
 */

const mockSession = vi.hoisted(() => ({ current: { data: null as unknown, status: 'loading' } }));

vi.mock('next-auth/react', () => ({
  useSession: () => mockSession.current,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// UserNav 은 dynamic import + 세션 의존이라 네비게이션 검증과 무관하다.
vi.mock('../UserNav', () => ({
  UserNav: () => <div data-testid="user-nav" />,
}));

vi.mock('../Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

const adminUser = {
  id: 'u1',
  email: 'admin@example.com',
  name: '관리자',
  roles: ['ADMIN'],
  permissions: [],
} as unknown as AuthenticatedUser;

const customerUser = {
  id: 'u2',
  email: 'customer@example.com',
  name: '고객',
  roles: ['CUSTOMER'],
  permissions: [],
} as unknown as AuthenticatedUser;

/** 데스크톱 네비게이션에만 있는 링크를 센다 — 모바일 시트에도 같은 라벨이 들어간다. */
const navLinkNames = () =>
  screen
    .getAllByRole('link')
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

describe('Header 네비게이션 권한 필터', () => {
  it('클라이언트 세션이 아직 없어도 서버가 넘긴 역할로 메뉴를 그린다', () => {
    mockSession.current = { data: null, status: 'loading' };

    render(<Header user={adminUser} />);

    expect(navLinkNames()).toEqual(expect.arrayContaining(['조직 관리', '권한 관리']));
  });

  it('세션 요청이 실패해 unauthenticated 로 떨어져도 서버 역할을 유지한다', () => {
    mockSession.current = { data: null, status: 'unauthenticated' };

    render(<Header user={adminUser} />);

    expect(navLinkNames()).toEqual(expect.arrayContaining(['조직 관리', '권한 관리']));
  });

  it('권한 없는 역할에는 여전히 감춘다', () => {
    mockSession.current = { data: null, status: 'loading' };

    render(<Header user={customerUser} />);

    const names = navLinkNames();
    expect(names).not.toContain('조직 관리');
    expect(names).not.toContain('권한 관리');
  });

  it('클라이언트 세션이 도착하면 그쪽이 우선한다 — 서버 props 가 stale 할 수 있다', () => {
    mockSession.current = { data: { user: customerUser }, status: 'authenticated' };

    render(<Header user={adminUser} />);

    expect(navLinkNames()).not.toContain('조직 관리');
  });
});
