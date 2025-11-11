"use client";

import { useState, useEffect } from "react";
import { Plus, Filter } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface SR {
  id: string;
  srNumber: string;
  title: string;
  status: string;
  priority: string;
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

export default function SRsPage() {
  const [srs, setSrs] = useState<SR[]>([]);
  const [filteredSrs, setFilteredSrs] = useState<SR[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const { toast } = useToast();

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

  useEffect(() => {
    let filtered = srs;

    if (statusFilter !== "all") {
      filtered = filtered.filter((sr) => sr.status === statusFilter);
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter((sr) => sr.priority === priorityFilter);
    }

    setFilteredSrs(filtered);
  }, [statusFilter, priorityFilter, srs]);

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>SR 목록</CardTitle>
              <CardDescription>
                총 {srs.length}개의 SR이 있습니다.
                {(statusFilter !== "all" || priorityFilter !== "all") &&
                  ` (필터링: ${filteredSrs.length}개)`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SR 번호</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>고객사</TableHead>
                <TableHead>요청자</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>우선순위</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>댓글/첨부</TableHead>
                <TableHead>생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSrs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    {srs.length === 0
                      ? "등록된 SR이 없습니다."
                      : "필터 조건에 맞는 SR이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSrs.map((sr) => (
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
                      <span className="text-sm text-muted-foreground">
                        {sr._count?.comments || 0} / {sr._count?.attachments || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(sr.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateSRDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={handleSRCreated}
      />
    </div>
  );
}
