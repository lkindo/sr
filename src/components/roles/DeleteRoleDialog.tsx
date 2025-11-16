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
import { deleteRoleAction } from "@/actions/role.actions";

interface Role {
  id: string;
  name: string;
}

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onDeleted: () => void;
}

export function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  onDeleted,
}: DeleteRoleDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();


  const handleDelete = async () => {
    if (!role) return;

    setLoading(true);

    try {
      const result = await deleteRoleAction(role.id);

      if (!result.success) {
        throw new Error(result.error || "역할 삭제에 실패했습니다.");
      }

      toast({
        title: "성공",
        description: "역할이 삭제되었습니다.",
      });

      // 모달 즉시 닫고 → 후속 갱신
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast({
        title: "오류",
        description:
          error instanceof Error ? error.message : "역할 삭제에 실패했습니다.",
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
          <DialogTitle>역할 삭제</DialogTitle>
          <DialogDescription>
            정말로 <strong>{role?.name}</strong> 역할을 삭제하시겠습니까?
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
