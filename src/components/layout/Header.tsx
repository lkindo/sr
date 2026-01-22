'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Menu } from 'lucide-react';

// Removed unused SheetPrimitive import
import { Sidebar } from '@/components/layout/Sidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { NAVIGATION_CONFIG } from '@/config/navigation';
import { cn } from '@/lib/utils';

const UserNav = dynamic(() => import('./UserNav').then((mod) => mod.UserNav), {
  ssr: false,
  loading: () => <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />,
});
import { usePermissions } from '@/hooks/use-permissions';
import type { AuthenticatedUser } from '@/types/session';

interface HeaderProps {
  user?: AuthenticatedUser;
}

export function Header({ user: initialUser }: HeaderProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const { hasAnyRole } = usePermissions();

  // 경로 변경 시 모바일 메뉴 자동 닫기
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // 서버 props로 받은 유저 정보와 클라이언트 세션 정보 병합
  // PWA 등에서 서버 props가 stale할 경우 클라이언트 세션이 우선임
  const user = status === 'authenticated' ? (session.user as AuthenticatedUser) : initialUser;
  const isLoading = status === 'loading';

  // 현재 활성 메뉴 판단
  const getActiveMenu = () => {
    if (pathname?.startsWith('/srs') || pathname?.startsWith('/my-requests')) return '/srs';
    if (
      pathname?.startsWith('/organization') ||
      pathname?.startsWith('/clients') ||
      pathname?.startsWith('/users')
    )
      return '/organization';
    if (pathname?.startsWith('/roles')) return '/roles';
    if (pathname?.startsWith('/settings')) return '/settings';
    return '/dashboard';
  };

  const activeMenu = getActiveMenu();

  return (
    <header className="sticky top-0 z-50 w-full sr-header-accent bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 md:h-[104px] items-center">
        {/* 모바일 햄버거 메뉴 (md 미만 표시) */}
        <div className="flex md:hidden items-center px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">메뉴 열기</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-64 bg-[hsl(var(--sr-primary-dark))] border-r-[#3f4564]"
            >
              {/* Visual Header */}
              <div className="p-6 text-center border-b border-[#3f4564]">
                <span className="text-white text-lg font-bold">SR Management</span>
              </div>
              <SheetDescription className="sr-only">Mobile navigation sidebar</SheetDescription>
              {/* 사이드바 내용을 모바일에서도 재사용 (모바일용은 fixed 제거 필요할 수 있음) */}
              <div className="h-full overflow-y-auto pb-20">
                <MobileSidebarContent />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* 데스크톱 로고 영역 (md 이상 표시) */}
        <div className="hidden md:flex w-64 flex-col items-center justify-center px-6 border-r border-[#3f4564] h-full sr-sidebar-bg text-center">
          <Link href="/dashboard" className="flex flex-col items-center space-y-1 group">
            <span className="font-bold text-lg text-white group-hover:opacity-90 transition-opacity">
              SR Management
            </span>
            <span className="text-xs text-gray-400">서비스 요청 관리</span>
          </Link>
        </div>

        {/* 모바일 로고 (md 미만 중앙 표시) */}
        <div className="flex md:hidden flex-1 justify-center">
          <Link
            href="/dashboard"
            className="font-bold text-base text-[hsl(var(--sr-primary-dark))]"
          >
            SR Management
          </Link>
        </div>

        {/* 메뉴 및 사용자 정보 영역 */}
        <div className="flex items-center justify-end md:justify-between px-4 md:px-8 flex-1 md:flex-[1]">
          <nav className="hidden md:flex items-center gap-1">
            {NAVIGATION_CONFIG.filter((item) => {
              if (item.roles && item.roles.length > 0) {
                return hasAnyRole(item.roles);
              }
              return true;
            }).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-4 py-2 rounded text-sm transition-colors font-medium',
                  activeMenu === item.href
                    ? 'bg-[hsl(var(--sr-primary-dark))] text-white'
                    : 'text-[hsl(var(--sr-gray-medium))] hover:text-foreground hover:bg-accent'
                )}
              >
                {item.title}
              </Link>
            ))}
          </nav>

          <nav className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            ) : user ? (
              <UserNav user={user} />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="sr-btn-template h-9 md:h-10">
                  <Link href="/login">로그인</Link>
                </Button>
                <Button size="sm" asChild className="sr-btn-template-primary h-9 md:h-10">
                  <Link href="/register">회원가입</Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

// 모바일용 사이드바 콘텐츠 컴포넌트
function MobileSidebarContent() {
  return <Sidebar isMobile showAllSections />;
}
