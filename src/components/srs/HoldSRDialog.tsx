'use client';

import { useQueryClient } from '@tanstack/react-query';
import { PauseCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface HoldSRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  srId: string;
  srNumber: string;
}

export function HoldSRDialog({ open, onOpenChange, srId, srNumber }: HoldSRDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleHold = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!reason.trim()) {
      toast({
        title: '오류',
        description: '보류 사유를 입력해주세요.',
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
          action: 'hold',
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '상태 변경에 실패했습니다.');
      }

      toast({
        title: '성공',
        description: 'SR이 보류 처리되었습니다.',
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
            <PauseCircle className="h-5 w-5 text-orange-600" />
            SR 보류 처리
          </DialogTitle>
          <DialogDescription>
            {srNumber} - SR을 일시 보류합니다. 보류 사유를 입력해주세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleHold}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">
                보류 사유 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="추가 정보 대기, 고객 응답 대기, 외부 의존성 대기 등..."
                className="min-h-[100px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleHold();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                보류 사유는 활동 기록에 저장되며 관련자가 확인할 수 있습니다. (Ctrl+Enter로 저장)
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
            <Button type="submit" disabled={loading} variant="secondary">
              {loading ? '처리 중...' : '보류 처리'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
