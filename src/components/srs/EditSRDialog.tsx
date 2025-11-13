"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface SR {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  expectedCompletionDate?: string;
  dueDate?: string;
  assignedTo?: {
    id: string;
  } | null;
  category?: {
    id: string;
    name: string;
  } | null;
}

interface User {
  id: string;
  name: string;
  email: string;
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
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { data: session } = useSession();

  // SR 할당 권한 확인
  const canAssignSR = session?.user?.permissions?.includes("SR.ASSIGN") ?? false;

  const fetchUsers = useCallback(async () => {
    try {
      // SR 처리 가능한 사용자만 조회 (SR 관련 모든 권한 보유)
      const response = await fetch("/api/users/sr-handlers");
      if (!response.ok) throw new Error("Failed to fetch SR handlers");
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "SR 담당자 목록을 불러오는데 실패했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/service-categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "서비스 카테고리 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (open && sr) {
      setTitle(sr.title);
      setDescription(sr.description);
      setStatus(sr.status);
      setPriority(sr.priority);
      setCategoryId(sr.category?.id || "");
      setAssignedToId(sr.assignedTo?.id || "");
      setExpectedCompletionDate(
        sr.expectedCompletionDate
          ? new Date(sr.expectedCompletionDate).toISOString().split("T")[0]
          : ""
      );
      setDueDate(
        sr.dueDate
          ? new Date(sr.dueDate).toISOString().split("T")[0]
          : ""
      );
      setChangeReason("");
      setFiles([]);
      fetchUsers();
      fetchCategories();
    }
  }, [open, sr, fetchUsers, fetchCategories]);

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
      console.error("첨부파일 업로드 실패:", error);
      toast({
        title: "경고",
        description: "SR은 수정되었으나 첨부파일 업로드에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    // If status is changed, require a reason
    if (status !== sr.status && !changeReason.trim()) {
      toast({
        title: "오류",
        description: "상태 변경 시 변경 사유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    // 날짜 유효성 검증
    if (expectedCompletionDate && dueDate) {
      const expectedDate = new Date(expectedCompletionDate);
      const dueDateValue = new Date(dueDate);

      if (dueDateValue < expectedDate) {
        toast({
          title: "오류",
          description: "마감일은 예상 완료일과 같거나 이후여야 합니다.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/srs/${sr.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          status,
          priority,
          serviceCategoryId: categoryId || null,
          assignedToId: assignedToId || null,
          expectedCompletionDate: expectedCompletionDate || null,
          dueDate: dueDate || null,
          changeReason: changeReason || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update SR");
      }

      // Upload attachments if any
      if (files.length > 0) {
        await uploadAttachments(sr.id, files);
      }

      toast({
        title: "성공",
        description: "SR이 수정되었습니다.",
      });

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
            SR 정보를 수정합니다. 상태 변경 시 변경 사유를 입력해주세요.
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
                placeholder="SR 제목"
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
                placeholder="SR 상세 내용"
                required
                disabled={loading}
                rows={5}
              />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">상태 *</Label>
                <Select
                  value={status}
                  onValueChange={setStatus}
                  disabled={loading}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REQUESTED">요청됨</SelectItem>
                    <SelectItem value="INTAKE">접수</SelectItem>
                    <SelectItem value="IN_PROGRESS">진행중</SelectItem>
                    <SelectItem value="ON_HOLD">대기</SelectItem>
                    <SelectItem value="COMPLETED">완료</SelectItem>
                    <SelectItem value="CONFIRMED">확인완료</SelectItem>
                    <SelectItem value="REJECTED">거부</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">우선순위 *</Label>
                <Select
                  value={priority}
                  onValueChange={setPriority}
                  disabled={loading}
                >
                  <SelectTrigger id="priority">
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
            </div>

            {status !== sr.status && (
              <div className="space-y-2">
                <Label htmlFor="changeReason">상태 변경 사유 *</Label>
                <Textarea
                  id="changeReason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="상태를 변경하는 이유를 입력하세요"
                  required
                  disabled={loading}
                  rows={2}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="assignedTo">
                담당자
                {!canAssignSR && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (할당 권한 없음)
                  </span>
                )}
              </Label>
              <Select
                value={assignedToId || "unassigned"}
                onValueChange={(value) => setAssignedToId(value === "unassigned" ? "" : value)}
                disabled={loading || !canAssignSR}
              >
                <SelectTrigger id="assignedTo">
                  <SelectValue placeholder={canAssignSR ? "담당자 선택" : "할당 권한이 없습니다"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">미배정</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expectedCompletionDate">예상 완료일</Label>
                <Input
                  id="expectedCompletionDate"
                  type="date"
                  value={expectedCompletionDate}
                  onChange={(e) => setExpectedCompletionDate(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">마감일</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>첨부파일 추가 (선택사항)</Label>
              <FileUpload
                value={files}
                onChange={setFiles}
                maxSize={10}
                maxFiles={5}
                disabled={loading}
              />
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
    </Dialog>
  );
}
