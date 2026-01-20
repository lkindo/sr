import {
  BarChart3,
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
    roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
    sections: [
      {
        title: '조직 관리',
        items: [
          {
            title: '조직 구조',
            href: '/organization',
            icon: Network,
            roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
          },
          {
            title: '고객사 목록',
            href: '/clients',
            icon: Building2,
            roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
          },
          {
            title: '사용자 목록',
            href: '/users',
            icon: Users,
            roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
          },
        ],
      },
    ],
  },
  {
    title: '권한 관리',
    href: '/roles',
    icon: Shield,
    roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
    sections: [
      {
        title: '권한 관리',
        items: [
          {
            title: '역할 관리',
            href: '/roles',
            icon: Shield,
            roles: ['ADMIN', 'MANAGER', 'ENGINEER'],
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
    ],
  },
];
