'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Label } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

interface ReopenSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  srId: string;
  srNumber: string;
  completedAt: Date | null;
}

export function ReopenSRDialog({
  open,
  onOpenChange,
  srId,
  srNumber,
  completedAt,
}: ReopenSRDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 7일 이내 확인 (완료일이 없으면 허용 - 서버에서 처리하거나 레거시 데이터)
  const canReopen = completedAt
    ? new Date().getTime() - new Date(completedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
    : true;

  const handleReopen = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!canReopen) {
      toast({
        title: '오류',
        description: '완료 후 7일이 지나 재오픈할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: '오류',
        description: '재오픈 사유를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/srs/${srId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reopen',
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '상태 변경에 실패했습니다.');
      }

      toast({
        title: '성공',
        description: 'SR이 재오픈되었습니다.',
      });

      setReason('');
      onOpenChange(false);

      // React Query 캐시 무효화
      await queryClient.invalidateQueries({ queryKey: ['sr', srId] });

      // SR 목록으로 이동
      // SR 목록으로 이동
      router.refresh();
      router.push('/srs');
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            SR 재오픈
          </DialogTitle>
          <DialogDescription>
            {srNumber} - 완료된 SR을 다시 진행합니다. 재오픈 사유를 입력해주세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleReopen}>
          <div className="space-y-4 py-4">
            {!canReopen && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                ⚠️ 완료 후 7일이 지나 재오픈할 수 없습니다.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">
                재오픈 사유 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="문제가 재발견되었거나 추가 작업이 필요한 이유를 기입해주세요..."
                className="min-h-[100px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading || !canReopen}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleReopen();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                재오픈 시 SR 상태가 '진행중'으로 변경됩니다. (Ctrl+Enter로 저장)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading || !canReopen}>
              {loading ? '처리 중...' : '재오픈'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
