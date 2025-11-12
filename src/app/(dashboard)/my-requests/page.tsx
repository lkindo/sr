"use client";

import { useState, useEffect } from "react";
import { Clock, Filter, CheckCircle, XCircle, AlertCircle, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreateSRDialog } from "@/components/srs/CreateSRDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface MySR {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  requestedPriority: string;
  actualPriority?: string | null;
  requestedCompletionDate?: string | null;
  estimatedCompletionDate?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  intakeAt?: string | null;
  resolvedAt?: string | null;
  completedAt?: string | null;
  waitingMinutes: number;
  waitingHours: number;
  progressPercentage: number;
  client: {
    id: string;
    code: string;
    name: string;
  };
  serviceCategory: {
    id: string;
    categoryName: string;
    slaHours: number;
    priority: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  intakeBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: {
    comments: number;
    attachments: number;
  };
}

const statusLabels: Record<string, string> = {
  REQUESTED: "접수 대기",
  IN_PROGRESS: "진행 중",
  RESOLVED: "해결됨",
  COMPLETED: "완료",
  CONFIRMED: "확인됨",
  CANCELLED: "취소됨",
  ON_HOLD: "보류",
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  REQUESTED: "secondary",
  IN_PROGRESS: "default",
  RESOLVED: "default",
  COMPLETED: "outline",
  CONFIRMED: "outline",
  CANCELLED: "destructive",
  ON_HOLD: "secondary",
};

const priorityLabels: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

export default function MyRequestsPage() {
  const [srs, setSrs] = useState<MySR[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchMyRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      params.append("sortBy", sortBy);

      const response = await fetch(`/api/srs/my-requests?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch my requests");

      const data = await response.json();
      setSrs(data.srs || []);
    } catch (error) {
      console.error("Error fetching my requests:", error);
      toast({
        title: "오류",
        description: "요청 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [statusFilter, sortBy]);

  // 상태별 통계
  const stats = {
    total: srs.length,
    requested: srs.filter((sr) => sr.status === "REQUESTED").length,
    inProgress: srs.filter((sr) => sr.status === "IN_PROGRESS").length,
    completed: srs.filter((sr) => ["COMPLETED", "CONFIRMED"].includes(sr.status)).length,
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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">내 요청 SR</h1>
          <p className="text-muted-foreground">
            내가 요청한 SR의 진행 상황을 확인하세요.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>새 SR 요청</Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 요청
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              접수 대기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.requested}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              진행 중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            필터 및 정렬
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="REQUESTED">접수 대기</SelectItem>
                  <SelectItem value="IN_PROGRESS">진행 중</SelectItem>
                  <SelectItem value="RESOLVED">해결됨</SelectItem>
                  <SelectItem value="COMPLETED">완료</SelectItem>
                  <SelectItem value="CONFIRMED">확인됨</SelectItem>
                  <SelectItem value="CANCELLED">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">정렬 기준</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">요청일</SelectItem>
                  <SelectItem value="updatedAt">최근 업데이트</SelectItem>
                  <SelectItem value="status">상태</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SR 목록 */}
      <div className="space-y-4">
        {srs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">요청한 SR이 없습니다.</p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                첫 SR 요청하기
              </Button>
            </CardContent>
          </Card>
        ) : (
          srs.map((sr) => (
            <Card key={sr.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/srs/${sr.id}`}
                        className="text-xl font-semibold hover:underline"
                      >
                        {sr.srNumber}
                      </Link>
                      <Badge variant={statusColors[sr.status]}>
                        {statusLabels[sr.status]}
                      </Badge>
                      <Badge variant={priorityColors[sr.requestedPriority]}>
                        {priorityLabels[sr.requestedPriority]}
                      </Badge>
                    </div>
                    <p className="text-lg font-medium">{sr.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {sr.description}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {/* 진행률 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">진행률</span>
                      <span className="font-medium">{sr.progressPercentage}%</span>
                    </div>
                    <Progress value={sr.progressPercentage} className="h-2" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 고객사 및 카테고리 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">고객사:</span>
                        <span className="font-medium">{sr.client.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">카테고리:</span>
                        <span className="font-medium">{sr.serviceCategory.categoryName}</span>
                      </div>
                    </div>

                    {/* 담당자 정보 */}
                    <div className="space-y-2">
                      {sr.assignee ? (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">담당자:</span>
                            <span className="font-medium">{sr.assignee.name}</span>
                          </div>
                          {sr.intakeBy && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">접수자:</span>
                              <span>{sr.intakeBy.name}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <span className="text-orange-600">접수 대기 중</span>
                        </div>
                      )}
                    </div>

                    {/* 날짜 정보 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">요청:</span>
                        <span>
                          {formatDistanceToNow(new Date(sr.createdAt), {
                            addSuffix: true,
                            locale: ko,
                          })}
                        </span>
                      </div>
                      {sr.status === "REQUESTED" && sr.waitingHours > 0 && (
                        <div className="flex items-center gap-2 text-sm text-orange-600">
                          <AlertCircle className="h-4 w-4" />
                          <span>대기 중: {sr.waitingHours.toFixed(1)}시간</span>
                        </div>
                      )}
                      {sr.estimatedCompletionDate && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">예상 완료:</span>
                          <span className="font-medium">
                            {new Date(sr.estimatedCompletionDate).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 첨부파일 및 댓글 */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      {sr._count.attachments > 0 && (
                        <span>📎 첨부파일 {sr._count.attachments}개</span>
                      )}
                      {sr._count.comments > 0 && (
                        <span>💬 댓글 {sr._count.comments}개</span>
                      )}
                    </div>
                    <Link href={`/srs/${sr.id}`}>
                      <Button variant="outline" size="sm">
                        상세 보기
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* SR 생성 다이얼로그 */}
      <CreateSRDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={() => {
          setCreateDialogOpen(false);
          fetchMyRequests(); // SR 목록 새로고침
        }}
      />
    </div>
  );
}
