"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, MessageSquare, Paperclip, Clock, TrendingUp, History, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SRComments } from "@/components/srs/SRComments";
import { SRActivities } from "@/components/srs/SRActivities";
import { SRAttachments } from "@/components/srs/SRAttachments";
import { EditSRDialog } from "@/components/srs/EditSRDialog";
import { DeleteSRDialog } from "@/components/srs/DeleteSRDialog";
import { useToast } from "@/hooks/use-toast";
import { useSR } from "@/hooks/useSR"; // useSR 훅 임포트
import { useQueryClient } from "@tanstack/react-query"; // useQueryClient 훅 임포트

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

export default function SRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const srId = params.id as string;
  const { data: sr, isLoading, isError, error } = useSR(srId); // useSR 훅 사용
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient(); // useQueryClient 훅 사용

  const handleSRUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["sr", srId] });
    setIsEditDialogOpen(false);
  };


  // 통계 계산
  const calculateStatistics = () => {
    if (!sr) return null;

    const createdAt = new Date(sr.createdAt);
    const now = new Date();

    // 경과 시간 (일)
    const elapsedDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // 완료까지 남은 시간
    let remainingDays: number | null = null;
    if (sr.dueDate) {
      const dueDate = new Date(sr.dueDate);
      remainingDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // 실제 소요 시간
    let actualDays: number | null = null;
    if (sr.actualCompletionDate) {
      const completionDate = new Date(sr.actualCompletionDate);
      actualDays = Math.floor((completionDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    // 예상 대비 진행률
    let progressRate: number | null = null;
    if (sr.dueDate && !sr.actualCompletionDate) {
      const dueDate = new Date(sr.dueDate);
      const totalDays = (dueDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (totalDays > 0) {
        progressRate = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
      }
    }

    // SLA 준수 여부
    let slaCompliance: "onTime" | "delayed" | "pending" = "pending";
    if (sr.actualCompletionDate && sr.dueDate) {
      const completionDate = new Date(sr.actualCompletionDate);
      const dueDate = new Date(sr.dueDate);
      slaCompliance = completionDate <= dueDate ? "onTime" : "delayed";
    }

    return {
      elapsedDays,
      remainingDays,
      actualDays,
      progressRate,
      slaCompliance,
    };
  };

  const stats = calculateStatistics();

  // useSR 훅에서 에러 발생 시 처리
  if (isError) {
    toast({
      title: "오류",
      description: error?.message || "SR을 불러오는데 실패했습니다.",
      variant: "destructive",
    });
    router.push("/srs");
    return null; // 에러 발생 시 컴포넌트 렌더링 중단
  }

  if (isLoading) {
    return (
      <div className="sr-loading">
        <div className="sr-loading-spinner"></div>
        <p className="text-muted-foreground">SR 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="sr-empty-state">
        <AlertCircle className="sr-empty-state-icon" />
        <h3 className="sr-empty-state-title">SR을 찾을 수 없습니다</h3>
        <p className="sr-empty-state-description">
          요청하신 SR이 존재하지 않거나 삭제되었을 수 있습니다.
        </p>
        <Button asChild>
          <Link href="/srs">SR 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const handleSRDeleted = () => {
    toast({
      title: "성공",
      description: "SR이 삭제되었습니다.",
    });
    router.push("/srs");
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/srs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">
              {sr.srNumber}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{sr.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsEditDialogOpen(true)}
            className="sr-btn-template"
          >
            <Pencil className="mr-2 h-4 w-4" />
            수정
          </Button>
          <Button
            onClick={() => setIsDeleteDialogOpen(true)}
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 sr-card-template bg-white">
          {/* 카드 헤더 */}
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">SR 상세 정보</h3>
          </div>

          {/* 카드 내용 */}
          <div className="px-6 py-5 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                설명
              </h3>
              <p className="text-sm whitespace-pre-wrap">{sr.description}</p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  우선순위
                </h3>
                <Badge variant={priorityColors[sr.priority]}>
                  {priorityLabels[sr.priority]}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  상태
                </h3>
                <Badge variant={statusColors[sr.status]}>
                  {statusLabels[sr.status]}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  고객사
                </h3>
                <p className="text-sm">
                  {sr.client.name} ({sr.client.code})
                </p>
              </div>
              {sr.category && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    서비스 카테고리
                  </h3>
                  <p className="text-sm">{sr.category.name}</p>
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  요청자
                </h3>
                <p className="text-sm">{sr.requester.name}</p>
                <p className="text-xs text-muted-foreground">
                  {sr.requester.email}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  담당자
                </h3>
                {sr.assignedTo ? (
                  <>
                    <p className="text-sm">{sr.assignedTo.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sr.assignedTo.email}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">미배정</p>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  생성일
                </h3>
                <p className="text-sm">
                  {new Date(sr.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  수정일
                </h3>
                <p className="text-sm">
                  {new Date(sr.updatedAt).toLocaleString("ko-KR")}
                </p>
              </div>
            </div>

            {(sr.requestedCompletionDate || sr.dueDate || sr.actualCompletionDate) && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {sr.requestedCompletionDate && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          요청 완료 날짜
                        </h3>
                        <p className="text-sm">
                          {new Date(
                            sr.requestedCompletionDate
                          ).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    )}
                    {sr.dueDate && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          마감일
                        </h3>
                        <p className="text-sm">
                          {new Date(sr.dueDate).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    )}
                  </div>
                  {sr.actualCompletionDate && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          실제 완료 날짜
                        </h3>
                        <p className="text-sm">
                          {new Date(sr.actualCompletionDate).toLocaleDateString(
                            "ko-KR"
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sr-card-template bg-white">
          {/* 카드 헤더 */}
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">통계</h3>
          </div>

          {/* 카드 내용 */}
          <div className="px-6 py-5 space-y-4">
            {/* 기본 통계 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">댓글</span>
              </div>
              <span className="text-2xl font-bold">
                {sr._count?.comments || 0}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">첨부파일</span>
              </div>
              <span className="text-2xl font-bold">
                {sr._count?.attachments || 0}
              </span>
            </div>

            {/* 시간 통계 */}
            {stats && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">경과 시간</span>
                  </div>
                  <span className="text-2xl font-bold">
                    {stats.elapsedDays}일
                  </span>
                </div>

                {stats.remainingDays !== null && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">남은 시간</span>
                      </div>
                      <span
                        className={`text-2xl font-bold ${
                          stats.remainingDays < 0
                            ? "text-destructive"
                            : stats.remainingDays <= 3
                            ? "text-orange-500"
                            : ""
                        }`}
                      >
                        {stats.remainingDays < 0
                          ? `${Math.abs(stats.remainingDays)}일 초과`
                          : `${stats.remainingDays}일`}
                      </span>
                    </div>
                  </>
                )}

                {stats.actualDays !== null && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">처리 소요</span>
                      </div>
                      <span className="text-2xl font-bold">
                        {stats.actualDays}일
                      </span>
                    </div>
                  </>
                )}

                {stats.progressRate !== null && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">진행률</span>
                        <span className="text-sm font-medium">
                          {stats.progressRate}%
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            stats.progressRate > 100
                              ? "bg-destructive"
                              : stats.progressRate > 80
                              ? "bg-orange-500"
                              : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(stats.progressRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {stats.slaCompliance !== "pending" && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm">SLA 준수</span>
                      <span
                        className={`text-sm font-medium ${
                          stats.slaCompliance === "onTime"
                            ? "text-green-600"
                            : "text-destructive"
                        }`}
                      >
                        {stats.slaCompliance === "onTime" ? "준수" : "미준수"}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="comments" className="w-full">
        <TabsList>
          <TabsTrigger value="comments">
            댓글 ({sr._count?.comments || 0})
          </TabsTrigger>
          <TabsTrigger value="attachments">
            첨부파일 ({sr._count?.attachments || 0})
          </TabsTrigger>
          <TabsTrigger value="activities">활동 이력</TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="mt-6">
          <SRComments srId={sr.id} />
        </TabsContent>
        <TabsContent value="attachments" className="mt-6">
          <SRAttachments srId={sr.id} />
        </TabsContent>
        <TabsContent value="activities" className="mt-6">
          <SRActivities srId={sr.id} />
        </TabsContent>
      </Tabs>

      <EditSRDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        sr={sr}
        onUpdated={handleSRUpdated}
      />

      <DeleteSRDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        sr={sr}
        onDeleted={handleSRDeleted}
      />
    </div>
  );
}
