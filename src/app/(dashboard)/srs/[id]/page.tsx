"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SRComments } from "@/components/srs/SRComments";
import { SRActivities } from "@/components/srs/SRActivities";
import { SRAttachments } from "@/components/srs/SRAttachments";
import { EditSRDialog } from "@/components/srs/EditSRDialog";
import { DeleteSRDialog } from "@/components/srs/DeleteSRDialog";
import { useToast } from "@/hooks/use-toast";

interface SR {
  id: string;
  srNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedCompletionDate?: string;
  dueDate?: string;
  actualCompletionDate?: string;
  client: {
    id: string;
    name: string;
    code: string;
  };
  category?: {
    id: string;
    name: string;
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
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

export default function SRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [sr, setSr] = useState<SR | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchSR = async () => {
    try {
      const response = await fetch(`/api/srs/${params.id}`);
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "오류",
            description: "SR을 찾을 수 없습니다.",
            variant: "destructive",
          });
          router.push("/srs");
          return;
        }
        throw new Error("Failed to fetch SR");
      }
      const data = await response.json();
      setSr(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "SR을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchSR();
    }
  }, [params.id]);

  const handleSRUpdated = () => {
    fetchSR();
    setIsEditDialogOpen(false);
  };

  const handleSRDeleted = () => {
    toast({
      title: "성공",
      description: "SR이 삭제되었습니다.",
    });
    router.push("/srs");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">SR을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/srs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {sr.srNumber}
            </h1>
            <p className="text-muted-foreground">{sr.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            수정
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            삭제
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>SR 상세 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>통계</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
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
