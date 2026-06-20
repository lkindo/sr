'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, type LucideIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui';
import { NAVIGATION_CONFIG, type NavSection, type NavSubItem } from '@/config/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isMobile?: boolean;
  showAllSections?: boolean;
}

export function Sidebar({ isMobile = false, showAllSections = false }: SidebarProps) {
  const pathname = usePathname();
  const { hasPermission, hasRole, hasAnyRole } = usePermissions();

  // 현재 활성 메뉴 판단
  const getActiveTopMenu = () => {
    if (pathname?.startsWith('/srs') || pathname?.startsWith('/my-requests')) return '/srs';
    if (pathname?.startsWith('/organization')) return '/organization';
    if (pathname?.startsWith('/clients')) return '/organization';
    if (pathname?.startsWith('/users')) return '/organization';
    if (pathname?.startsWith('/roles')) return '/roles';
    if (pathname?.startsWith('/settings')) return '/settings';
    return '/dashboard';
  };

  const activeTopMenu = getActiveTopMenu();

  const canAccessItem = (item: NavSubItem): boolean => {
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

  const canAccessTopItem = (item: (typeof NAVIGATION_CONFIG)[0]): boolean => {
    if (item.roles && item.roles.length > 0) {
      return hasAnyRole(item.roles);
    }
    return true;
  };

  // 섹션별 기본 열림 상태 (활성 메뉴가 있는 섹션은 열림)
  const getDefaultOpen = (section: NavSection) => {
    return section.items.some((item) => pathname?.startsWith(item.href));
  };

  // Dashboard는 하위 메뉴가 없으므로 사이드바를 표시하지 않음 (단, 전체 메뉴 보기 모드에서는 표시)
  if (activeTopMenu === '/dashboard' && !showAllSections) {
    return null;
  }

  const renderSections = (sections: NavSection[]) => {
    return sections
      .filter((section) => {
        return section.items.some((item) => canAccessItem(item));
      })
      .map((section, idx) => (
        <Collapsible key={idx} defaultOpen={getDefaultOpen(section)} className="mb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full h-[50px] px-8 text-sm font-medium sr-sidebar-item group">
            <span>{section.title}</span>
            <ChevronRight className="h-4 w-4 sr-chevron transition-transform duration-200 data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="sr-sidebar-submenu pb-2">
            {section.items
              .filter((item) => canAccessItem(item))
              .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center h-10 px-8 pl-12 text-sm sr-sidebar-submenu-item relative text-slate-500 hover:text-slate-900',
                      isActive && 'text-primary font-semibold bg-blue-50/50'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-[35px] w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                    {Icon && <Icon className="h-4 w-4 mr-3 sr-menu-icon" />}
                    {item.title}
                  </Link>
                );
              })}
          </CollapsibleContent>
        </Collapsible>
      ));
  };

  return (
    <aside
      className={cn(
        'z-40 h-full w-full sr-sidebar-bg overflow-y-auto',
        !isMobile &&
          'fixed left-0 top-[104px] h-[calc(100vh-104px)] w-64 border-r border-slate-200 hidden md:block'
      )}
    >
      <nav className="flex flex-col pt-5 pb-20">
        {showAllSections ? (
          /* Mobile / Full Mode: Render Top Level Items with Subsections */
          <div className="space-y-1">
            {NAVIGATION_CONFIG.filter(canAccessTopItem).map((topItem) => {
              const isActiveTop = activeTopMenu === topItem.href;
              const hasSubSections = topItem.sections && topItem.sections.length > 0;

              return (
                <div key={topItem.href}>
                  {/* Top Level Link (acts as header) */}
                  <Link
                    href={topItem.href}
                    className={cn(
                      'flex items-center px-6 py-3 text-base font-semibold transition-colors',
                      isActiveTop
                        ? 'text-primary bg-blue-50/50 border-l-4 border-primary font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    )}
                  >
                    {topItem.icon && <topItem.icon className="mr-3 h-5 w-5" />}
                    {topItem.title}
                  </Link>

                  {/* Render Subsections if any */}
                  {hasSubSections && (
                    <div className="mt-1">{renderSections(topItem.sections!)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop / Partial Mode: Render only active sections */
          <div>
            {renderSections(
              NAVIGATION_CONFIG.find((item) => item.href === activeTopMenu)?.sections || []
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
