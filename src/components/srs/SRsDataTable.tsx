"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown, Edit, Clock, User, AlertCircle } from "lucide-react";
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

// This component now receives data fetched from the server as props
export function SRsDataTable({ srs, paginationInfo, clients, users }: { srs: any[], paginationInfo: any, clients: any[], users: any[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">SR 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">서비스 요청(SR)을 관리합니다.</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="sr-btn-template-primary">
          <Plus className="mr-2 h-4 w-4" /> 등록
        </Button>
      </div>

      <div className="sr-card-template bg-white">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))] mb-4">SR 목록</h3>
          
          {/* Filters and Search */}
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SR 번호, 제목 등으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 sr-input-template"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                <SelectTrigger className="sr-input-template w-[150px]">
                  <SelectValue placeholder="상태 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 상태</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={resetFilters}>필터 초기화</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead><Button variant="ghost" onClick={() => handleSort("srNumber")}>SR 번호{getSortIcon("srNumber")}</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => handleSort("title")}>제목{getSortIcon("title")}</Button></TableHead>
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
                  const dueDateStatus = getDueDateStatus(sr.dueDate);
                  return (
                    <TableRow key={sr.id} className="cursor-pointer" onClick={() => router.push(`/srs/${sr.id}`)}>
                      <TableCell className="font-medium text-primary hover:underline"><Link href={`/srs/${sr.id}`}>{sr.srNumber}</Link></TableCell>
                      <TableCell>{sr.title}</TableCell>
                      <TableCell>{sr.client.name}</TableCell>
                      <TableCell>{sr.requester.name}</TableCell>
                      <TableCell>{sr.assignee?.name || "-"}</TableCell>
                      <TableCell><Badge variant={priorityColors[sr.priority]}>{priorityLabels[sr.priority]}</Badge></TableCell>
                      <TableCell><Badge variant={statusColors[sr.status]}>{statusLabels[sr.status]}</Badge></TableCell>
                      <TableCell>{dueDateStatus ? <Badge variant={dueDateStatus.variant}>{dueDateStatus.label}</Badge> : '-'}</TableCell>
                      <TableCell>{sr._count?.comments || 0} / {sr._count?.attachments || 0}</TableCell>
                      <TableCell>{new Date(sr.createdAt).toLocaleDateString("ko-KR")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/srs/${sr.id}`); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
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

        <div className="px-6 py-4 border-t border-[hsl(var(--sr-border))] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select value={itemsPerPage} onValueChange={handleItemsPerPageChange}>
              <SelectTrigger className="w-[80px] h-9 sr-dropdown-template"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">items per page</span>
          </div>

          {paginationInfo && paginationInfo.totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (paginationInfo.hasPrevPage) handlePagination(paginationInfo.currentPage - 1); }} className={!paginationInfo.hasPrevPage ? "pointer-events-none opacity-50" : ""} />
                </PaginationItem>
                {/* Simplified pagination logic for brevity */}
                {[...Array(paginationInfo.totalPages)].map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); handlePagination(i + 1); }} isActive={paginationInfo.currentPage === i + 1}>
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); if (paginationInfo.hasNextPage) handlePagination(paginationInfo.currentPage + 1); }} className={!paginationInfo.hasNextPage ? "pointer-events-none opacity-50" : ""} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      <CreateSRDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} onCreated={handleSRCreated} />
    </div>
  );
}
