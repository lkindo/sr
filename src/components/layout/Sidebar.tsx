"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  ListChecks,
  Building2,
  Users,
  Shield,
  User,
  Bell,
  Settings as SettingsIcon,
  ChevronRight,
  Network,
  type LucideIcon,
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
  icon?: LucideIcon;
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
              title: "SR 전체 목록",
              href: "/srs",
              icon: ListChecks,
            },
          ],
        },
  ],
  "/organization": [
    {
      title: "조직 관리",
      items: [
        {
          title: "조직 구조",
          href: "/organization",
          icon: Network,
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
        },
        {
          title: "고객사 목록",
          href: "/clients",
          icon: Building2,
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
        },
        {
          title: "사용자 목록",
          href: "/users",
          icon: Users,
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
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
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
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
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
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
          roles: ["ADMIN", "MANAGER", "ENGINEER"],
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
    if (pathname?.startsWith("/organization")) return "/organization";
    if (pathname?.startsWith("/clients")) return "/organization";
    if (pathname?.startsWith("/users")) return "/organization";
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
    <aside className="fixed left-0 top-[104px] z-30 h-[calc(100vh-104px)] w-64 sr-sidebar-bg text-white overflow-y-auto border-r border-[#3f4564]">
      <nav className="flex flex-col pt-5">
        {/* Menu Title */}
        <div className="px-8 pb-5 border-b border-[#3f4564]">
          <h2 className="text-lg font-medium text-white">
            {activeTopMenu === "/srs" && "SR 관리"}
            {activeTopMenu === "/organization" && "조직 관리"}
            {activeTopMenu === "/clients" && "고객사 관리"}
            {activeTopMenu === "/users" && "사용자 관리"}
            {activeTopMenu === "/roles" && "권한 관리"}
            {activeTopMenu === "/settings" && "설정"}
          </h2>
        </div>

        {/* Menu Sections */}
        <div className="mt-5">
          {sections
            .filter((section) => {
              // 섹션 내에 접근 가능한 항목이 하나라도 있으면 섹션 표시
              return section.items.some((item) => canAccessItem(item));
            })
            .map((section, idx) => (
              <Collapsible key={idx} defaultOpen={getDefaultOpen(section)}>
                <CollapsibleTrigger className="flex items-center justify-between w-full h-[55px] px-8 text-sm font-medium sr-sidebar-item group">
                  <span>{section.title}</span>
                  <ChevronRight className="h-4 w-4 sr-chevron transition-transform duration-200 data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="sr-sidebar-submenu">
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
                            "flex items-center h-12 px-8 text-sm sr-sidebar-submenu-item relative",
                            isActive && "text-white font-medium"
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-[49px] w-1 h-1 rounded-full bg-gray-400" />
                          )}
                          {Icon && <Icon className="h-4 w-4 mr-3 sr-menu-icon" />}
                          {item.title}
                        </Link>
                      );
                    })}
                </CollapsibleContent>
              </Collapsible>
            ))}
        </div>
      </nav>
    </aside>
  );
}
