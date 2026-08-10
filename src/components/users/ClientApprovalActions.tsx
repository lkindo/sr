'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiPost } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface ClientApprovalActionsProps {
  userId: string;
  clientName: string;
  onChanged: () => void;
}

/**
 * 셀프 회원가입으로 생성된 PENDING 고객사 소속을 승인/거절하는 인라인 액션.
 * 승인 전까지 해당 사용자는 고객사 데이터에 접근할 수 없다(clientIds 미포함).
 */
export function ClientApprovalActions({
  userId,
  clientName,
  onChanged,
}: ClientApprovalActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 승인과 거절은 **같은 URL 에 메서드로만 갈린다**(POST=승인, DELETE=거절).
  // 하나의 변이로 두는 이유가 그것이다 — 버튼 두 개가 같은 `submitting` 을 공유하는
  // 원래 동작(하나가 도는 동안 둘 다 잠김)도 그대로 유지된다.
  const mutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') => {
      const url = `/api/users/${userId}/client/approve`;
      const init = { fallbackMessage: '처리에 실패했습니다.' };
      return action === 'approve'
        ? apiPost<unknown>(url, undefined, init)
        : apiDelete<unknown>(url, init);
    },
    onSuccess: (_data, action) => {
      toast({
        title: action === 'approve' ? '소속 승인 완료' : '소속 신청 거절',
        description:
          action === 'approve'
            ? `${clientName} 소속이 승인되었습니다.`
            : `${clientName} 소속 신청이 거절되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: qk.users.all });
      onChanged();
    },
    onError: (error) => {
      toast({
        title: '오류 발생',
        description: error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const submitting = mutation.isPending;
  const handle = (action: 'approve' | 'reject') => mutation.mutate(action);

  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 bg-amber-50">
        {clientName} · 승인 대기
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-green-600 hover:bg-green-50"
        disabled={submitting}
        title="소속 승인"
        aria-label={`${clientName} 소속 승인`}
        onClick={() => handle('approve')}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
        disabled={submitting}
        title="소속 거절"
        aria-label={`${clientName} 소속 거절`}
        onClick={() => handle('reject')}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
