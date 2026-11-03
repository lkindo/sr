'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Filter,
  Loader2,
  Plus,
  Search,
  TrendingUp,
  User,
  X,
} from 'lucide-react';

import { ResponsiveTableShell } from '@/components/common/ResponsiveTableShell';
import { CreateSRDialog } from '@/components/srs/CreateSRDialog';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { canViewerIntakeSR } from '@/lib/sr-state-machine';
import type { SRListItem } from '@/types/sr.types';

import {
  type ClientListItem,
  type PaginationInfo,
  QUICK_FILTER_ALERT_BADGE,
  QUICK_FILTER_QUIET_BADGE,
  QuickFilterButton,
  SortableTableHead,
  type SortField,
  type SortOrder,
  SRAdvancedFilters,
  SRListEmptyState,
  SRListPagination,
  type UserListItem,
} from './SRListControls';
import { SRCardItem, SRTableRow } from './SRListItem';

/** 배지 '긴급' 의 범위 — 서버 배지 집계(getSRBadgeCounts)와 같다. */
const URGENT_PRIORITIES = ['CRITICAL', 'HIGH'] as const;

/**
 * 같은 키가 여러 번 온 필터(대시보드 카드 링크 `?status=COMPLETED&status=CONFIRMED` 등)를 하나의 선택값으로
 * 다룬다 — 값이 여럿이면 쉼표로 묶는다. 선택 목록에는 그 묶음이 한 항목으로 따로 나타난다.
 */
function multiValueFilter(params: URLSearchParams | null, key: string): string {
  const values = params?.getAll(key) ?? [];
  return values.length === 0 ? 'all' : values.join(',');
}

// This component now receives data fetched from the server as props
export function SRsDataTable({
  srs,
  paginationInfo,
  clients,
  users,
  globalCounts,
}: {
  srs: SRListItem[];
  paginationInfo: PaginationInfo;
  clients: ClientListItem[];
  users: UserListItem[];
  globalCounts?: {
    waiting: number;
    inProgress: number;
    urgent: number;
    dueToday: number;
    overdue: number;
    myAssigned: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const { hasAnyRole, hasPermission, isAdmin, roles, permissions } = usePermissions();
  // 서버(policies.canCreateSR)와 같은 규칙: ADMIN 이거나 SR:CREATE. ENGINEER 는 시드상 SR:CREATE 가 없어
  // 예전에는 등록 버튼을 누르면 반드시 403 이었다.
  const canCreateSR = isAdmin() || hasPermission('SR', 'CREATE');

  // ADMIN, MANAGER, ENGINEER가 아닌 고객사 사용자인지 확인
  const isClientUser = !hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  // 목록 행의 '접수'·'접수 정보 수정' 버튼. 서버와 같은 판정(ADMIN·MANAGER 또는 SR:INTAKE) —
  // 예전에는 내부 역할 전원이었는데 ENGINEER 는 접수하지 않는다(소유자 결정 2026-09-18).
  const canManageSRs = canViewerIntakeSR({ roles, permissions });

  const [isPending, startTransition] = useTransition();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Read state from URL search params, with defaults

  const itemsPerPage = searchParams?.get('itemsPerPage') ?? '20';
  const sort = searchParams?.get('sort') ?? 'createdAt.desc';
  const [sortField, sortOrder] = sort.split('.') as [SortField, SortOrder];

  const filters = useMemo(
    () => ({
      status: multiValueFilter(searchParams, 'status'),
      priority: multiValueFilter(searchParams, 'priority'),
      clientId: searchParams?.get('clientId') ?? 'all',
      assigneeId: searchParams?.get('assigneeId') ?? 'all',
      search: searchParams?.get('search') ?? '',
      dateFrom: searchParams?.get('dateFrom') ?? '',
      dateTo: searchParams?.get('dateTo') ?? '',
      // '지연 중'(헌법 §3, 결정 D10) — 서버(srs/page.tsx)가 마감을 넘긴 진행 중 SR 만 거른다.
      overdue: searchParams?.get('overdue') === '1' ? '1' : '',
    }),
    [searchParams]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      filters.status !== 'all' ||
      filters.priority !== 'all' ||
      filters.clientId !== 'all' ||
      filters.assigneeId !== 'all' ||
      filters.search !== '' ||
      filters.dateFrom !== '' ||
      filters.dateTo !== '' ||
      filters.overdue !== ''
    );
  }, [filters]);

  const [searchQuery, setSearchQuery] = useState(filters.search);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 검색 디바운싱 적용 (500ms)
  useEffect(() => {
    // 렌더링 시점과 현재 검색 필터 값이 동일하다면 필터 갱신 생략
    if (searchQuery === (searchParams?.get('search') ?? '')) return;

    const timer = setTimeout(() => {
      handleFilterChange('search', searchQuery);
    }, 500);

    return () => clearTimeout(timer);
    // 검색어 입력에만 반응하는 디바운스다. searchParams 를 넣으면 URL 이 갱신될 때마다
    // 타이머가 다시 걸려 아래 동기화 effect 와 서로를 끝없이 재발화시킨다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // 외부(필터 초기화 등)에서 search 필터가 갱신되었을 때 로컬 searchQuery 상태도 동기화
  useEffect(() => {
    const currentSearch = searchParams?.get('search') ?? '';
    if (searchQuery !== currentSearch) {
      setSearchQuery(currentSearch);
    }
    // URL → 로컬 상태 단방향 동기화다.
    // searchQuery 를 넣으면 위 디바운스 effect 와 왕복하며 서로를 재발화시킨다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const createQueryString = useCallback(
    (params: Record<string, string | number | string[] | null>) => {
      const newSearchParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === null || value === 'all' || value === '') {
          newSearchParams.delete(key);
        } else if (Array.isArray(value)) {
          // 여러 값 필터는 같은 키를 반복한다(`?priority=CRITICAL&priority=HIGH`).
          newSearchParams.delete(key);
          value.forEach((item) => newSearchParams.append(key, item));
        } else {
          newSearchParams.set(key, String(value));
        }
      }
      return newSearchParams.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (key: string, value: string | string[]) => {
    // 여러 값 선택지(예: '완료·확인완료')는 쉼표로 묶여 있으므로 다시 풀어 같은 키로 반복한다.
    const next = typeof value === 'string' && value.includes(',') ? value.split(',') : value;
    // When filtering, always go back to the first page
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ [key]: next, page: 1 })}`);
    });
  };

  const handleSort = (field: SortField) => {
    const newOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ sort: `${field}.${newOrder}` })}`);
    });
  };

  const handleItemsPerPageChange = (value: string) => {
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ itemsPerPage: value, page: 1 })}`);
    });
  };

  const handlePageChange = (page: number) => {
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ page })}`);
    });
  };

  const handleSearch = () => {
    handleFilterChange('search', searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (filters.search) {
      handleFilterChange('search', '');
    }
    searchInputRef.current?.focus();
  };

  const resetFilters = () => {
    setSearchQuery('');
    startTransition(() => {
      router.push(pathname);
    });
  };

  const handleSRCreated = () => {
    // Instead of invalidating queries, we just navigate to refresh the server component
    startTransition(() => {
      router.refresh();
    });
    setIsCreateDialogOpen(false);
  };

  // 서버로부터 전달받은 전체 글로벌 통계 수치 바인딩 (기본값 폴백 제공)
  const counts = globalCounts ?? {
    waiting: 0,
    inProgress: 0,
    urgent: 0,
    dueToday: 0,
    overdue: 0,
    myAssigned: 0,
  };

  const activeQuickFilter = useMemo(() => {
    if (filters.overdue === '1') return 'overdue';
    if (filters.status === 'REQUESTED') return 'waiting';
    if (filters.assigneeId === session?.user?.id) return 'myAssigned';
    if (
      filters.priority === URGENT_PRIORITIES.join(',') ||
      filters.priority === 'CRITICAL' ||
      filters.priority === 'HIGH'
    )
      return 'urgent';
    return null;
  }, [filters, session]);

  const handleQuickFilter = (
    filterType: 'waiting' | 'myAssigned' | 'urgent' | 'overdue' | null
  ) => {
    if (filterType === 'overdue') {
      // 대시보드 '지연 중' 카드와 같은 범위다(결정 D10).
      handleFilterChange('overdue', '1');
    } else if (filterType === 'waiting') {
      handleFilterChange('status', 'REQUESTED');
    } else if (filterType === 'myAssigned') {
      if (session?.user?.id) {
        handleFilterChange('assigneeId', session.user.id);
      }
    } else if (filterType === 'urgent') {
      // 배지 숫자(긴급 = CRITICAL + HIGH)와 같은 범위로 거른다. 예전에는 CRITICAL 만 걸어서
      // 배지가 5건인데 목록은 2건처럼 숫자와 목록이 달랐다.
      handleFilterChange('priority', [...URGENT_PRIORITIES]);
    } else {
      resetFilters();
    }
  };

  const toggleQuickFilter = (filterType: 'waiting' | 'myAssigned' | 'urgent' | 'overdue') => {
    handleQuickFilter(activeQuickFilter === filterType ? null : filterType);
  };

  const sortProps = { sortField, sortOrder, onSort: handleSort };

  const emptyState = (
    <SRListEmptyState
      hasActiveFilters={hasActiveFilters}
      canCreateSR={canCreateSR}
      onReset={resetFilters}
      onCreate={() => setIsCreateDialogOpen(true)}
    />
  );
  return (
    <div className="space-y-6">
      <div className="sr-card-template bg-card">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-foreground">SR 목록</h1>
            {canCreateSR && (
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="sr-btn-template-primary"
              >
                <Plus className="mr-2 h-4 w-4" /> 등록
              </Button>
            )}
          </div>

          {/* 통계 배지 - 데스크톱에서만 노출 (모바일에서는 퀵 필터 버튼에 통합) */}
          <div className="hidden md:flex gap-2 mb-4 flex-wrap">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              <Clock className="mr-1 h-3 w-3" />
              접수 대기 ({counts.waiting})
            </Badge>
            <Badge variant="default" className="text-sm px-3 py-1">
              <TrendingUp className="mr-1 h-3 w-3" />
              진행중 ({counts.inProgress})
            </Badge>
            {counts.dueToday > 0 && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                <AlertCircle className="mr-1 h-3 w-3" />
                오늘 마감 ({counts.dueToday})
              </Badge>
            )}
            <Badge variant="outline" className="text-sm px-3 py-1">
              전체 ({paginationInfo.totalCount})
            </Badge>
          </div>

          {/* Quick Filter Buttons and Advanced Filter Button - 고객사 사용자는 숨김 */}
          {!isClientUser && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2 md:mx-0 md:px-0">
                  <QuickFilterButton
                    active={activeQuickFilter === 'waiting'}
                    onToggle={() => toggleQuickFilter('waiting')}
                    icon={Clock}
                    label="접수"
                    count={counts.waiting}
                    idleBadgeClassName={QUICK_FILTER_ALERT_BADGE}
                  />
                  <QuickFilterButton
                    active={activeQuickFilter === 'myAssigned'}
                    onToggle={() => toggleQuickFilter('myAssigned')}
                    icon={User}
                    label="담당"
                    count={counts.myAssigned}
                    idleBadgeClassName={QUICK_FILTER_QUIET_BADGE}
                  />
                  <QuickFilterButton
                    active={activeQuickFilter === 'urgent'}
                    onToggle={() => toggleQuickFilter('urgent')}
                    icon={AlertTriangle}
                    label="긴급"
                    count={counts.urgent}
                    idleBadgeClassName={QUICK_FILTER_ALERT_BADGE}
                  />
                  {/* '지연 중'(헌법 §3, 결정 D10) — 마감을 넘긴 진행 중 SR. 내부 사용자 전용 영역이다. */}
                  <QuickFilterButton
                    active={activeQuickFilter === 'overdue'}
                    onToggle={() => toggleQuickFilter('overdue')}
                    icon={AlertCircle}
                    label="지연"
                    count={counts.overdue}
                    idleBadgeClassName={
                      counts.overdue > 0 ? QUICK_FILTER_ALERT_BADGE : QUICK_FILTER_QUIET_BADGE
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="md:hidden text-xs text-muted-foreground font-medium">
                    전체 {paginationInfo.totalCount}건
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    aria-expanded={showAdvancedFilters}
                    aria-controls="advanced-filters-section"
                    className="h-8 text-xs shrink-0 rounded-full md:rounded-md border-primary/20 text-primary hover:bg-primary/5"
                  >
                    <Filter className="mr-1.5 h-3.5 w-3.5" />
                    상세 필터
                  </Button>
                </div>
              </div>

              {/* Advanced Filters (Collapsible) */}
              {showAdvancedFilters && (
                <SRAdvancedFilters
                  filters={filters}
                  clients={clients}
                  users={users}
                  onFilterChange={handleFilterChange}
                  onReset={resetFilters}
                />
              )}
            </>
          )}

          {/* Search Bar and Total Count */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="SR 번호, 제목, 고객사, 요청자, 담당자로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 pr-8 sr-input-template w-full"
                aria-label="검색어 입력"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full p-0.5"
                  aria-label="검색어 초기화"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={handleSearch} className="sr-btn-template-primary shrink-0 h-10">
              <Search className="h-4 w-4 mr-2" />
              검색
            </Button>
          </div>
        </div>

        {/* 전체 개수 - 데스크톱에서만 노출 (모바일은 필터바에 통합) */}
        <div className="hidden md:flex px-6 py-2 border-b border-[hsl(var(--sr-border))] justify-end">
          <span className="text-sm text-[hsl(var(--sr-gray-medium))] whitespace-nowrap">
            전체 {paginationInfo.totalCount}건
          </span>
        </div>

        <div className="relative" aria-busy={isPending}>
          {isPending && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-8 w-8 animate-spin text-foreground" aria-hidden="true" />
              <span className="sr-only">목록을 불러오는 중</span>
            </div>
          )}

          {/* Responsive Table - Show Table on larger screens, Cards on smaller screens */}
          <ResponsiveTableShell>
            <TableHeader>
              <TableRow>
                <SortableTableHead field="srNumber" label="SR 번호" {...sortProps} />
                <SortableTableHead
                  field="title"
                  label="제목"
                  className="min-w-[150px]"
                  {...sortProps}
                />
                <SortableTableHead field="client" label="고객사" {...sortProps} />
                <TableHead>요청자</TableHead>
                <TableHead>담당자</TableHead>
                <SortableTableHead field="priority" label="우선순위" {...sortProps} />
                <SortableTableHead field="status" label="상태" {...sortProps} />
                <SortableTableHead field="dueDate" label="마감일" {...sortProps} />
                <TableHead>댓글/첨부</TableHead>
                <SortableTableHead field="createdAt" label="생성일" {...sortProps} />
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {srs && srs.length > 0 ? (
                srs.map((sr) => <SRTableRow key={sr.id} sr={sr} canManageSRs={canManageSRs} />)
              ) : (
                <TableRow>
                  <TableCell colSpan={11}>{emptyState}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </ResponsiveTableShell>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-3">
            {srs && srs.length > 0
              ? srs.map((sr) => <SRCardItem key={sr.id} sr={sr} canManageSRs={canManageSRs} />)
              : emptyState}
          </div>

          <SRListPagination
            itemsPerPage={itemsPerPage}
            paginationInfo={paginationInfo}
            onItemsPerPageChange={handleItemsPerPageChange}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      <CreateSRDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={handleSRCreated}
      />
    </div>
  );
}
