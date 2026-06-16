'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  Filter,
  Inbox,
  Loader2,
  Plus,
  Search,
  SearchX,
  TrendingUp,
  User,
  X,
} from 'lucide-react';

import { CreateSRDialog } from '@/components/srs/CreateSRDialog';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { usePermissions } from '@/hooks/use-permissions';
import { SRService } from '@/services/sr.service';

import { priorityLabels, statusLabels } from './constants';
import { SRCardItem, SRTableRow } from './SRListItem';

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

type SortField = 'srNumber' | 'title' | 'client' | 'priority' | 'status' | 'createdAt' | 'dueDate';
type SortOrder = 'asc' | 'desc';

// SR 타입 정의
type SRListItem = Awaited<ReturnType<SRService['getAllSRs']>>[number];
type ClientListItem = { id: string; code: string; name: string };
type UserListItem = { id: string; name: string; email: string };
type PaginationInfo = {
  currentPage: number;
  itemsPerPage: number;
  totalCount: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

// Empty State Component
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">{description}</p>
      {action}
    </div>
  );
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
    myAssigned: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const { hasAnyRole } = usePermissions();

  // ADMIN, MANAGER, ENGINEER가 아닌 고객사 사용자인지 확인
  const isClientUser = !hasAnyRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canManageSRs = !isClientUser;

  const [isPending, startTransition] = useTransition();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Read state from URL search params, with defaults

  const itemsPerPage = searchParams?.get('itemsPerPage') ?? '20';
  const sort = searchParams?.get('sort') ?? 'createdAt.desc';
  const [sortField, sortOrder] = sort.split('.') as [SortField, SortOrder];

  const filters = useMemo(
    () => ({
      status: searchParams?.get('status') ?? 'all',
      priority: searchParams?.get('priority') ?? 'all',
      clientId: searchParams?.get('clientId') ?? 'all',
      assigneeId: searchParams?.get('assigneeId') ?? 'all',
      search: searchParams?.get('search') ?? '',
      dateFrom: searchParams?.get('dateFrom') ?? '',
      dateTo: searchParams?.get('dateTo') ?? '',
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
      filters.dateTo !== ''
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
  }, [searchQuery]);

  // 외부(필터 초기화 등)에서 search 필터가 갱신되었을 때 로컬 searchQuery 상태도 동기화
  useEffect(() => {
    const currentSearch = searchParams?.get('search') ?? '';
    if (searchQuery !== currentSearch) {
      setSearchQuery(currentSearch);
    }
  }, [searchParams]);

  const createQueryString = useCallback(
    (params: Record<string, string | number | null>) => {
      const newSearchParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === null || value === 'all' || value === '') {
          newSearchParams.delete(key);
        } else {
          newSearchParams.set(key, String(value));
        }
      }
      return newSearchParams.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (key: string, value: string) => {
    // When filtering, always go back to the first page
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ [key]: value, page: 1 })}`);
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

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
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
    myAssigned: 0,
  };

  const activeQuickFilter = useMemo(() => {
    if (filters.status === 'REQUESTED') return 'waiting';
    if (filters.assigneeId === session?.user?.id) return 'myAssigned';
    if (filters.priority === 'CRITICAL' || filters.priority === 'HIGH') return 'urgent';
    return null;
  }, [filters, session]);

  const handleQuickFilter = (filterType: 'waiting' | 'myAssigned' | 'urgent' | null) => {
    if (filterType === 'waiting') {
      handleFilterChange('status', 'REQUESTED');
    } else if (filterType === 'myAssigned') {
      if (session?.user?.id) {
        handleFilterChange('assigneeId', session.user.id);
      }
    } else if (filterType === 'urgent') {
      handleFilterChange('priority', 'CRITICAL');
    } else {
      resetFilters();
    }
  };

  return (
    <div className="space-y-6">
      <div className="sr-card-template bg-white">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">SR 목록</h3>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="sr-btn-template-primary">
              <Plus className="mr-2 h-4 w-4" /> 등록
            </Button>
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
                  <button
                    onClick={() =>
                      handleQuickFilter(activeQuickFilter === 'waiting' ? null : 'waiting')
                    }
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] whitespace-nowrap transition-all ${
                      activeQuickFilter === 'waiting'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))] shadow-sm'
                        : 'bg-white text-muted-foreground border-border hover:bg-muted font-medium'
                    }`}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    <span>접수</span>
                    <span
                      className={`px-1 rounded-full text-[8px] min-w-[14px] text-center ${
                        activeQuickFilter === 'waiting'
                          ? 'bg-white text-primary font-bold'
                          : 'bg-destructive text-white'
                      }`}
                    >
                      {counts.waiting}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      handleQuickFilter(activeQuickFilter === 'myAssigned' ? null : 'myAssigned')
                    }
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] whitespace-nowrap transition-all ${
                      activeQuickFilter === 'myAssigned'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))] shadow-sm'
                        : 'bg-white text-muted-foreground border-border hover:bg-muted font-medium'
                    }`}
                  >
                    <User className="h-2.5 w-2.5" />
                    <span>담당</span>
                    <span
                      className={`px-1 rounded-full text-[8px] min-w-[14px] text-center ${
                        activeQuickFilter === 'myAssigned'
                          ? 'bg-white text-primary font-bold'
                          : 'bg-muted-foreground text-white'
                      }`}
                    >
                      {counts.myAssigned}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      handleQuickFilter(activeQuickFilter === 'urgent' ? null : 'urgent')
                    }
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] whitespace-nowrap transition-all ${
                      activeQuickFilter === 'urgent'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))] shadow-sm'
                        : 'bg-white text-muted-foreground border-border hover:bg-muted font-medium'
                    }`}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    <span>긴급</span>
                    <span
                      className={`px-1 rounded-full text-[8px] min-w-[14px] text-center ${
                        activeQuickFilter === 'urgent'
                          ? 'bg-white text-primary font-bold'
                          : 'bg-destructive text-white'
                      }`}
                    >
                      {counts.urgent}
                    </span>
                  </button>
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
                <div
                  id="advanced-filters-section"
                  role="region"
                  aria-label="상세 필터 옵션"
                  className="mb-4 pb-4 border-b border-[hsl(var(--sr-border))]"
                >
                  {/* First Row: Status, Priority, Client, Assignee */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label className="text-sm mb-2 block">상태</Label>
                      <Select
                        value={filters.status}
                        onValueChange={(v) => handleFilterChange('status', v)}
                      >
                        <SelectTrigger className="sr-input-template w-full">
                          <SelectValue placeholder="모든 상태" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">모든 상태</SelectItem>
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm mb-2 block">우선순위</Label>
                      <Select
                        value={filters.priority}
                        onValueChange={(v) => handleFilterChange('priority', v)}
                      >
                        <SelectTrigger className="sr-input-template w-full">
                          <SelectValue placeholder="모든 우선순위" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">모든 우선순위</SelectItem>
                          {Object.entries(priorityLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm mb-2 block">고객사</Label>
                      <Select
                        value={filters.clientId}
                        onValueChange={(v) => handleFilterChange('clientId', v)}
                      >
                        <SelectTrigger className="sr-input-template w-full">
                          <SelectValue placeholder="모든 고객사" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">모든 고객사</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm mb-2 block">담당자</Label>
                      <Select
                        value={filters.assigneeId}
                        onValueChange={(v) => handleFilterChange('assigneeId', v)}
                      >
                        <SelectTrigger className="sr-input-template w-full">
                          <SelectValue placeholder="모든 담당자" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">모든 담당자</SelectItem>
                          <SelectItem value="unassigned">미배정</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Second Row: Date Range */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label className="text-sm mb-2 block">생성일 시작</Label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                        className="sr-input-template w-full"
                        placeholder="년-월-일"
                      />
                    </div>
                    <div>
                      <Label className="text-sm mb-2 block">생성일 종료</Label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                        className="sr-input-template w-full"
                        placeholder="년-월-일"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      필터 초기화
                    </Button>
                  </div>
                </div>
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

        <div className="relative">
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--sr-primary-dark))]" />
            </div>
          )}

          {/* Responsive Table - Show Table on larger screens, Cards on smaller screens */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="sr-table-template">
              <TableHeader>
                <TableRow>
                  <TableHead
                    aria-sort={
                      sortField === 'srNumber'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('srNumber')}>
                      SR 번호{getSortIcon('srNumber')}
                    </Button>
                  </TableHead>
                  <TableHead
                    className="min-w-[150px]"
                    aria-sort={
                      sortField === 'title'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('title')}>
                      제목{getSortIcon('title')}
                    </Button>
                  </TableHead>
                  <TableHead
                    aria-sort={
                      sortField === 'client'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('client')}>
                      고객사{getSortIcon('client')}
                    </Button>
                  </TableHead>
                  <TableHead>요청자</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead
                    aria-sort={
                      sortField === 'priority'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('priority')}>
                      우선순위{getSortIcon('priority')}
                    </Button>
                  </TableHead>
                  <TableHead
                    aria-sort={
                      sortField === 'status'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('status')}>
                      상태{getSortIcon('status')}
                    </Button>
                  </TableHead>
                  <TableHead
                    aria-sort={
                      sortField === 'dueDate'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('dueDate')}>
                      마감일{getSortIcon('dueDate')}
                    </Button>
                  </TableHead>
                  <TableHead>댓글/첨부</TableHead>
                  <TableHead
                    aria-sort={
                      sortField === 'createdAt'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <Button variant="ghost" onClick={() => handleSort('createdAt')}>
                      생성일{getSortIcon('createdAt')}
                    </Button>
                  </TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {srs && srs.length > 0 ? (
                  srs.map((sr) => <SRTableRow key={sr.id} sr={sr} canManageSRs={canManageSRs} />)
                ) : (
                  <TableRow>
                    <TableCell colSpan={11}>
                      {hasActiveFilters ? (
                        <EmptyState
                          icon={SearchX}
                          title="검색 결과가 없습니다"
                          description="다른 검색어나 필터를 시도해보세요."
                          action={
                            <Button variant="outline" onClick={resetFilters}>
                              필터 초기화
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon={Inbox}
                          title="SR이 없습니다"
                          description="새로운 SR을 생성하거나 나중에 다시 확인해주세요."
                          action={
                            <Button
                              onClick={() => setIsCreateDialogOpen(true)}
                              className="sr-btn-template-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" /> SR 등록
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-3">
            {srs && srs.length > 0 ? (
              srs.map((sr) => <SRCardItem key={sr.id} sr={sr} canManageSRs={canManageSRs} />)
            ) : hasActiveFilters ? (
              <EmptyState
                icon={SearchX}
                title="검색 결과가 없습니다"
                description="다른 검색어나 필터를 시도해보세요."
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    필터 초기화
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="SR이 없습니다"
                description="새로운 SR을 생성하거나 나중에 다시 확인해주세요."
                action={
                  <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="sr-btn-template-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" /> SR 등록
                  </Button>
                }
              />
            )}
          </div>

          <div className="px-6 py-4 border-t border-[hsl(var(--sr-border))] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Select value={itemsPerPage} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger
                  className="w-[80px] h-9 sr-dropdown-template"
                  aria-label="페이지당 항목 수"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-[hsl(var(--sr-gray-medium))]">페이지당 항목 수</span>
            </div>

            {paginationInfo.totalPages > 1 && (
              <Pagination className="w-auto mx-0">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (paginationInfo.hasPrevPage)
                          handlePageChange(paginationInfo.currentPage - 1);
                      }}
                      aria-disabled={!paginationInfo.hasPrevPage}
                      className={
                        !paginationInfo.hasPrevPage
                          ? 'pointer-events-none opacity-50 cursor-not-allowed'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                  <div className="flex items-center gap-1 text-sm font-medium mx-2">
                    {paginationInfo.currentPage} / {paginationInfo.totalPages}
                  </div>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (paginationInfo.hasNextPage)
                          handlePageChange(paginationInfo.currentPage + 1);
                      }}
                      aria-disabled={!paginationInfo.hasNextPage}
                      className={
                        !paginationInfo.hasNextPage
                          ? 'pointer-events-none opacity-50 cursor-not-allowed'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
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
