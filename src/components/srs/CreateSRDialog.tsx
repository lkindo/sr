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
import { getClientsForSelection } from "@/actions/client.actions";
import { getServiceCategoriesForSelection } from "@/actions/service-category.actions";
import { createSRAction } from "@/actions/sr.actions";

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
  const [requestedPriority, setRequestedPriority] = useState<string>("MEDIUM");
  const [requestedCompletionDate, setRequestedCompletionDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();



  const fetchClients = useCallback(async () => {
    const result = await getClientsForSelection();
    if (result.success) {
      setClients(result.data as Client[]);
    } else {
      toast({
        title: "오류",
        description: "고객사 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchCategories = useCallback(async () => {
    const result = await getServiceCategoriesForSelection();
    if (result.success && result.data) {
      setCategories(result.data.map((cat: any) => ({ id: cat.id, name: cat.categoryName })));
    } else {
      toast({
        title: "오류",
        description: "서비스 카테고리 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchClients();
      fetchCategories(); // 전체 서비스 카테고리 조회
    }
  }, [open, fetchClients, fetchCategories]);

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

    // ... (form validation logic remains the same)
    if (title.length < 5) { /* ... */ return; }
    if (description.length < 10) { /* ... */ return; }
    if (!clientId) { /* ... */ return; }
    if (!categoryId) { /* ... */ return; }
    if (requestedCompletionDate) { /* ... */ }

    setLoading(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("clientId", clientId);
    formData.append("serviceCategoryId", categoryId);
    formData.append("requestedPriority", requestedPriority);
    if (requestedCompletionDate) {
      formData.append("requestedCompletionDate", requestedCompletionDate);
    }

    try {
      const result = await createSRAction(formData);

      if (!result.success || !result.data) {
        throw new Error(result.error || "SR 생성에 실패했습니다.");
      }

      const createdSR = result.data;
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
      setRequestedPriority("MEDIUM");
      setRequestedCompletionDate("");
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
          <DialogTitle>새 SR 요청</DialogTitle>
          <DialogDescription>
            서비스 요청(SR)을 등록합니다. 제목, 설명, 고객사, 서비스 카테고리는 필수입니다.
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
              {loading ? "요청 중..." : "SR 요청하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
