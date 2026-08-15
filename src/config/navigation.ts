import {
  Bell,
  Building2,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Network,
  Settings,
  Shield,
  User,
  Users,
} from 'lucide-react';

export interface NavSubItem {
  title: string;
  href: string;
  icon?: LucideIcon;
  permission?: { resource: string; action: string };
  role?: string;
  roles?: string[];
}

export interface NavSection {
  title: string;
  items: NavSubItem[];
}

export interface TopNavItem {
  title: string;
  href: string;
  icon?: LucideIcon;
  roles?: string[];
  sections?: NavSection[];
}

export const NAVIGATION_CONFIG: TopNavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    sections: [],
  },
  {
    title: 'SR 관리',
    href: '/srs',
    icon: ClipboardList,
    sections: [
      {
        title: 'SR 관리',
        items: [
          {
            title: '내 요청 SR',
            href: '/my-requests',
            icon: ClipboardList,
          },
          {
            title: 'SR 전체 목록',
            href: '/srs',
            icon: ListChecks,
          },
        ],
      },
    ],
  },
  {
    title: '조직 관리',
    href: '/organization',
    icon: Network,
    // 상위 메뉴의 roles 는 **내부/외부 경계**다. 하위 항목의 permission 과 역할이 다르다:
    // CLIENT_ADMIN 은 CLIENT:READ·USER:READ 를 갖지만(자사 범위) 내부 운영 메뉴에
    // 들어와서는 안 된다. 권한만으로 게이트하면 그 경계가 사라진다.
    // 세부 접근 가능 여부는 하위 항목의 permission 이 판정하고, 하위가 모두 막히면
    // 이 상위 메뉴도 자동으로 감춰진다(canAccessTopNavItem).
    roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
    sections: [
      {
        title: '조직 관리',
        items: [
          {
            title: '조직 구조',
            href: '/organization',
            icon: Network,
            // 조직도는 고객사와 그 소속 사용자를 트리로 보여 준다.
            // 데이터는 GET /api/clients/{id} 로 오므로 CLIENT:READ 가 실제 조건이다.
            permission: { resource: 'CLIENT', action: 'READ' },
          },
          {
            title: '고객사 목록',
            href: '/clients',
            icon: Building2,
            permission: { resource: 'CLIENT', action: 'READ' },
          },
          {
            title: '사용자 목록',
            href: '/users',
            icon: Users,
            // ENGINEER 에게는 USER:READ 가 없다(prisma/seed.ts). 역할로 열어 두었던 동안
            // 메뉴는 보이는데 GET /api/users 는 403 이라, 화면이 빈 목록으로 위장했다.
            permission: { resource: 'USER', action: 'READ' },
          },
        ],
      },
    ],
  },
  {
    title: '권한 관리',
    href: '/roles',
    icon: Shield,
    // 위와 같은 이유로 내부 경계만 여기서 본다. 실제로 역할 카탈로그를 읽을 수 있는지는
    // 하위 '역할 관리' 의 ROLE:READ 가 판정한다 — MANAGER·ENGINEER 는 여기서 걸러진다.
    roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
    sections: [
      {
        title: '권한 관리',
        items: [
          {
            title: '역할 관리',
            href: '/roles',
            icon: Shield,
            // ROLE 리소스 권한은 시드에서 ADMIN 에게만 있다. MANAGER·ENGINEER 는 403 이다.
            permission: { resource: 'ROLE', action: 'READ' },
          },
        ],
      },
    ],
  },
  {
    title: '설정',
    href: '/settings',
    icon: Settings,
    sections: [
      {
        title: '개인 설정',
        items: [
          {
            title: '프로필',
            href: '/settings/profile',
            icon: User,
          },
          {
            title: '알림 설정',
            href: '/settings/notifications',
            icon: Bell,
          },
        ],
      },
      {
        title: '운영',
        items: [
          {
            // 발송 실패한 알림을 확인하고 되살리는 화면(헌법 §4.1).
            // 아웃박스는 실패를 DB 에 남기지만, 보여 주는 곳이 없으면 아무도 확인하지 않는다.
            title: '알림 발송 이력',
            href: '/settings/outbox',
            icon: Bell,
            role: 'ADMIN',
          },
        ],
      },
      /*
      {
        title: '일반 설정',
        items: [
          {
            title: '시스템 설정',
            href: '/settings/system',
            icon: Settings,
            role: 'ADMIN',
          },
        ],
      },
      */
    ],
  },
];

// ============================================================================
// 접근 판정
// ============================================================================

/**
 * 메뉴 표시 판정에 필요한 최소 사용자 정보.
 *
 * `AuthenticatedUser` 를 그대로 받지 않는 이유: Header 는 서버 props 와 클라이언트 세션을
 * 병합한 객체를, Sidebar 는 usePermissions() 의 반환을 쓴다. 둘 다 이 모양이면 충분하고,
 * 무엇보다 **같은 함수로 판정해야** 헤더와 사이드바가 서로 다른 메뉴를 그리지 않는다.
 */
export interface NavViewer {
  roles?: string[];
  permissions?: string[];
}

const hasAnyRoleOf = (viewer: NavViewer | undefined, roles: string[]): boolean =>
  roles.some((role) => viewer?.roles?.includes(role) ?? false);

/**
 * ADMIN 은 권한 검사를 우회한다.
 *
 * 서버 정책이 그렇게 되어 있기 때문이다 — 예: canReadUser 는 `isAdmin || USER:READ`.
 * UI 가 서버보다 엄격하면 관리자에게 자기가 쓸 수 있는 화면이 사라진다. 이 파일의 목적은
 * "UI 가 서버 규칙을 따라 한다" 이므로 우회도 함께 따라 한다.
 */
const hasPermissionOf = (
  viewer: NavViewer | undefined,
  resource: string,
  action: string
): boolean =>
  hasAnyRoleOf(viewer, ['ADMIN']) ||
  (viewer?.permissions?.includes(`${resource}:${action}`.toUpperCase()) ?? false);

/** 하위 메뉴 항목을 볼 수 있는가. role → roles → permission 순으로 판정한다. */
export function canAccessNavSubItem(item: NavSubItem, viewer: NavViewer | undefined): boolean {
  if (item.role) return hasAnyRoleOf(viewer, [item.role]);
  if (item.roles && item.roles.length > 0) return hasAnyRoleOf(viewer, item.roles);
  if (item.permission)
    return hasPermissionOf(viewer, item.permission.resource, item.permission.action);
  return true;
}

/**
 * 상위 메뉴를 볼 수 있는가.
 *
 * 두 조건을 함께 본다:
 *  1. 상위의 roles (내부/외부 경계)
 *  2. **하위 중 하나라도 접근 가능한가** — 이게 없으면 ENGINEER 에게 '권한 관리' 처럼
 *     눌러도 아무 데도 갈 수 없는 빈 껍데기 메뉴가 남는다.
 * 하위가 아예 없는 항목(Dashboard)은 1번만 본다.
 */
export function canAccessTopNavItem(item: TopNavItem, viewer: NavViewer | undefined): boolean {
  if (item.roles && item.roles.length > 0 && !hasAnyRoleOf(viewer, item.roles)) return false;

  const subItems = item.sections?.flatMap((section) => section.items) ?? [];
  if (subItems.length === 0) return true;

  return subItems.some((subItem) => canAccessNavSubItem(subItem, viewer));
}
