"use client";

import { useState } from "react";
import { Plus, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown, Edit, Clock, User, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateSRDialog } from "@/components/srs/CreateSRDialog";
import { useToast } from "@/hooks/use-toast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { getDueDateStatus } from "@/lib/date-utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useSRs, SR, UseSRsOptions } from "@/hooks/useSR"; // useSRs 훅 임포트 및 SR 인터페이스 임포트
import { useQueryClient } from "@tanstack/react-query"; // useQueryClient 훅 임포트
import { TableSkeleton } from "@/components/loading/TableSkeleton";

const statusLabels: Record<string, string> = {
  REQUESTED: "요청됨",
  INTAKE: "접수",
  IN_PROGRESS: "진행중",
  ON_HOLD: "대기",
  COMPLETED: "완료",
  CONFIRMED: "확인완료",
  REJECTED: "거부",
};

const priorityLabels: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  REQUESTED: "secondary",
  INTAKE: "default",
  IN_PROGRESS: "default",
  ON_HOLD: "secondary",
  COMPLETED: "default",
  CONFIRMED: "default",
  REJECTED: "destructive",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];
const DEFAULT_ITEMS_PER_PAGE = 20;

type SortField = "srNumber" | "title" | "client" | "priority" | "status" | "createdAt" | "dueDate";
type SortOrder = "asc" | "desc";

export default function SRsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const { toast } = useToast();
  const queryClient = useQueryClient(); // useQueryClient 훅 사용

  // 훅에 필터, 정렬, 페이징 옵션 전달
  const options: UseSRsOptions = {
    filters: {
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
      clientId: clientFilter === "all" ? undefined : clientFilter,
      assigneeId: assigneeFilter === "all" ? undefined : assigneeFilter === "unassigned" ? "unassigned" : assigneeFilter,
      searchQuery: searchQuery || undefined,
      dateFrom: dateFromFilter || undefined,
      dateTo: dateToFilter || undefined,
    },
    sort: {
      field: sortField,
      order: sortOrder
    },
    pagination: {
      page: currentPage,
      itemsPerPage: itemsPerPage
    }
  };

  const { data: srs, isLoading, isError, error, paginationInfo } = useSRs(options);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  const handleSRCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["srs"] });
    setIsCreateDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">SR 관리</h2>
            <p className="text-sm text-muted-foreground mt-1">
              서비스 요청(SR)을 관리합니다.
            </p>
          </div>
          <PermissionGuard resource="SR" action="CREATE">
            <Button onClick={() => setIsCreateDialogOpen(true)} className="sr-btn-template-primary">
              <Plus className="mr-2 h-4 w-4" />
              등록
            </Button>
          </PermissionGuard>
        </div>
        <TableSkeleton columns={11} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">SR 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">
            서비스 요청(SR)을 관리합니다.
          </p>
        </div>
        <PermissionGuard resource="SR" action="CREATE">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="sr-btn-template-primary">
            <Plus className="mr-2 h-4 w-4" />
            등록
          </Button>
        </PermissionGuard>
      </div>

      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))] mb-4">SR 목록</h3>

          {/* 빠른 필터 버튼 그룹 */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={statusFilter === "REQUESTED" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                // 토글 기능: 이미 선택되어 있으면 해제, 아니면 선택
                setStatusFilter(prev => prev === "REQUESTED" ? "all" : "REQUESTED");
              }}
              className="sr-btn-template"
            >
              <Clock className="mr-2 h-4 w-4" />
              접수 대기
              {paginationInfo.totalCount > 0 && (
                <Badge className="ml-2 bg-orange-600" variant="secondary">
                  {paginationInfo.totalCount}
                </Badge>
              )}
            </Button>

            <Button
              variant={assigneeFilter === session?.user?.name ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (session?.user?.name) {
                  // 토글 기능: 이미 선택되어 있으면 해제, 아니면 선택
                  setAssigneeFilter(prev => prev === session.user.name ? "all" : session.user.name || "all");
                }
              }}
              className="sr-btn-template"
            >
              <User className="mr-2 h-4 w-4" />
              내 담당
            </Button>

            <Button
              variant={priorityFilter === "CRITICAL" || priorityFilter === "HIGH" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                // 토글 기능: 이미 선택되어 있으면 해제, 아니면 CRITICAL 선택
                setPriorityFilter(prev => (prev === "CRITICAL" || prev === "HIGH") ? "all" : "CRITICAL");
              }}
              className="sr-btn-template"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              긴급
              {paginationInfo.totalCount > 0 && (
                <Badge className="ml-2" variant="destructive">
                  {paginationInfo.totalCount}
                </Badge>
              )}
            </Button>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="sr-btn-template"
            >
              <Filter className="mr-2 h-4 w-4" />
              고급 필터
            </Button>

            {(statusFilter !== "all" || priorityFilter !== "all" || assigneeFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setAssigneeFilter("all");
                  setClientFilter("all");
                  setDateFromFilter("");
                  setDateToFilter("");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="sr-btn-template"
              >
                필터 초기화
              </Button>
            )}
          </div>

          {/* 고급 필터 영역 */}
          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-[hsl(var(--sr-bg-light))] rounded-lg mb-4">
              <div className="space-y-2">
                <Label htmlFor="status-filter" className="text-xs font-medium">상태</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter" className="sr-input-template">
                    <SelectValue placeholder="상태 필터" />
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

              <div className="space-y-2">
                <Label htmlFor="priority-filter" className="text-xs font-medium">우선순위</Label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger id="priority-filter" className="sr-input-template">
                    <SelectValue placeholder="우선순위 필터" />
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

              <div className="space-y-2">
                <Label htmlFor="client-filter" className="text-xs font-medium">고객사</Label>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger id="client-filter" className="sr-input-template">
                    <SelectValue placeholder="모든 고객사" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">모든 고객사</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee-filter" className="text-xs font-medium">담당자</Label>
                <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                  <SelectTrigger id="assignee-filter" className="sr-input-template">
                    <SelectValue placeholder="모든 담당자" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">모든 담당자</SelectItem>
                    <SelectItem value="unassigned">미배정</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from" className="text-xs font-medium">생성일 시작</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  className="sr-input-template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to" className="text-xs font-medium">생성일 종료</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  className="sr-input-template"
                />
              </div>
            </div>
          )}

          {/* 검색 영역과 Total 카운트 */}
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SR 번호, 제목, 고객사, 요청자, 담당자로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 sr-input-template"
              />
            </div>
            <div className="text-sm text-muted-foreground ml-4">
              Total <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">{paginationInfo.totalCount}</span> items
            </div>
          </div>
        </div>

        {/* 테이블 영역 */}
        <div className="overflow-x-auto">
          <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("srNumber")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    SR 번호
                    {getSortIcon("srNumber")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("title")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    제목
                    {getSortIcon("title")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("client")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    고객사
                    {getSortIcon("client")}
                  </Button>
                </TableHead>
                <TableHead>요청자</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("priority")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    우선순위
                    {getSortIcon("priority")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("status")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    상태
                    {getSortIcon("status")}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("dueDate")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    마감일
                    {getSortIcon("dueDate")}
                  </Button>
                </TableHead>
                <TableHead>댓글/첨부</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("createdAt")}
                    className="h-8 p-0 font-medium hover:bg-transparent"
                  >
                    생성일
                    {getSortIcon("createdAt")}
                  </Button>
                </TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {srs && srs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    {paginationInfo.totalCount === 0
                      ? "등록된 SR이 없습니다."
                      : "필터 조건에 맞는 SR이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                srs?.map((sr) => {
                  const dueDateStatus = getDueDateStatus(sr.dueDate);
                  return (
                    <TableRow key={sr.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link
                          href={`/srs/${sr.id}`}
                          className="text-primary hover:underline"
                        >
                          {sr.srNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/srs/${sr.id}`} className="hover:text-primary">
                          {sr.title}
                        </Link>
                      </TableCell>
                      <TableCell>{sr.client.name}</TableCell>
                      <TableCell>{sr.requester.name}</TableCell>
                      <TableCell>{sr.assignedTo?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={priorityColors[sr.priority]}>
                          {priorityLabels[sr.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[sr.status]}>
                          {statusLabels[sr.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dueDateStatus ? (
                          <Badge variant={dueDateStatus.variant}>
                            {dueDateStatus.label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {sr._count?.comments || 0} / {sr._count?.attachments || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(sr.createdAt).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        {sr.status === "REQUESTED" ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/srs/${sr.id}/intake`);
                            }}
                            className="sr-btn-template-primary"
                          >
                            접수
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/srs/${sr.id}`);
                            }}
                            className="sr-btn-template"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 리스트 하단 - 페이지당 항목 수와 페이지네이션 */}
        <div className="px-6 py-4 border-t border-[hsl(var(--sr-border))] flex items-center justify-between">
          {/* 페이지당 항목 수 선택 */}
          <div className="flex items-center gap-2">
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[80px] h-9 sr-dropdown-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">items per page</span>
          </div>

          {/* 페이지네이션 */}
          {paginationInfo.totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (paginationInfo.hasPrevPage) setCurrentPage(prev => prev - 1);
                    }}
                    className={!paginationInfo.hasPrevPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {Array.from({ length: Math.min(paginationInfo.totalPages, 7) }, (_, i) => {
                  let pageNum: number | string;
                  const totalPages = paginationInfo.totalPages;
                  const currentPage = paginationInfo.currentPage;
                  
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (currentPage <= 4) {
                    if (i < 5) {
                      pageNum = i + 1;
                    } else if (i === 5) {
                      pageNum = 'ellipsis';
                    } else {
                      pageNum = totalPages;
                    }
                  } else if (currentPage >= totalPages - 3) {
                    if (i === 0) {
                      pageNum = 1;
                    } else if (i === 1) {
                      pageNum = 'ellipsis';
                    } else {
                      pageNum = totalPages - 4 + i;
                    }
                  } else {
                    if (i === 0) {
                      pageNum = 1;
                    } else if (i === 1) {
                      pageNum = 'ellipsis';
                    } else if (i === 2) {
                      pageNum = currentPage - 1;
                    } else if (i === 3) {
                      pageNum = currentPage;
                    } else if (i === 4) {
                      pageNum = currentPage + 1;
                    } else if (i === 5) {
                      pageNum = 'ellipsis';
                    } else {
                      pageNum = totalPages;
                    }
                  }
                  
                  return pageNum;
                }).map((page, index) => (
                  <PaginationItem key={index}>
                    {page === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page as number);
                        }}
                        isActive={paginationInfo.currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (paginationInfo.hasNextPage) setCurrentPage(prev => prev + 1);
                    }}
                    className={!paginationInfo.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
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
