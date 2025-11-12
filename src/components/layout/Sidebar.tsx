"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Inbox,
  ListChecks,
  Building2,
  Users,
  Shield,
  User,
  Bell,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SubMenuItem {
  title: string;
  href: string;
  icon?: any;
  permission?: { resource: string; action: string };
  role?: string;
  roles?: string[];
}

interface MenuSection {
  title: string;
  items: SubMenuItem[];
}

// 각 상단 메뉴별 하위 메뉴 정의
const menuStructure: Record<string, MenuSection[]> = {
  "/dashboard": [],
  "/srs": [
    {
      title: "SR 관리",
      items: [
        {
          title: "내 요청 SR",
          href: "/my-requests",
          icon: ClipboardList,
        },
        {
          title: "SR 접수 대기",
          href: "/srs/intake-queue",
          icon: Inbox,
          roles: ["ADMIN", "ENGINEER", "MANAGER"],
        },
        {
          title: "SR 전체 목록",
          href: "/srs",
          icon: ListChecks,
          permission: { resource: "SR", action: "READ" },
        },
      ],
    },
  ],
  "/clients": [
    {
      title: "고객사 관리",
      items: [
        {
          title: "고객사 목록",
          href: "/clients",
          icon: Building2,
          permission: { resource: "CLIENT", action: "READ" },
        },
      ],
    },
  ],
  "/users": [
    {
      title: "사용자 관리",
      items: [
        {
          title: "사용자 목록",
          href: "/users",
          icon: Users,
          roles: ["ADMIN", "MANAGER"],
        },
      ],
    },
  ],
  "/roles": [
    {
      title: "권한 관리",
      items: [
        {
          title: "역할 관리",
          href: "/roles",
          icon: Shield,
          role: "ADMIN",
        },
      ],
    },
  ],
  "/settings": [
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
          title: "시스템 설정",
          href: "/settings/system",
          icon: SettingsIcon,
          role: "ADMIN",
        },
      ],
    },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, hasRole, hasAnyRole } = usePermissions();

  // 현재 활성 메뉴 판단
  const getActiveTopMenu = () => {
    if (pathname?.startsWith("/srs") || pathname?.startsWith("/my-requests")) return "/srs";
    if (pathname?.startsWith("/clients")) return "/clients";
    if (pathname?.startsWith("/users")) return "/users";
    if (pathname?.startsWith("/roles")) return "/roles";
    if (pathname?.startsWith("/settings")) return "/settings";
    return "/dashboard";
  };

  const activeTopMenu = getActiveTopMenu();
  const sections = menuStructure[activeTopMenu] || [];

  const canAccessItem = (item: SubMenuItem): boolean => {
    if (item.role) {
      return hasRole(item.role);
    }
    if (item.roles && item.roles.length > 0) {
      return hasAnyRole(item.roles);
    }
    if (item.permission) {
      return hasPermission(item.permission.resource, item.permission.action);
    }
    return true;
  };

  // 섹션별 기본 열림 상태 (활성 메뉴가 있는 섹션은 열림)
  const getDefaultOpen = (section: MenuSection) => {
    return section.items.some(item => pathname?.startsWith(item.href));
  };

  // Dashboard는 하위 메뉴가 없으므로 사이드바를 표시하지 않음
  if (activeTopMenu === "/dashboard") {
    return null;
  }

  return (
    <aside className="fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] w-64 border-r border-border bg-background overflow-y-auto">
      <nav className="flex flex-col p-4 space-y-2">
        <div className="px-3 py-2">
          <h2 className="text-lg font-semibold">
            {activeTopMenu === "/srs" && "SR 관리"}
            {activeTopMenu === "/clients" && "고객사 관리"}
            {activeTopMenu === "/users" && "사용자 관리"}
            {activeTopMenu === "/roles" && "권한 관리"}
            {activeTopMenu === "/settings" && "설정"}
          </h2>
        </div>

        {sections.map((section, idx) => (
          <Collapsible key={idx} defaultOpen={getDefaultOpen(section)}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
              <span>{section.title}</span>
              <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              {section.items
                .filter((item) => canAccessItem(item))
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ml-2",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      {item.title}
                    </Link>
                  );
                })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>
    </aside>
  );
}
