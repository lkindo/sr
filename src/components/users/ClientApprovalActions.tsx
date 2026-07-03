'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

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
  const [submitting, setSubmitting] = useState(false);

  const handle = async (action: 'approve' | 'reject') => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/users/${userId}/client/approve`, {
        method: action === 'approve' ? 'POST' : 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || '처리에 실패했습니다.');
      }
      toast({
        title: action === 'approve' ? '소속 승인 완료' : '소속 신청 거절',
        description:
          action === 'approve'
            ? `${clientName} 소속이 승인되었습니다.`
            : `${clientName} 소속 신청이 거절되었습니다.`,
      });
      onChanged();
    } catch (error) {
      toast({
        title: '오류 발생',
        description: error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

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
