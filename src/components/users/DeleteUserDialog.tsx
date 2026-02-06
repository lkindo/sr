import { useState } from 'react';

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

interface User {
  id: string;
  name: string;
  isActive?: boolean;
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

  const isHardDelete = user?.isActive === false;

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 이미 비활성화된 사용자는 완전 삭제(hard delete) 수행
      const url = isHardDelete ? `/api/users/${user.id}?hard=true` : `/api/users/${user.id}`;

      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to delete user');
      }

      toast({
        title: '성공',
        description: isHardDelete
          ? '사용자가 영구 삭제되었습니다.'
          : '사용자가 비활성화되었습니다.',
      });

      onDeleted();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: '삭제 실패',
        description: error.message || '사용자 삭제 중 오류가 발생했습니다.',
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
          <DialogTitle>{isHardDelete ? '사용자 영구 삭제' : '사용자 비활성화'}</DialogTitle>
          <DialogDescription>
            {isHardDelete ? (
              <>
                정말로 <strong>{user?.name}</strong> 사용자를{' '}
                <span className="text-destructive font-bold">영구 삭제</span>하시겠습니까?
                <br />이 작업은 <strong>절대로 되돌릴 수 없으며</strong>, 관련 데이터가 모두 제거될
                수 있습니다.
              </>
            ) : (
              <>
                정말로 <strong>{user?.name}</strong> 사용자를 비활성화하시겠습니까?
                <br />
                비활성화된 사용자는 시스템에 로그인할 수 없습니다.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? '처리 중...' : isHardDelete ? '영구 삭제' : '비활성화'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
