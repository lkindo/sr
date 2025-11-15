"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserNav } from "./UserNav";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import type { AuthenticatedUser } from "@/types/session";

interface HeaderProps {
  user?: AuthenticatedUser;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const { hasAnyRole } = usePermissions();

  // 상단 메뉴 정의
  const topMenuItems = [
    { title: "Dashboard", href: "/dashboard" },
    { title: "SR 관리", href: "/srs" },
    { title: "고객사 관리", href: "/clients", roles: ["ADMIN", "MANAGER", "ENGINEER"] },
    { title: "사용자 관리", href: "/users", roles: ["ADMIN", "MANAGER", "ENGINEER"] },
    { title: "권한 관리", href: "/roles", roles: ["ADMIN", "MANAGER", "ENGINEER"] },
    { title: "설정", href: "/settings" },
  ];

  // 현재 활성 메뉴 판단
  const getActiveMenu = () => {
    if (pathname?.startsWith("/srs") || pathname?.startsWith("/my-requests")) return "/srs";
    if (pathname?.startsWith("/clients")) return "/clients";
    if (pathname?.startsWith("/users")) return "/users";
    if (pathname?.startsWith("/roles")) return "/roles";
    if (pathname?.startsWith("/settings")) return "/settings";
    return "/dashboard";
  };

  const activeMenu = getActiveMenu();

  // Dashboard 여부 확인
  const isDashboard = activeMenu === "/dashboard";

  return (
    <header className="sticky top-0 z-50 w-full sr-header-accent bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 min-w-[1280px]">
      <div className="flex h-[104px] items-center">
        {/* 좌측 로고 영역 - Sidebar와 동일한 스타일 */}
        <div className="w-64 flex flex-col items-center justify-center px-6 border-r border-[#3f4564] h-full sr-sidebar-bg text-center">
          <Link href="/dashboard" className="flex flex-col items-center space-y-1 group">
            <span className="font-bold text-lg text-white group-hover:opacity-90 transition-opacity">
              SR Management
            </span>
            <span className="text-xs text-gray-400">서비스 요청 관리</span>
          </Link>
        </div>

        {/* 메뉴 및 사용자 정보 영역 */}
        <div className="flex-1 flex items-center justify-between px-8">
          <nav className="flex items-center gap-1">
            {topMenuItems
              .filter((item) => {
                // roles가 정의된 경우 권한 체크
                if (item.roles && item.roles.length > 0) {
                  return hasAnyRole(item.roles);
                }
                // roles가 없으면 모든 사용자에게 표시
                return true;
              })
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 rounded text-sm transition-colors font-medium",
                    activeMenu === item.href
                      ? "bg-[hsl(var(--sr-primary-dark))] text-white"
                      : "text-[hsl(var(--sr-gray-medium))] hover:text-foreground hover:bg-accent"
                  )}
                >
                  {item.title}
                </Link>
              ))}
          </nav>

          <nav className="flex items-center gap-3">
            {user ? (
              <UserNav user={user} />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="sr-btn-template h-10">
                  <Link href="/login">로그인</Link>
                </Button>
                <Button size="sm" asChild className="sr-btn-template-primary h-10">
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

