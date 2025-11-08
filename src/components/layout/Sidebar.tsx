"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  Shield,
  Settings,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

interface SidebarItem {
  title: string;
  href: string;
  icon: any;
  permission?: { resource: string; action: string };
  role?: string;
  roles?: string[];
}

const sidebarItems: SidebarItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    // Dashboard는 모든 사용자 접근 가능
  },
  {
    title: "SR 관리",
    href: "/srs",
    icon: FileText,
    permission: { resource: "SR", action: "READ" },
  },
  {
    title: "고객사 관리",
    href: "/clients",
    icon: Building2,
    permission: { resource: "CLIENT", action: "READ" },
  },
  {
    title: "사용자 관리",
    href: "/users",
    icon: Users,
    roles: ["ADMIN", "MANAGER"], // ADMIN 또는 MANAGER만 접근
  },
  {
    title: "역할 관리",
    href: "/roles",
    icon: Shield,
    role: "ADMIN", // ADMIN만 접근
  },
  {
    title: "설정",
    href: "/settings",
    icon: Settings,
    // 설정은 모든 사용자 접근 가능
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, hasRole, hasAnyRole } = usePermissions();

  const canAccessItem = (item: SidebarItem): boolean => {
    // 역할 체크
    if (item.role) {
      return hasRole(item.role);
    }
    if (item.roles && item.roles.length > 0) {
      return hasAnyRole(item.roles);
    }
    // 권한 체크
    if (item.permission) {
      return hasPermission(item.permission.resource, item.permission.action);
    }
    // 조건이 없으면 모든 사용자 접근 가능
    return true;
  };

  return (
    <aside className="fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] w-64 border-r border-border bg-background">
      <nav className="flex flex-col gap-1 p-4">
        {sidebarItems
          .filter((item) => canAccessItem(item))
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
