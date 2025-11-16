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
import { deleteClientAction } from "@/actions/client.actions";

interface Client {
  id: string;
  name: string;
  code: string;
}

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onDeleted: () => void;
}

export function DeleteClientDialog({
  open,
  onOpenChange,
  client,
  onDeleted,
}: DeleteClientDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();


  const handleDelete = async () => {
    if (!client) return;

    setLoading(true);

    try {
      const result = await deleteClientAction(client.id);

      if (!result.success) {
        throw new Error(result.error || "고객사 삭제에 실패했습니다.");
      }

      toast({
        title: "성공",
        description: "고객사가 삭제되었습니다.",
      });

      // 모달 즉시 닫고 → 후속 이동/갱신
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error
            ? error.message
            : "고객사 삭제에 실패했습니다.",
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
          <DialogTitle>고객사 삭제</DialogTitle>
          <DialogDescription>
            정말로 <strong>{client?.name}</strong> ({client?.code}) 고객사를
            삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없습니다.
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
