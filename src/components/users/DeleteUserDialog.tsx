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
  /**
   * 여러 명을 한 번에 처리할 때(목록의 일괄 삭제). 주면 `user` 대신 이 목록을 차례로 처리한다.
   * 예전에는 일괄 삭제가 선택한 사람 중 첫 1명만 넘겨 나머지가 조용히 남았다(결정 D12).
   */
  users?: User[];
  onDeleted: () => void;
}

interface DeleteOutcome {
  hard: boolean;
  succeeded: number;
  failed: { name: string; message: string }[];
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  users,
  onDeleted,
}: DeleteUserDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const targets = users ?? (user ? [user] : []);
  const isBulk = targets.length > 1;
  const isHardDelete = targets.length > 0 && targets.every((target) => target.isActive === false);
  const subject = isBulk ? `선택한 ${targets.length}명` : targets[0]?.name;

  const mutation = useMutation({
    // 한 명씩 처리하고 결과를 모은다 — 한 명이 거부돼도(이력이 있는 계정 등) 나머지는 처리한다.
    mutationFn: async (list: User[]): Promise<DeleteOutcome> => {
      const outcome: DeleteOutcome = {
        hard: list.every((target) => target.isActive === false),
        succeeded: 0,
        failed: [],
      };
      for (const target of list) {
        try {
          // 이미 비활성화된 사용자는 완전 삭제(hard delete) 수행
          await apiDelete<unknown>(
            target.isActive === false
              ? `/api/users/${target.id}?hard=true`
              : `/api/users/${target.id}`,
            { fallbackMessage: 'Failed to delete user' }
          );
          outcome.succeeded += 1;
        } catch (error) {
          // ApiError 는 서버 본문의 `error` 를 메시지로 싣는다(api-error-handler.ts).
          outcome.failed.push({
            name: target.name,
            message:
              error instanceof Error && error.message
                ? error.message
                : '사용자 삭제 중 오류가 발생했습니다.',
          });
        }
      }
      return outcome;
    },
    onSuccess: (outcome) => {
      const verb = outcome.hard ? '영구 삭제' : '비활성화';
      const [firstFailure] = outcome.failed;
      if (!firstFailure) {
        toast({
          title: '성공',
          description:
            outcome.succeeded === 1
              ? outcome.hard
                ? '사용자가 영구 삭제되었습니다.'
                : '사용자가 비활성화되었습니다.'
              : `${outcome.succeeded}명을 ${verb}했습니다.`,
        });
      } else {
        toast({
          title: outcome.succeeded > 0 ? '일부 실패' : '삭제 실패',
          description:
            outcome.succeeded + outcome.failed.length === 1
              ? firstFailure.message
              : `${outcome.succeeded}명 ${verb}, ${outcome.failed.length}명 실패 — ${firstFailure.name}: ${firstFailure.message}`,
          variant: 'destructive',
        });
      }

      queryClient.invalidateQueries({ queryKey: qk.users.all });
      if (outcome.succeeded > 0) onDeleted();
      onOpenChange(false);
    },
  });

  const loading = mutation.isPending;

  const handleDelete = () => {
    if (targets.length === 0) return;
    mutation.mutate(targets);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isHardDelete ? '사용자 영구 삭제' : '사용자 비활성화'}</DialogTitle>
          <DialogDescription>
            {isHardDelete ? (
              <>
                정말로 <strong>{subject}</strong> 사용자를{' '}
                <span className="text-destructive font-bold">영구 삭제</span>하시겠습니까?
                <br />이 작업은 <strong>되돌릴 수 없습니다</strong>. SR 이력이나 관리 이력(가입 승인
                등)이 있는 사용자는 삭제되지 않고 비활성 상태로 남습니다.
              </>
            ) : (
              <>
                정말로 <strong>{subject}</strong> 사용자를 비활성화하시겠습니까?
                <br />
                비활성화된 사용자는 로그인할 수 없습니다. 나중에 다시 활성화할 수 있습니다.
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
