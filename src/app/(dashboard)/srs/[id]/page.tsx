"use client";

import { useState, useEffect } from "react";
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
import { getSRDetailsAction } from "@/actions/sr.actions";
import { TableSkeleton } from "@/components/loading/TableSkeleton"; // Or a more specific skeleton

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
  
  const [sr, setSr] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

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

  // The rest of the component remains largely the same as the original client component
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/srs"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{sr.srNumber}</h2>
            <p className="text-sm text-muted-foreground mt-1">{sr.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsEditDialogOpen(true)}><Pencil className="mr-2 h-4 w-4" /> 수정</Button>
          <Button onClick={() => setIsDeleteDialogOpen(true)} variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> 삭제</Button>
        </div>
      </div>

      {/* The rest of the JSX for details, stats, and tabs */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Details Card */}
        <div className="md:col-span-2 p-6 bg-white rounded-lg shadow">
            <p>{sr.description}</p>
            {/* ... more details */}
        </div>
        {/* Stats Card */}
        <div className="p-6 bg-white rounded-lg shadow">
            {/* ... stats */}
        </div>
      </div>

      <Tabs defaultValue="comments" className="w-full">
        <TabsList>
          <TabsTrigger value="comments">댓글 ({sr._count?.comments || 0})</TabsTrigger>
          <TabsTrigger value="attachments">첨부파일 ({sr._count?.attachments || 0})</TabsTrigger>
          <TabsTrigger value="activities">활동 이력</TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="mt-6"><SRComments srId={sr.id} /></TabsContent>
        <TabsContent value="attachments" className="mt-6"><SRAttachments srId={sr.id} /></TabsContent>
        <TabsContent value="activities" className="mt-6"><SRActivities srId={sr.id} /></TabsContent>
      </Tabs>

      <EditSRDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} sr={sr} onUpdated={handleSRUpdated} />
      <DeleteSRDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} sr={sr} onDeleted={handleSRDeleted} />
    </div>
  );
}
