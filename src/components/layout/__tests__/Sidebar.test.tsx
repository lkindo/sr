import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

/**
 * Sidebar 는 역할·권한으로 메뉴를 깎는 게이트다. Header 쪽은 `Header.nav.test.tsx` 가
 * 덮고 있었지만 Sidebar 는 한 번도 렌더되지 않아, 두 컴포넌트가 **같은 판정 함수**를
 * 쓰기로 한 약속(`canAccessNavSubItem` / `canAccessTopNavItem`)이 실제로 지켜지는지
 * 확인할 방법이 없었다.
 *
 * 여기서는 세션(역할 + 권한 문자열)만 갈아 끼우고 실제 `usePermissions` 를 태운다.
 * 권한 목록은 `prisma/seed.ts` 의 역할별 부여를 그대로 옮긴 것이라, 시드가 바뀌어
 * 메뉴가 달라지면 여기 기대값과 어긋나야 한다.
 */

const pathnameMock = vi.hoisted(() => vi.fn<() => string | null>(() => '/dashboard'));

vi.mock('next/navigation', () => ({
  usePathname: pathnameMock,
}));

const sessionMock = vi.hoisted(() => ({ current: { data: null as unknown } }));

vi.mock('next-auth/react', () => ({
  useSession: () => sessionMock.current,
}));

type Role = 'ADMIN' | 'MANAGER' | 'ENGINEER' | 'CLIENT_ADMIN' | 'CLIENT_USER';

/**
 * 시드(prisma/seed.ts)에서 메뉴 판정에 실제로 쓰이는 권한만 추린 것.
 * ADMIN 은 목록이 비어 있어도 통과해야 한다 — `hasPermissionOf` 가 ADMIN 을 우회시키기
 * 때문이고, 그 우회가 사라지면 아래 ADMIN 케이스가 먼저 깨진다.
 */
const SEEDED_PERMISSIONS: Record<Role, string[]> = {
  ADMIN: [],
  MANAGER: ['SR:READ', 'CLIENT:READ', 'CLIENT:UPDATE', 'USER:READ', 'USER:UPDATE'],
  ENGINEER: ['SR:READ', 'CLIENT:READ', 'USER:UPDATE_SELF'],
  CLIENT_ADMIN: ['SR:READ', 'CLIENT:READ', 'USER:READ'],
  CLIENT_USER: ['SR:READ', 'USER:UPDATE_SELF'],
};

const signIn = (role: Role) => {
  sessionMock.current = {
    data: { user: { roles: [role], permissions: SEEDED_PERMISSIONS[role] } },
  };
};

const signOut = () => {
  sessionMock.current = { data: null };
};

/** 렌더된 링크의 라벨. 접혀 있는 Collapsible 안의 링크는 DOM 에 없으므로 잡히지 않는다. */
const linkNames = () =>
  screen
    .queryAllByRole('link')
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

const asideOf = (container: HTMLElement) => container.querySelector('aside');

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard');
  signOut();
});

describe('Sidebar - 사이드바 자체를 그리지 않는 경우', () => {
  it.each<[string | null, string]>([
    ['/dashboard', 'Dashboard 경로'],
    ['/', '알 수 없는 경로는 Dashboard 로 떨어진다'],
    [null, 'pathname 이 아직 없을 때도 Dashboard 로 본다'],
  ])('pathname=%s 이면 렌더하지 않는다 (%s)', (pathname) => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue(pathname);

    const { container } = render(<Sidebar />);

    expect(asideOf(container)).toBeNull();
  });

  it('Dashboard 경로여도 showAllSections 면 그린다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/dashboard');

    const { container } = render(<Sidebar showAllSections />);

    expect(asideOf(container)).not.toBeNull();
    expect(linkNames()).toContain('Dashboard');
  });

  it('pathname 이 null 이어도 showAllSections 면 그린다 — 섹션은 전부 접힌다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue(null);

    render(<Sidebar showAllSections />);

    // 상위 링크는 나오지만, getDefaultOpen 이 pathname 을 못 읽어 하위는 닫혀 있다.
    expect(linkNames()).toContain('설정');
    expect(linkNames()).not.toContain('프로필');
  });
});

describe('Sidebar - showAllSections: 역할별 상위 메뉴', () => {
  /**
   * pathname 을 '/dashboard' 로 두면 어떤 섹션도 기본 열림이 아니라서,
   * 잡히는 링크가 정확히 "상위 메뉴" 뿐이다.
   */
  it.each<[Role, string[]]>([
    ['ADMIN', ['Dashboard', 'SR 관리', '조직 관리', '권한 관리', '설정']],
    ['MANAGER', ['Dashboard', 'SR 관리', '조직 관리', '설정']],
    ['ENGINEER', ['Dashboard', 'SR 관리', '조직 관리', '설정']],
    ['CLIENT_ADMIN', ['Dashboard', 'SR 관리', '설정']],
    ['CLIENT_USER', ['Dashboard', 'SR 관리', '설정']],
  ])('%s 의 상위 메뉴', (role, expected) => {
    signIn(role);
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    expect(linkNames()).toEqual(expected);
  });

  it('MANAGER 는 ROLE:READ 가 없어 권한 관리가 통째로 사라진다', () => {
    signIn('MANAGER');
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    // 상위 링크뿐 아니라 섹션 제목(Collapsible 트리거)도 남으면 안 된다 —
    // 눌러도 갈 곳이 없는 빈 껍데기가 되기 때문이다.
    expect(linkNames()).not.toContain('권한 관리');
    expect(screen.queryByRole('button', { name: /권한 관리/ })).toBeNull();
  });

  it('세션이 없으면 역할·권한이 빈 배열이라 공개 메뉴만 남는다', () => {
    signOut();
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    expect(linkNames()).toEqual(['Dashboard', 'SR 관리', '설정']);
  });

  it('하위 섹션이 없는 Dashboard 는 상위 링크만 남기고 Collapsible 을 만들지 않는다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    // 섹션 트리거는 하위 섹션이 있는 상위 메뉴에서만 나온다.
    const triggers = screen.getAllByRole('button').map((el) => el.textContent?.trim());
    expect(triggers).not.toContain('Dashboard');
    expect(triggers).toEqual(
      expect.arrayContaining(['SR 관리', '조직 관리', '권한 관리', '개인 설정'])
    );
  });

  it('활성 상위 메뉴에만 강조 스타일이 붙는다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    expect(screen.getByRole('link', { name: 'Dashboard' }).className).toContain('border-accent');
    expect(screen.getByRole('link', { name: '설정' }).className).toContain('text-muted-foreground');
    expect(screen.getByRole('link', { name: '설정' }).className).not.toContain('border-accent');
  });

  it('접힌 섹션은 열면 하위 메뉴가 나타난다', async () => {
    const user = userEvent.setup();
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/dashboard');

    render(<Sidebar showAllSections />);

    expect(screen.queryByRole('link', { name: '프로필' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /개인 설정/ }));

    expect(screen.getByRole('link', { name: '프로필' })).toBeInTheDocument();
  });
});

describe('Sidebar - 데스크톱 모드: 조직 관리 하위 메뉴', () => {
  it.each<[Role, string[]]>([
    ['ADMIN', ['조직 구조', '고객사 목록', '사용자 목록']],
    ['MANAGER', ['조직 구조', '고객사 목록', '사용자 목록']],
    // ENGINEER 에게는 USER:READ 가 없다 — 메뉴는 보이는데 API 는 403 이던 상태를 막는다.
    ['ENGINEER', ['조직 구조', '고객사 목록']],
  ])('%s 가 /organization 에서 보는 하위 메뉴', (role, expected) => {
    signIn(role);
    pathnameMock.mockReturnValue('/organization');

    render(<Sidebar />);

    expect(linkNames()).toEqual(expected);
  });

  it('CLIENT_USER 는 볼 항목이 하나도 없어 섹션 자체가 사라진다', () => {
    signIn('CLIENT_USER');
    pathnameMock.mockReturnValue('/organization');

    const { container } = render(<Sidebar />);

    expect(linkNames()).toEqual([]);
    // 섹션이 필터로 떨어졌으므로 제목(트리거)도 남지 않는다.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(asideOf(container)).not.toBeNull();
  });

  /**
   * 데스크톱 분기의 상위 메뉴 경계 회귀 테스트.
   *
   * CLIENT_ADMIN 은 시드에서 CLIENT:READ·USER:READ 를 받는다. 그래서 하위 항목의
   * permission 만 보던 시절에는 이 세 URL 로 **직접 진입**하면 내부 운영용 '조직 관리'
   * 하위 메뉴가 그대로 그려졌다 — Header 는 같은 사용자에게 그 상위 메뉴를 감추는데도.
   * 상위 roles(['ADMIN','MANAGER','ENGINEER'])가 다시 판정에 들어오면 여기서 걸린다.
   */
  it.each<string>(['/organization', '/clients', '/users'])(
    'CLIENT_ADMIN 은 %s 로 직접 들어와도 상위 roles 경계에 막혀 내부 메뉴를 못 본다',
    (pathname) => {
      signIn('CLIENT_ADMIN');
      pathnameMock.mockReturnValue(pathname);

      const { container } = render(<Sidebar />);

      // CLIENT:READ·USER:READ 를 갖고 있어도 하위 링크가 하나도 나오면 안 된다.
      expect(linkNames()).toEqual([]);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      // 껍데기 <aside> 자체는 남는다 — 렌더 여부는 pathname 만으로 정해진다.
      expect(asideOf(container)).not.toBeNull();
    }
  );

  it('CLIENT_ADMIN 은 /roles 에서도 권한 관리 섹션을 못 본다', () => {
    signIn('CLIENT_ADMIN');
    pathnameMock.mockReturnValue('/roles');

    render(<Sidebar />);

    expect(linkNames()).toEqual([]);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  /**
   * 반대 방향 가드: 상위 경계를 되살리면서 정상 내부 사용자의 메뉴까지 지우면 안 된다.
   * 위 it.each 가 ADMIN/MANAGER/ENGINEER 를 이미 덮지만, /clients·/users 로 직접
   * 진입하는 경로는 이 케이스가 잠근다.
   */
  it.each<[Role, string]>([
    ['ADMIN', '/clients'],
    ['MANAGER', '/users'],
    ['ENGINEER', '/clients'],
  ])('%s 는 %s 직접 진입에서도 조직 관리 섹션을 계속 본다', (role, pathname) => {
    signIn(role);
    pathnameMock.mockReturnValue(pathname);

    render(<Sidebar />);

    expect(linkNames()).toContain('조직 구조');
    expect(screen.getByRole('button', { name: /조직 관리/ })).toBeInTheDocument();
  });
});

describe('Sidebar - 데스크톱 모드: 나머지 상위 메뉴', () => {
  it.each<Role>(['ADMIN', 'MANAGER', 'ENGINEER', 'CLIENT_ADMIN', 'CLIENT_USER'])(
    'SR 관리는 %s 에게 조건 없이 열려 있다',
    (role) => {
      signIn(role);
      pathnameMock.mockReturnValue('/srs');

      render(<Sidebar />);

      expect(linkNames()).toEqual(['내 요청 SR', 'SR 전체 목록']);
    }
  );

  it('ADMIN 은 /roles 에서 역할 관리를 본다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/roles');

    render(<Sidebar />);

    expect(linkNames()).toEqual(['역할 관리']);
  });

  it.each<Role>(['MANAGER', 'ENGINEER'])('%s 는 /roles 에서도 역할 관리를 못 본다', (role) => {
    signIn(role);
    pathnameMock.mockReturnValue('/roles');

    render(<Sidebar />);

    expect(linkNames()).toEqual([]);
  });

  it.each<[string, string[]]>([
    ['/clients', ['조직 구조', '고객사 목록', '사용자 목록']],
    ['/users', ['조직 구조', '고객사 목록', '사용자 목록']],
    ['/my-requests', ['내 요청 SR', 'SR 전체 목록']],
    ['/settings/profile', ['프로필', '알림 설정']],
  ])('pathname=%s 는 해당 상위 메뉴의 섹션을 연다', (pathname, expected) => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue(pathname);

    render(<Sidebar />);

    expect(linkNames()).toEqual(expected);
  });
});

describe('Sidebar - 활성 하위 메뉴 표시', () => {
  const activeLinkNames = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('a'))
      .filter((el) => el.className.includes('font-semibold'))
      .map((el) => el.textContent?.trim());

  it('경로가 정확히 일치하면 활성이다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/srs');

    const { container } = render(<Sidebar />);

    expect(activeLinkNames(container)).toEqual(['SR 전체 목록']);
    // 활성 항목에만 점 표시가 붙는다.
    expect(container.querySelectorAll('span.bg-accent')).toHaveLength(1);
  });

  it('하위 경로(/srs/{id})도 활성으로 본다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/srs/sr-1');

    const { container } = render(<Sidebar />);

    expect(activeLinkNames(container)).toEqual(['SR 전체 목록']);
  });

  it('접두사가 겹치기만 하는 경로는 활성이 아니다', () => {
    signIn('ADMIN');
    // '/settings/notifications' 는 '/settings/profile' 로 시작하지 않는다.
    pathnameMock.mockReturnValue('/settings/notifications');

    const { container } = render(<Sidebar />);

    expect(activeLinkNames(container)).toEqual(['알림 설정']);
    expect(container.querySelectorAll('span.bg-accent')).toHaveLength(1);
  });

  it('활성 항목이 하나도 없을 수도 있다', () => {
    signIn('ADMIN');
    // /organization 섹션은 열리지만 '/clients-archive' 와 정확히 맞는 항목은 없다.
    pathnameMock.mockReturnValue('/clients-archive');

    const { container } = render(<Sidebar />);

    expect(activeLinkNames(container)).toEqual([]);
    expect(container.querySelectorAll('span.bg-accent')).toHaveLength(0);
  });
});

describe('Sidebar - isMobile 레이아웃 분기', () => {
  it('기본값(false)에서는 고정 사이드바 클래스를 붙인다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/srs');

    const { container } = render(<Sidebar />);

    expect(asideOf(container)?.className).toContain('fixed');
    expect(asideOf(container)?.className).toContain('md:block');
  });

  it('isMobile 이면 고정 클래스를 빼고 시트 안에 맞춘다', () => {
    signIn('ADMIN');
    pathnameMock.mockReturnValue('/srs');

    const { container } = render(<Sidebar isMobile />);

    expect(asideOf(container)?.className).not.toContain('fixed');
    expect(asideOf(container)?.className).not.toContain('md:block');
    expect(asideOf(container)?.className).toContain('w-full');
  });
});
