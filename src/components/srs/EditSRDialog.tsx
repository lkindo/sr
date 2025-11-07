"use client";

import { useState, useEffect } from "react";
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

interface SR {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requestedCompletionDate?: string;
  assignedTo?: {
    id: string;
  } | null;
}

interface User {
  id: string;
  name: string;
  email: string;
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
  const [assignedToId, setAssignedToId] = useState("");
  const [requestedCompletionDate, setRequestedCompletionDate] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && sr) {
      setTitle(sr.title);
      setDescription(sr.description);
      setStatus(sr.status);
      setPriority(sr.priority);
      setAssignedToId(sr.assignedTo?.id || "");
      setRequestedCompletionDate(
        sr.requestedCompletionDate
          ? new Date(sr.requestedCompletionDate).toISOString().split("T")[0]
          : ""
      );
      setChangeReason("");
      fetchUsers();
    }
  }, [open, sr]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "사용자 목록을 불러오는데 실패했습니다.",
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
          assignedToId: assignedToId || null,
          requestedCompletionDate: requestedCompletionDate || null,
          changeReason: changeReason || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update SR");
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assignedTo">담당자</Label>
                <Select
                  value={assignedToId}
                  onValueChange={setAssignedToId}
                  disabled={loading}
                >
                  <SelectTrigger id="assignedTo">
                    <SelectValue placeholder="담당자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">미배정</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestedCompletionDate">요청 완료 날짜</Label>
                <Input
                  id="requestedCompletionDate"
                  type="date"
                  value={requestedCompletionDate}
                  onChange={(e) => setRequestedCompletionDate(e.target.value)}
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
    </Dialog>
  );
}
