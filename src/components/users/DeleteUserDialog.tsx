import { useMutation, useQueryClient } from '@tanstack/react-query';

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
import { apiDelete } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isHardDelete = user?.isActive === false;

  const mutation = useMutation({
    mutationFn: (target: User) =>
      // 이미 비활성화된 사용자는 완전 삭제(hard delete) 수행
      apiDelete<unknown>(
        target.isActive === false ? `/api/users/${target.id}?hard=true` : `/api/users/${target.id}`,
        { fallbackMessage: 'Failed to delete user' }
      ),
    onSuccess: (_data, target) => {
      toast({
        title: '성공',
        description:
          target.isActive === false
            ? '사용자가 영구 삭제되었습니다.'
            : '사용자가 비활성화되었습니다.',
      });

      queryClient.invalidateQueries({ queryKey: qk.users.all });
      onDeleted();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: '삭제 실패',
        // ApiError 는 서버 본문의 `error` 를 메시지로 싣는다 — 이 라우트의 실패 본문은
        // `{ error }` 뿐이므로(api-error-handler.ts) 원래의 `message || error` 와 같은 값이다.
        description: error.message || '사용자 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const loading = mutation.isPending;

  const handleDelete = () => {
    if (!user) return;
    mutation.mutate(user);
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
