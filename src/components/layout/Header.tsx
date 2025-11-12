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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center">
        {/* 좌측 로고 영역 - 사이드바 너비만큼 */}
        <div className="w-64 flex items-center px-4 border-r border-border/40">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold text-xl">SR Management</span>
          </Link>
        </div>

        {/* 메뉴 및 사용자 정보 영역 */}
        <div className="flex-1 flex items-center justify-between px-4">
          <nav className="flex items-center gap-1 text-sm">
            {topMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 rounded-md transition-colors",
                  activeMenu === item.href
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground hover:bg-accent"
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

