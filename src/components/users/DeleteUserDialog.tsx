import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  name: string;
}

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onDeleted: () => void;
}

export function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      toast({
        title: '성공',
        description: '사용자가 삭제되었습니다.',
      });

      onDeleted();
      // Dialog closing is handled by parent or onDeleted usually triggers refresh which might close it,
      // but here we should explicitly close or rely on parent.
      // UserDialog closes onSaved. Let's close here or let parent do it?
      // page.tsx handles onDeleted by refreshing and closing.
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '오류',
        description: '사용자 삭제에 실패했습니다.',
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
          <DialogTitle>사용자 삭제</DialogTitle>
          <DialogDescription>
            정말로 <strong>{user?.name}</strong> 사용자를 삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? '삭제 중...' : '삭제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
