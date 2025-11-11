"use client";

import { useState, useEffect } from "react";
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

interface Client {
  id: string;
  code: string;
  name: string;
  categories?: {
    id: string;
    name: string;
  }[];
}


interface CreateSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateSRDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSRDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchClients();
      fetchCategories(); // 전체 서비스 카테고리 조회
    }
  }, [open]);

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      const data = await response.json();
      setClients(data);
    } catch (error) {
      toast({
        title: "오류",
        description: "고객사 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/service-categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      setCategories(data.map((cat: any) => ({ id: cat.id, name: cat.categoryName })));
    } catch (error) {
      toast({
        title: "오류",
        description: "서비스 카테고리 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
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
      console.error("첨부파일 업로드 실패:", error);
      toast({
        title: "경고",
        description: "SR은 생성되었으나 첨부파일 업로드에 실패했습니다.",
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

    if (!clientId) {
      toast({
        title: "오류",
        description: "고객사를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!categoryId) {
      toast({
        title: "오류",
        description: "서비스 카테고리를 선택해주세요.",
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

    // 과거 날짜 검증 (선택사항 - 필요시 주석 해제)
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);
    // if (dueDate && new Date(dueDate) < today) {
    //   toast({
    //     title: "경고",
    //     description: "마감일이 과거 날짜입니다.",
    //   });
    // }

    setLoading(true);

    console.log(" [CreateSR] SR 생성 시작");
    const requestBody = {
      title,
      description,
      clientId,
      serviceCategoryId: categoryId,
      priority,
      expectedCompletionDate: expectedCompletionDate || undefined,
      dueDate: dueDate || undefined,
    };
    console.log(" [CreateSR] 요청 데이터:", requestBody);

    try {
      console.log(" [CreateSR] POST /api/srs 호출 중...");
      const response = await fetch("/api/srs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log(" [CreateSR] 응답 받음:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(" [CreateSR] API 에러 응답:", error);
        throw new Error(
          error.error ||
            error.details ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const createdSR = await response.json();
      console.log(" [CreateSR] SR 생성 성공!", createdSR);

      // Upload attachments if any
      if (files.length > 0) {
        await uploadAttachments(createdSR.id, files);
      }

      toast({
        title: "성공",
        description: "SR이 생성되었습니다.",
      });

      // Reset form
      setTitle("");
      setDescription("");
      setClientId("");
      setCategoryId("");
      setPriority("MEDIUM");
      setExpectedCompletionDate("");
      setDueDate("");
      setFiles([]);

      onCreated();
    } catch (error) {
      console.error(" [CreateSR] SR 생성 실패:", error);
      const errorMessage =
        error instanceof Error ? error.message : "SR 생성에 실패했습니다.";
      toast({
        title: "오류",
        description: errorMessage,
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
          <DialogTitle>새 SR 생성</DialogTitle>
          <DialogDescription>
            서비스 요청(SR)을 생성합니다. 모든 필수 항목을 입력해주세요.
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
                  disabled={loading}
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
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expectedCompletionDate">
                  예상 완료일
                </Label>
                <Input
                  id="expectedCompletionDate"
                  type="date"
                  value={expectedCompletionDate}
                  onChange={(e) =>
                    setExpectedCompletionDate(e.target.value)
                  }
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
              <Label>첨부파일 (선택사항)</Label>
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
              {loading ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
