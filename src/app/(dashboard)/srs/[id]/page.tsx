"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, MessageSquare, Paperclip, Clock, TrendingUp, History, AlertCircle, User } from "lucide-react";
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
import { getSRDetailsAction } from "@/actions/sr.actions";
import type { SR } from "@prisma/client";
import { TableSkeleton } from "@/components/loading/TableSkeleton";
import { usePermissions } from "@/hooks/use-permissions";

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

export default function SRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const srId = params.id as string;
  
  // SR 상세 정보 타입 정의
  type SRDetails = SR & {
    client: { id: string; code: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
    intakeBy: { id: string; name: string; email: string; image: string | null } | null;
    serviceCategory: { id: string; categoryName: string };
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; name: string; email: string };
    }>;
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      user: { id: string; name: string; email: string };
    }>;
    attachments: Array<{
      id: string;
      fileName: string;
      fileSize: number;
      fileType: string;
      fileUrl: string;
      createdAt: Date;
    }>;
    statusHistory: Array<{
      id: string;
      currentStatus: string;
      previousStatus: string | null;
      changedAt: Date;
      user: { id: string; name: string; image: string | null };
    }>;
    _count: { comments: number; attachments: number };
  };
  
  const [sr, setSr] = useState<SRDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const { hasAnyRole } = usePermissions();

  useEffect(() => {
    if (srId) {
      const fetchSr = async () => {
        setIsLoading(true);
        const result = await getSRDetailsAction(srId);
        if (result.success) {
          setSr(result.data);
        } else {
          setError(result.error || "알 수 없는 오류가 발생했습니다.");
          toast({
            title: "오류",
            description: result.error || "알 수 없는 오류가 발생했습니다.",
            variant: "destructive",
          });
        }
        setIsLoading(false);
      };
      fetchSr();
    }
  }, [srId, toast]);

  const handleSRUpdated = () => {
    // Re-fetch data after update
    const fetchSr = async () => {
      const result = await getSRDetailsAction(srId);
      if (result.success) setSr(result.data);
    };
    fetchSr();
    setIsEditDialogOpen(false);
  };

  const handleSRDeleted = () => {
    toast({ title: "성공", description: "SR이 삭제되었습니다." });
    router.push("/srs");
  };

  if (isLoading) {
    return <TableSkeleton columns={5} />;
  }

  if (error || !sr) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">SR을 불러올 수 없습니다</h2>
        <p className="mt-2 text-muted-foreground">{error || "요청한 SR을 찾을 수 없거나 오류가 발생했습니다."}</p>
        <Button asChild className="mt-6">
          <Link href="/srs">목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  // Complete SR details component
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/srs"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight">{sr.srNumber}</h2>
              <Badge variant={statusColors[sr.status]}>
                {statusLabels[sr.status]}
              </Badge>
              <Badge variant={priorityColors[sr.requestedPriority]}>
                {priorityLabels[sr.requestedPriority]}
              </Badge>
            </div>
            <p className="text-2xl font-semibold mt-2">{sr.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* 접수 정보 수정 버튼 (IN_PROGRESS 상태이고 MANAGER/ADMIN 권한일 때만) */}
          {sr.status === "IN_PROGRESS" && hasAnyRole(["MANAGER", "ADMIN"]) && (
            <Button 
              variant="outline"
              onClick={() => router.push(`/srs/${srId}/intake`)}
            >
              <Clock className="mr-2 h-4 w-4" /> 접수 정보 수정
            </Button>
          )}
          <Button onClick={() => setIsEditDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> 수정
          </Button>
          <Button 
            onClick={() => setIsDeleteDialogOpen(true)} 
            variant="destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> 삭제
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 md:items-stretch">
        {/* Details Card */}
        <div className="md:col-span-2 space-y-6 flex flex-col">
          <div className="p-6 bg-white rounded-lg shadow border flex-1">
            <h3 className="text-lg font-semibold mb-4">상세 정보</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">요청 내용</h4>
                <p className="mt-1 text-foreground whitespace-pre-line">{sr.description}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">고객사</h4>
                  <p className="mt-1">{sr.client?.name || 'N/A'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">서비스 카테고리</h4>
                  <p className="mt-1">{sr.serviceCategory?.categoryName || 'N/A'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">요청자</h4>
                  <p className="mt-1">{sr.requester?.name || 'N/A'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">담당자</h4>
                  <p className="mt-1">{sr.assignee?.name || '미지정'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">요청 우선순위</h4>
                  <p className="mt-1">{priorityLabels[sr.requestedPriority]}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">실제 우선순위</h4>
                  <p className="mt-1">{sr.actualPriority ? priorityLabels[sr.actualPriority] : 'N/A'}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">요청 완료일</h4>
                  <p className="mt-1">
                    {sr.requestedCompletionDate 
                      ? new Date(sr.requestedCompletionDate).toLocaleDateString('ko-KR') 
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">예상 완료일</h4>
                  <p className="mt-1">
                    {sr.estimatedCompletionDate 
                      ? new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR') 
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">완료 일자</h4>
                  <p className="mt-1">
                    {sr.completedAt 
                      ? new Date(sr.completedAt).toLocaleDateString('ko-KR') 
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">SLA 마감일</h4>
                  <p className="mt-1">
                    {sr.dueDate 
                      ? new Date(sr.dueDate).toLocaleDateString('ko-KR') 
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Resolution Details if available */}
          {sr.resolutionDescription && (
            <div className="p-6 bg-white rounded-lg shadow border">
              <h3 className="text-lg font-semibold mb-4">해결 내용</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">해결 설명</h4>
                  <p className="mt-1 whitespace-pre-line">{sr.resolutionDescription}</p>
                </div>
                
                {sr.satisfactionRating && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">만족도</h4>
                      <p className="mt-1">{sr.satisfactionRating}/5</p>
                    </div>
                    
                    {sr.additionalFeedback && (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">추가 피드백</h4>
                        <p className="mt-1 whitespace-pre-line">{sr.additionalFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Stats and Additional Info Card */}
        <div className="space-y-6 flex flex-col">
          <div className="p-6 bg-white rounded-lg shadow border flex-1">
            <h3 className="text-lg font-semibold mb-4">요약 정보</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">요청일: {new Date(sr.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">수정일: {new Date(sr.updatedAt).toLocaleDateString('ko-KR')}</span>
              </div>
              
              {sr.intakeAt && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">접수일: {new Date(sr.intakeAt).toLocaleDateString('ko-KR')}</span>
                </div>
              )}
              
              {sr.intakeBy && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">접수자: {sr.intakeBy.name}</span>
                </div>
              )}
              
              <Separator className="my-2" />
              
              <div className="text-center">
                <p className="text-2xl font-bold text-[hsl(var(--sr-primary-dark))]">
                  {sr._count?.comments || 0}
                </p>
                <p className="text-sm text-muted-foreground">댓글 수</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-[hsl(var(--sr-primary-dark)))]">
                  {sr._count?.attachments || 0}
                </p>
                <p className="text-sm text-muted-foreground">첨부파일 수</p>
              </div>
              
              <Separator className="my-2" />
              
              <div className="text-center">
                <p className="text-2xl font-bold text-[hsl(var(--sr-accent-blue))]">
                  {sr.estimatedHours || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">예상 소요 시간</p>
              </div>
            </div>
          </div>
          
          {/* Status History if available */}
          {sr.statusHistory && sr.statusHistory.length > 0 && (
            <div className="p-6 bg-white rounded-lg shadow border">
              <h3 className="text-lg font-semibold mb-4">상태 변경 이력</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {sr.statusHistory.map((history) => (
                  <div key={history.id} className="flex justify-between text-sm">
                    <div>
                      <Badge variant={statusColors[history.currentStatus]}>
                        {statusLabels[history.currentStatus]}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(history.changedAt).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="comments" className="w-full">
        <TabsList>
          <TabsTrigger value="comments" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            댓글 ({sr._count?.comments || 0})
          </TabsTrigger>
          <TabsTrigger value="attachments" className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            첨부파일 ({sr._count?.attachments || 0})
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            활동 이력
          </TabsTrigger>
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
