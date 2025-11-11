"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  User,
  Bell,
  Shield,
  Tags,
  Users,
  Settings as SettingsIcon,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const menuItems = [
  {
    title: "개인 설정",
    items: [
      {
        title: "프로필",
        href: "/settings/profile",
        icon: User,
      },
      {
        title: "알림 설정",
        href: "/settings/notifications",
        icon: Bell,
      },
    ],
  },
  {
    title: "일반 설정",
    items: [
      {
        title: "역할 및 권한",
        href: "/settings/roles",
        icon: Shield,
      },
      {
        title: "서비스 카테고리",
        href: "/settings/categories",
        icon: Tags,
      },
      {
        title: "사용자 관리",
        href: "/users",
        icon: Users,
      },
      {
        title: "고객사 관리",
        href: "/clients",
        icon: Building2,
      },
      {
        title: "시스템 설정",
        href: "/settings/general",
        icon: SettingsIcon,
      },
    ],
  },
];

function SettingsNav({ isMobile }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<string[]>([
    "개인 설정",
    "시스템 관리",
    "시스템 설정",
  ]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    );
  };

  return (
    <nav className="space-y-2">
      {menuItems.map((section) => (
        <Collapsible
          key={section.title}
          open={openSections.includes(section.title)}
          onOpenChange={() => toggleSection(section.title)}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-left hover:bg-accent rounded-lg transition-colors">
            <span>{section.title}</span>
            {openSections.includes(section.title) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-2 ml-4 text-sm transition-colors hover:bg-accent",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </nav>
  );
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* 모바일 햄버거 메뉴 버튼 */}
      <Button
        variant="outline"
        size="icon"
        className="lg:hidden fixed top-20 left-4 z-40"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* 모바일 사이드바 오버레이 */}
      {mobileMenuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-background border-r z-50 overflow-y-auto">
            <div className="py-6">
              <div className="flex items-center justify-between px-4 mb-6">
                <h2 className="text-lg font-semibold">설정</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  ✕
                </Button>
              </div>
              <SettingsNav isMobile />
            </div>
          </aside>
        </>
      )}

      {/* 데스크톱 사이드바 */}
      <aside className="hidden lg:block w-64 border-r bg-background sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <div className="py-6">
          <h2 className="mb-6 px-4 text-lg font-semibold">설정</h2>
          <SettingsNav />
        </div>
      </aside>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 p-6 lg:p-8 pt-20 lg:pt-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
