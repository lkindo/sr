"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";
import { Plus, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown, Clock, User, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateSRDialog } from "@/components/srs/CreateSRDialog";
import { getDueDateStatus } from "@/lib/date-utils";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useQueryClient } from "@tanstack/react-query";
import { SRService } from "@/services/sr.service";

// These types and constants can be moved to a shared file if needed
const statusLabels: Record<string, string> = {
  REQUESTED: "요청됨", INTAKE: "접수", IN_PROGRESS: "진행중", ON_HOLD: "대기",
  COMPLETED: "완료", CONFIRMED: "확인완료", REJECTED: "거부",
};
const priorityLabels: Record<string, string> = { CRITICAL: "긴급", HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  REQUESTED: "secondary", INTAKE: "default", IN_PROGRESS: "default", ON_HOLD: "secondary",
  COMPLETED: "default", CONFIRMED: "default", REJECTED: "destructive",
};
const priorityColors: Record<string, "default" | "secondary" | "destructive"> = {
  CRITICAL: "destructive", HIGH: "destructive", MEDIUM: "default", LOW: "secondary",
};
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

type SortField = "srNumber" | "title" | "client" | "priority" | "status" | "createdAt" | "dueDate";
type SortOrder = "asc" | "desc";

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

// This component now receives data fetched from the server as props
export function SRsDataTable({ 
  srs, 
  paginationInfo, 
  clients, 
  users 
}: { 
  srs: SRListItem[]; 
  paginationInfo: PaginationInfo; 
  clients: ClientListItem[]; 
  users: UserListItem[] 
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { hasAnyRole } = usePermissions();

  // ADMIN, MANAGER, ENGINEER가 아닌 고객사 사용자인지 확인
  const isClientUser = !hasAnyRole(["ADMIN", "MANAGER", "ENGINEER"]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Read state from URL search params, with defaults
  const page = searchParams.get("page") ?? "1";
  const itemsPerPage = searchParams.get("itemsPerPage") ?? "20";
  const sort = searchParams.get("sort") ?? "createdAt.desc";
  const [sortField, sortOrder] = sort.split(".") as [SortField, SortOrder];
  
  const filters = useMemo(() => ({
    status: searchParams.get("status") ?? "all",
    priority: searchParams.get("priority") ?? "all",
    clientId: searchParams.get("clientId") ?? "all",
    assigneeId: searchParams.get("assigneeId") ?? "all",
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  }), [searchParams]);

  const [searchQuery, setSearchQuery] = useState(filters.search);

  const createQueryString = useCallback((params: Record<string, string | number | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === "all" || value === "") {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, String(value));
      }
    }
    return newSearchParams.toString();
  }, [searchParams]);

  const handleFilterChange = (key: string, value: string) => {
    // When filtering, always go back to the first page
    router.push(`${pathname}?${createQueryString({ [key]: value, page: 1 })}`);
  };
  
  const handleSort = (field: SortField) => {
    const newOrder = sortField === field && sortOrder === "asc" ? "desc" : "asc";
    router.push(`${pathname}?${createQueryString({ sort: `${field}.${newOrder}` })}`);
  };

  const handlePagination = (newPage: number) => {
    router.push(`${pathname}?${createQueryString({ page: newPage })}`);
  };

  const handleItemsPerPageChange = (value: string) => {
    router.push(`${pathname}?${createQueryString({ itemsPerPage: value, page: 1 })}`);
  };

  const handleSearch = () => {
    handleFilterChange("search", searchQuery);
  };

  const resetFilters = () => {
    setSearchQuery("");
    router.push(pathname);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortOrder === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const handleSRCreated = () => {
    // Instead of invalidating queries, we just navigate to refresh the server component
    router.refresh();
    setIsCreateDialogOpen(false);
  };

  // Calculate filter counts
  const waitingCount = useMemo(() => {
    return srs.filter(sr => sr.status === 'REQUESTED').length;
  }, [srs]);

  const myAssignedCount = useMemo(() => {
    if (!session?.user?.id) return 0;
    return srs.filter(sr => sr.assigneeId === session.user.id).length;
  }, [srs, session]);

  const urgentCount = useMemo(() => {
    return srs.filter(sr => sr.priority === 'CRITICAL' || sr.priority === 'HIGH').length;
  }, [srs]);

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
          
          {/* Quick Filter Buttons and Advanced Filter Button - 고객사 사용자는 숨김 */}
          {!isClientUser && (
            <>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleQuickFilter(activeQuickFilter === 'waiting' ? null : 'waiting')}
                    className={`flex items-center gap-2 px-4 py-2 rounded border transition-colors ${
                      activeQuickFilter === 'waiting'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))]'
                        : 'bg-[hsl(var(--sr-bg-lighter))] text-[hsl(var(--sr-gray-medium))] border-[hsl(var(--sr-border))] hover:bg-gray-200'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    <span>접수 대기</span>
                    {waitingCount > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                        {waitingCount}
                      </Badge>
                    )}
                  </button>
                  <button
                    onClick={() => handleQuickFilter(activeQuickFilter === 'myAssigned' ? null : 'myAssigned')}
                    className={`flex items-center gap-2 px-4 py-2 rounded border transition-colors ${
                      activeQuickFilter === 'myAssigned'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))]'
                        : 'bg-[hsl(var(--sr-bg-lighter))] text-[hsl(var(--sr-gray-medium))] border-[hsl(var(--sr-border))] hover:bg-gray-200'
                    }`}
                  >
                    <User className="h-4 w-4" />
                    <span>내 담당</span>
                  </button>
                  <button
                    onClick={() => handleQuickFilter(activeQuickFilter === 'urgent' ? null : 'urgent')}
                    className={`flex items-center gap-2 px-4 py-2 rounded border transition-colors ${
                      activeQuickFilter === 'urgent'
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-white border-[hsl(var(--sr-primary-dark))]'
                        : 'bg-[hsl(var(--sr-bg-lighter))] text-[hsl(var(--sr-gray-medium))] border-[hsl(var(--sr-border))] hover:bg-gray-200'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <span>긴급</span>
                    {urgentCount > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                        {urgentCount}
                      </Badge>
                    )}
                  </button>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="sr-input-template"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  고급 필터
                </Button>
              </div>

              {/* Advanced Filters (Collapsible) */}
              {showAdvancedFilters && (
            <div className="mb-4 pb-4 border-b border-[hsl(var(--sr-border))]">
              {/* First Row: Status, Priority, Client, Assignee */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label className="text-sm mb-2 block">상태</Label>
                  <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                    <SelectTrigger className="sr-input-template w-full">
                      <SelectValue placeholder="모든 상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 상태</SelectItem>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">우선순위</Label>
                  <Select value={filters.priority} onValueChange={(v) => handleFilterChange('priority', v)}>
                    <SelectTrigger className="sr-input-template w-full">
                      <SelectValue placeholder="모든 우선순위" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 우선순위</SelectItem>
                      {Object.entries(priorityLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">고객사</Label>
                  <Select value={filters.clientId} onValueChange={(v) => handleFilterChange('clientId', v)}>
                    <SelectTrigger className="sr-input-template w-full">
                      <SelectValue placeholder="모든 고객사" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 고객사</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm mb-2 block">담당자</Label>
                  <Select value={filters.assigneeId} onValueChange={(v) => handleFilterChange('assigneeId', v)}>
                    <SelectTrigger className="sr-input-template w-full">
                      <SelectValue placeholder="모든 담당자" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 담당자</SelectItem>
                      <SelectItem value="unassigned">미배정</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
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
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SR 번호, 제목, 고객사, 요청자, 담당자로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 sr-input-template w-full"
              />
            </div>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <span className="text-sm text-[hsl(var(--sr-gray-medium))] whitespace-nowrap">
            Total {paginationInfo.totalCount} items
          </span>
        </div>

        {/* Responsive Table - Show Table on larger screens, Cards on smaller screens */}
        <div className="hidden md:block overflow-x-auto">
          <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead><Button variant="ghost" onClick={() => handleSort("srNumber")}>SR 번호{getSortIcon("srNumber")}</Button></TableHead>
                <TableHead className="min-w-[150px]"><Button variant="ghost" onClick={() => handleSort("title")}>제목{getSortIcon("title")}</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("client")}>고객사{getSortIcon("client")}</Button></TableHead>
                <TableHead>요청자</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("priority")}>우선순위{getSortIcon("priority")}</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("status")}>상태{getSortIcon("status")}</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("dueDate")}>마감일{getSortIcon("dueDate")}</Button></TableHead>
                <TableHead>댓글/첨부</TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("createdAt")}>생성일{getSortIcon("createdAt")}</Button></TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {srs && srs.length > 0 ? (
                srs.map((sr) => {
                  const dueDateStatus = getDueDateStatus(sr.dueDate ? new Date(sr.dueDate).toISOString() : null);
                  
                  return (
                    <TableRow key={sr.id} className="cursor-pointer" onClick={() => router.push(`/srs/${sr.id}`)}>
                      <TableCell className="font-medium text-primary hover:underline text-center"><Link href={`/srs/${sr.id}`}>{sr.srNumber}</Link></TableCell>
                      <TableCell className="max-w-[200px] truncate" title={sr.title}>{sr.title}</TableCell>
                      <TableCell>{sr.client.name}</TableCell>
                      <TableCell className="text-center">{sr.requester.name}</TableCell>
                      <TableCell className="text-center">{sr.assignee?.name || "-"}</TableCell>
                      <TableCell className="text-center"><Badge variant={priorityColors[sr.priority]}>{priorityLabels[sr.priority]}</Badge></TableCell>
                      <TableCell className="text-center"><Badge variant={statusColors[sr.status]}>{statusLabels[sr.status]}</Badge></TableCell>
                      <TableCell className="text-center">{dueDateStatus ? <Badge variant={dueDateStatus.variant}>{dueDateStatus.label}</Badge> : '-'}</TableCell>
                      <TableCell className="text-center">{sr._count?.comments || 0} / {sr._count?.attachments || 0}</TableCell>
                      <TableCell className="text-center">
                        {new Date(sr.createdAt).toLocaleDateString("ko-KR", { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit' 
                        }).replace(/\./g, '. ').trim()}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {/* ADMIN/MANAGER/ENGINEER만 접수 및 접수 수정 가능 */}
                        {hasAnyRole(["ADMIN", "MANAGER", "ENGINEER"]) ? (
                          <>
                            {sr.status === 'REQUESTED' ? (
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="bg-[hsl(var(--sr-primary-dark))] text-white hover:bg-[hsl(var(--sr-sidebar-hover))]"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  router.push(`/srs/${sr.id}/intake`); 
                                }}
                              >
                                접수
                              </Button>
                            ) : sr.status === 'IN_PROGRESS' ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  router.push(`/srs/${sr.id}/intake`); 
                                }}
                                title="접수 정보 수정"
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={11} className="text-center py-8">데이터가 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4 p-4">
          {srs && srs.length > 0 ? (
            srs.map((sr) => {
              const dueDateStatus = getDueDateStatus(sr.dueDate ? new Date(sr.dueDate).toISOString() : null);
              return (
                <div 
                  key={sr.id} 
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/srs/${sr.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/srs/${sr.id}`} className="font-medium text-primary hover:underline">
                          {sr.srNumber}
                        </Link>
                        <Badge variant={statusColors[sr.status]} className="flex-shrink-0">
                          {statusLabels[sr.status]}
                        </Badge>
                        <Badge variant={priorityColors[sr.priority]} className="flex-shrink-0">
                          {priorityLabels[sr.priority]}
                        </Badge>
                      </div>
                      <h4 className="font-semibold mt-1 truncate">{sr.title}</h4>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex">
                          <span className="text-muted-foreground w-20">고객사</span>
                          <span>{sr.client.name}</span>
                        </div>
                        <div className="flex">
                          <span className="text-muted-foreground w-20">요청자</span>
                          <span>{sr.requester.name}</span>
                        </div>
                        <div className="flex">
                          <span className="text-muted-foreground w-20">담당자</span>
                          <span>{sr.assignee?.name || "-"}</span>
                        </div>
                        <div className="flex">
                          <span className="text-muted-foreground w-20">마감일</span>
                          <span>{dueDateStatus ? <Badge variant={dueDateStatus.variant}>{dueDateStatus.label}</Badge> : '-'}</span>
                        </div>
                        <div className="flex">
                          <span className="text-muted-foreground w-20">등록일</span>
                          <span>{new Date(sr.createdAt).toLocaleDateString("ko-KR")}</span>
                        </div>
                        <div className="flex">
                          <span className="text-muted-foreground w-20">댓글/첨부</span>
                          <span>{sr._count?.comments || 0} / {sr._count?.attachments || 0}</span>
                        </div>
                      </div>
                    </div>
                    {/* ADMIN/MANAGER/ENGINEER만 접수 및 접수 수정 가능 */}
                    {hasAnyRole(["ADMIN", "MANAGER", "ENGINEER"]) ? (
                      <>
                        {sr.status === 'REQUESTED' && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="bg-[hsl(var(--sr-primary-dark))] text-white hover:bg-[hsl(var(--sr-sidebar-hover))]"
                            onClick={(e) => { e.stopPropagation(); router.push(`/srs/${sr.id}/intake`); }}
                          >
                            접수
                          </Button>
                        )}
                        {sr.status === 'IN_PROGRESS' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={(e) => { e.stopPropagation(); router.push(`/srs/${sr.id}/intake`); }}
                            title="접수 정보 수정"
                          >
                            <Clock className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">데이터가 없습니다.</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[hsl(var(--sr-border))] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select value={itemsPerPage} onValueChange={handleItemsPerPageChange}>
              <SelectTrigger className="w-[80px] h-9 sr-dropdown-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-[hsl(var(--sr-gray-medium))]">items per page</span>
          </div>
        </div>
      </div>

      <CreateSRDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onCreated={handleSRCreated} />
    </div>
  );
}
