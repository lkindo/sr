'use client';

import { useState } from 'react';

import { deleteRoleAction } from '@/actions/role.actions';
import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

// 이 다이얼로그는 이름만 보여주고 id 로 지운다. RoleTable/RoleMobileList 가 공유하는
// `RoleItem` 으로 넓히면 permissions 를 optional 로 낮춰야 해서, 목록 쪽 타입이
// 되레 느슨해진다. 필요한 두 필드만 요구하는 편이 좁고 정확하다.
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

export function DeleteRoleDialog({ open, onOpenChange, role, onDeleted }: DeleteRoleDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!role) return;

    setLoading(true);

    try {
      const result = await deleteRoleAction(role.id);

      if (!result.success) {
        throw new Error(result.error || '역할 삭제에 실패했습니다.');
      }

      toast({
        title: '성공',
        description: '역할이 삭제되었습니다.',
      });

      // 모달 즉시 닫고 → 후속 갱신
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '역할 삭제에 실패했습니다.',
        variant: 'destructive',
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
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? '삭제 중...' : '삭제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
