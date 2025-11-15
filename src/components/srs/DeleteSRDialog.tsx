"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface SR {
  id: string;
  srNumber: string;
  title: string;
}

interface DeleteSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sr: SR | null;
  onDeleted: () => void;
}

export function DeleteSRDialog({
  open,
  onOpenChange,
  sr,
  onDeleted,
}: DeleteSRDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!sr) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/srs/${sr.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = "SR 삭제에 실패했습니다.";
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch {
          // JSON 파싱 실패 시 상태 코드 기반 메시지
          if (response.status === 404) {
            errorMessage = "SR을 찾을 수 없습니다.";
          } else if (response.status === 403) {
            errorMessage = "SR 삭제 권한이 없습니다.";
          } else if (response.status === 401) {
            errorMessage = "인증이 필요합니다.";
          } else {
            errorMessage = `SR 삭제에 실패했습니다. (${response.status})`;
          }
        }
        throw new Error(errorMessage);
      }

      toast({
        title: "성공",
        description: "SR이 삭제되었습니다.",
      });

      onDeleted();
      onOpenChange(false);
    } catch (error) {
      console.error("SR 삭제 오류:", error);
      toast({
        title: "오류",
        description:
          error instanceof Error ? error.message : "SR 삭제에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SR 삭제</DialogTitle>
          <DialogDescription>
            정말로 <strong>{sr?.srNumber}</strong> - {sr?.title} SR을
            삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없으며, 모든 댓글과 첨부파일도 함께
            삭제됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
