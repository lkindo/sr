"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileUpload } from "@/components/ui/file-upload";
import { getClientsForSelection } from "@/actions/client.actions";
import { getServiceCategoriesForSelection } from "@/actions/service-category.actions";
import { updateSRAction } from "@/actions/sr.actions";
import { getProfileAction } from "@/actions/user.actions";
import { usePermissions } from "@/hooks/use-permissions";
import { Download, Trash2, FileIcon } from "lucide-react";

interface Client {
  id: string;
  code: string;
  name: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  createdAt: Date | string;
}

interface SR {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedPriority?: string | null;
  requestedCompletionDate?: Date | null | string;
  estimatedCompletionDate?: Date | null | string;
  dueDate?: Date | null | string;
  completedAt?: Date | null;
  expectedCompletionDate?: Date | null | string;
  clientId?: string;
  client?: {
    id: string;
    code: string;
    name: string;
  };
  assignedTo?: {
    id: string;
  } | null;
  category?: {
    id: string;
    name: string;
  } | null;
  serviceCategory?: {
    id: string;
    categoryName: string;
  } | null;
  attachments?: Attachment[];
}


interface ServiceCategory {
  id: string;
  categoryName: string;
}

interface EditSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sr: SR;
  onUpdated: () => void;
}

export function EditSRDialog({
  open,
  onOpenChange,
  sr,
  onUpdated,
}: EditSRDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState<string>("MEDIUM");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [requestedCompletionDate, setRequestedCompletionDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  // const { data: session } = useSession();
  const { hasAnyRole } = usePermissions();

  // CLIENT_ADMIN, CLIENT_USER인지 확인
  const isClientUser = hasAnyRole(["CLIENT_ADMIN", "CLIENT_USER"]);
  const canSelectClient = hasAnyRole(["ADMIN", "MANAGER", "ENGINEER"]);

  const fetchClients = useCallback(async () => {
    // CLIENT_ADMIN, CLIENT_USER인 경우 자신의 고객사만 가져오기
    if (isClientUser) {
      const profileResult = await getProfileAction();
      if (profileResult.success && profileResult.data) {
        const userClients = (profileResult.data as { clients?: Array<{ client: { id: string; code: string; name: string } }> }).clients || [];
        if (userClients.length > 0) {
          const userClient = userClients[0].client;
          setClients([{
            id: userClient.id,
            code: userClient.code,
            name: userClient.name,
          }]);
          // 고객사는 수정 불가이므로 현재 SR의 고객사 사용
          if (sr.clientId) {
            setClientId(sr.clientId);
          }
        }
      }
    } else {
      // ADMIN, MANAGER, ENGINEER인 경우 모든 고객사 가져오기
      const result = await getClientsForSelection();
      if (result.success) {
        setClients(result.data as Client[]);
      }
    }
  }, [isClientUser, sr.clientId]);


  const fetchCategories = useCallback(async () => {
    const result = await getServiceCategoriesForSelection();
    if (result.success && result.data) {
      setCategories(result.data.map((cat) => ({ id: cat.id, categoryName: cat.categoryName })));
    } else {
      toast({
        title: "오류",
        description: "서비스 카테고리 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchExistingAttachments = useCallback(async (srId: string) => {
    try {
      const response = await fetch(`/api/srs/${srId}`);
      if (response.ok) {
        const data = await response.json();
        setExistingAttachments(data.attachments || []);
      }
    } catch (error) {
      // console.error("첨부 파일 로드 실패");
    }
  }, []);

  // 안정적인 의존성 값 생성
  const srId = useMemo(() => sr?.id || "", [sr?.id]);

  useEffect(() => {
    if (!open || !sr) return;

    // 관리자는 모든 상태에서 수정 가능, 그 외는 REQUESTED 상태에서만 수정 가능
    const isAdmin = hasAnyRole(["ADMIN"]);
    if (sr.status !== "REQUESTED" && !isAdmin) {
      toast({
        title: "알림",
        description: "SR 수정은 '요청됨' 상태인 경우에만 가능합니다.",
        variant: "default",
      });
      onOpenChange(false);
      return;
    }

    setTitle(sr.title);
    setDescription(sr.description);
    setClientId(sr.clientId || sr.client?.id || "");
    // serviceCategory 또는 category 중 하나를 사용
    setCategoryId(sr.serviceCategory?.id || sr.category?.id || "");
    setRequestedPriority(sr.requestedPriority || sr.priority || "MEDIUM");
    setPriority(sr.priority);
    setStatus(sr.status);
    setRequestedCompletionDate(
      sr.requestedCompletionDate
        ? new Date(sr.requestedCompletionDate).toISOString().split("T")[0]
        : ""
    );
    setFiles([]);
    // 기존 첨부 파일 로드
    if (sr.attachments && sr.attachments.length > 0) {
      setExistingAttachments(sr.attachments);
    } else {
      // SR 상세 정보에서 첨부 파일 가져오기
      fetchExistingAttachments(sr.id);
    }
    fetchClients();
    fetchCategories();

  }, [open, srId]);

  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleDeleteAttachmentClick = (attachmentId: string) => {
    setFileToDelete(attachmentId);
  };

  const executeDeleteAttachment = async () => {
    if (!fileToDelete) return;

    const attachmentId = fileToDelete;
    setFileToDelete(null);

    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "파일 삭제 실패" }));
        throw new Error(errorData.error || `파일 삭제 실패 (${response.status})`);
      }

      setExistingAttachments(existingAttachments.filter((a) => a.id !== attachmentId));

      toast({
        title: "성공",
        description: "파일이 삭제되었습니다.",
      });
    } catch (error) {

      toast({
        title: "오류",
        description: error instanceof Error ? error.message : "파일 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const uploadAttachments = async (srId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch(`/api/srs/${srId}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload attachments");
      }
    } catch (error) {

      toast({
        title: "경고",
        description: "SR은 수정되었으나 첨부파일 업로드에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 관리자는 모든 상태에서 수정 가능, 그 외는 REQUESTED 상태에서만 수정 가능
    const isAdmin = hasAnyRole(["ADMIN"]);
    if (sr.status !== "REQUESTED" && !isAdmin) {
      toast({
        title: "오류",
        description: "SR 수정은 '요청됨' 상태인 경우에만 가능합니다.",
        variant: "destructive",
      });
      return;
    }

    if (title.length < 5) {
      toast({
        title: "오류",
        description: "제목은 최소 5자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (description.length < 10) {
      toast({
        title: "오류",
        description: "설명은 최소 10자 이상이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("status", status);
    // priority가 빈 문자열이 아닐 때만 추가
    if (priority && priority.trim() !== "") {
      formData.append("priority", priority);
    }
    formData.append("serviceCategoryId", categoryId || "");
    if (requestedPriority && requestedPriority.trim() !== "") {
      formData.append("requestedPriority", requestedPriority);
    }
    if (requestedCompletionDate) {
      formData.append("requestedCompletionDate", requestedCompletionDate);
    }

    try {
      const result = await updateSRAction(sr.id, formData);

      if (!result.success) {
        throw new Error(result.error || "SR 수정에 실패했습니다.");
      }

      // Upload attachments if any
      if (files.length > 0) {
        await uploadAttachments(sr.id, files);
        // 업로드 후 기존 첨부 파일 목록 다시 로드
        await fetchExistingAttachments(sr.id);
      }

      toast({
        title: "성공",
        description: "SR이 수정되었습니다.",
      });

      onOpenChange(false); // 다이얼로그 즉시 닫기

      // 병렬 처리로 지연 최소화
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sr", srId] }),
        Promise.resolve(router.refresh())
      ]);

      onUpdated();
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error ? error.message : "SR 수정에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SR 수정</DialogTitle>
          <DialogDescription>
            SR 정보를 수정합니다. 제목, 설명, 고객사, 서비스 카테고리는 필수입니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">제목 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="SR 제목을 입력하세요 (최소 5자)"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명 *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="SR 상세 내용을 입력하세요 (최소 10자)"
                required
                disabled={loading}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">고객사 *</Label>
                <Select
                  value={clientId}
                  onValueChange={setClientId}
                  disabled={loading || !canSelectClient}
                >
                  <SelectTrigger id="client">
                    <SelectValue placeholder="고객사를 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} ({client.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canSelectClient && (
                  <p className="text-xs text-muted-foreground">
                    고객사는 수정할 수 없습니다.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">서비스 카테고리 *</Label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={loading || categories.length === 0}
                >
                  <SelectTrigger id="category">
                    <SelectValue
                      placeholder={
                        categories.length === 0
                          ? "카테고리가 없습니다"
                          : categoryId
                            ? categories.find((c) => c.id === categoryId)?.categoryName || "카테고리를 선택"
                            : "카테고리를 선택"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="requestedPriority">희망 우선순위 *</Label>
                <Select
                  value={requestedPriority}
                  onValueChange={setRequestedPriority}
                  disabled={loading}
                >
                  <SelectTrigger id="requestedPriority">
                    <SelectValue placeholder="우선순위 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">긴급</SelectItem>
                    <SelectItem value="HIGH">높음</SelectItem>
                    <SelectItem value="MEDIUM">보통</SelectItem>
                    <SelectItem value="LOW">낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestedCompletionDate">
                  희망 완료일 (선택)
                </Label>
                <Input
                  id="requestedCompletionDate"
                  type="date"
                  value={requestedCompletionDate}
                  onChange={(e) =>
                    setRequestedCompletionDate(e.target.value)
                  }
                  disabled={loading}
                  placeholder="언제까지 완료되길 원하시나요?"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>첨부파일 (선택사항)</Label>

              {/* 기존 첨부 파일 목록 */}
              {existingAttachments.length > 0 && (
                <div className="space-y-2 mb-4">
                  <Label className="text-sm text-muted-foreground">기존 첨부 파일</Label>
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    {existingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.fileSize)} •{" "}
                              {new Date(attachment.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(attachment.fileUrl, "_blank")}
                            disabled={loading}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachmentClick(attachment.id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 새 파일 업로드 */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">
                  {existingAttachments.length > 0 ? "새 파일 추가" : "파일 업로드"}
                </Label>
                <FileUpload
                  value={files}
                  onChange={setFiles}
                  maxSize={10}
                  maxFiles={5}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>파일 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 첨부파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteAttachment} className="bg-destructive hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
