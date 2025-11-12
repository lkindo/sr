"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserNav } from "./UserNav";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user?: any;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  // 상단 메뉴 정의
  const topMenuItems = [
    { title: "Dashboard", href: "/dashboard" },
    { title: "SR 관리", href: "/srs" },
    { title: "고객사 관리", href: "/clients" },
    { title: "사용자 관리", href: "/users" },
    { title: "권한 관리", href: "/roles" },
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
    <header className="sticky top-0 z-50 w-full border-b-2 border-[hsl(var(--sr-accent-orange))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-16 items-center">
        {/* 좌측 로고 영역 */}
        <div className="w-64 flex items-center px-6 border-r border-border">
          <Link href="/" className="flex items-center space-x-2 group">
            <span className="font-bold text-xl text-[hsl(var(--sr-primary-dark))] group-hover:text-[hsl(var(--sr-accent-orange))] transition-colors">
              SR Management
            </span>
          </Link>
        </div>

        {/* 메뉴 및 사용자 정보 영역 */}
        <div className="flex-1 flex items-center justify-between px-6">
          <nav className="flex items-center gap-1">
            {topMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "sr-header-nav-item",
                  activeMenu === item.href && "active"
                )}
              >
                {item.title}
              </Link>
            ))}
          </nav>

          <nav className="flex items-center gap-2">
            {user ? (
              <UserNav user={user} />
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">로그인</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">회원가입</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

