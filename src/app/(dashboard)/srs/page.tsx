"use client";

import { useState, useEffect } from "react";
import { Plus, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";
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

interface SR {
  id: string;
  srNumber: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  client: {
    name: string;
  };
  requester: {
    name: string;
  };
  assignedTo?: {
    name: string;
  } | null;
  createdAt: string;
  _count?: {
    comments: number;
    attachments: number;
  };
}

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

const ITEMS_PER_PAGE = 20;

type SortField = "srNumber" | "title" | "client" | "priority" | "status" | "createdAt" | "dueDate";
type SortOrder = "asc" | "desc";

export default function SRsPage() {
  const [srs, setSrs] = useState<SR[]>([]);
  const [filteredSrs, setFilteredSrs] = useState<SR[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { toast } = useToast();

  // 고유한 고객사와 담당자 목록 추출
  const uniqueClients = Array.from(
    new Set(srs.map((sr) => JSON.stringify({ id: sr.client.name, name: sr.client.name })))
  ).map((str) => JSON.parse(str));

  const uniqueAssignees = Array.from(
    new Set(
      srs
        .filter((sr) => sr.assignedTo)
        .map((sr) => JSON.stringify({ id: sr.assignedTo!.name, name: sr.assignedTo!.name }))
    )
  ).map((str) => JSON.parse(str));

  const fetchSRs = async () => {
    console.log("🔍 [Client] fetchSRs 시작");
    try {
      console.log("🔍 [Client] fetch /api/srs 호출 중...");
      const response = await fetch("/api/srs");
      console.log("🔍 [Client] 응답 받음:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [Client] API 에러 응답:", errorData);
        throw new Error(
          errorData.error || 
          errorData.details || 
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("🔍 [Client] 데이터 받음:", { count: data.length });
      setSrs(data);
      setFilteredSrs(data);
      console.log("✅ [Client] SR 목록 로드 성공!");
    } catch (error) {
      console.error("❌ [Client] fetchSRs 에러:", error);
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({
        title: "오류",
        description: `SR 목록을 불러오는데 실패했습니다: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSRs();
  }, []);

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

  useEffect(() => {
    let filtered = srs;

    // 검색어 필터링
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sr) =>
          sr.srNumber.toLowerCase().includes(query) ||
          sr.title.toLowerCase().includes(query) ||
          sr.client.name.toLowerCase().includes(query) ||
          sr.requester.name.toLowerCase().includes(query) ||
          (sr.assignedTo?.name || "").toLowerCase().includes(query)
      );
    }

    // 상태 필터링
    if (statusFilter !== "all") {
      filtered = filtered.filter((sr) => sr.status === statusFilter);
    }

    // 우선순위 필터링
    if (priorityFilter !== "all") {
      filtered = filtered.filter((sr) => sr.priority === priorityFilter);
    }

    // 고객사 필터링
    if (clientFilter !== "all") {
      filtered = filtered.filter((sr) => sr.client.name === clientFilter);
    }

    // 담당자 필터링
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned") {
        filtered = filtered.filter((sr) => !sr.assignedTo);
      } else {
        filtered = filtered.filter((sr) => sr.assignedTo?.name === assigneeFilter);
      }
    }

    // 생성일 범위 필터링
    if (dateFromFilter) {
      const fromDate = new Date(dateFromFilter);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((sr) => new Date(sr.createdAt) >= fromDate);
    }

    if (dateToFilter) {
      const toDate = new Date(dateToFilter);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((sr) => new Date(sr.createdAt) <= toDate);
    }

    // 정렬
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "srNumber":
          aValue = a.srNumber;
          bValue = b.srNumber;
          break;
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "client":
          aValue = a.client.name.toLowerCase();
          bValue = b.client.name.toLowerCase();
          break;
        case "priority":
          const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder];
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder];
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        case "createdAt":
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case "dueDate":
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredSrs(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [statusFilter, priorityFilter, searchQuery, srs, sortField, sortOrder, clientFilter, assigneeFilter, dateFromFilter, dateToFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredSrs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedSrs = filteredSrs.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push("ellipsis");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push("ellipsis");
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("ellipsis");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push("ellipsis");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handleSRCreated = () => {
    fetchSRs();
    setIsCreateDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SR 관리</h1>
          <p className="text-muted-foreground">
            서비스 요청(SR)을 관리합니다.
          </p>
        </div>
        <PermissionGuard resource="SR" action="CREATE">
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            등록
          </Button>
        </PermissionGuard>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>SR 목록</CardTitle>
                <CardDescription>
                  총 {srs.length}개의 SR이 있습니다.
                  {(statusFilter !== "all" || priorityFilter !== "all" || searchQuery) &&
                    ` (필터링: ${filteredSrs.length}개)`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  고급 필터
                </Button>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
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
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[150px]">
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
            </div>

            {showAdvancedFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="client-filter" className="text-xs">고객사</Label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger id="client-filter">
                      <SelectValue placeholder="모든 고객사" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 고객사</SelectItem>
                      {uniqueClients.map((client) => (
                        <SelectItem key={client.id} value={client.name}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assignee-filter" className="text-xs">담당자</Label>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger id="assignee-filter">
                      <SelectValue placeholder="모든 담당자" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">모든 담당자</SelectItem>
                      <SelectItem value="unassigned">미배정</SelectItem>
                      {uniqueAssignees.map((assignee) => (
                        <SelectItem key={assignee.id} value={assignee.name}>
                          {assignee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-from" className="text-xs">생성일 시작</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-to" className="text-xs">생성일 종료</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SR 번호, 제목, 고객사, 요청자, 담당자로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    {srs.length === 0
                      ? "등록된 SR이 없습니다."
                      : "필터 조건에 맞는 SR이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSrs.map((sr) => {
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
                        <Link href={`/srs/${sr.id}`}>{sr.title}</Link>
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            {getPageNumbers().map((page, index) => (
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
                    isActive={currentPage === page}
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
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                }}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <CreateSRDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={handleSRCreated}
      />
    </div>
  );
}
