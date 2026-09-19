'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Textarea } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { apiPatch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { FIELD_LIMITS } from '@/lib/schemas';
import { fromAppZoneDateTimeInput, toAppZoneDateTimeInput } from '@/lib/timezone';

interface DueDateAdjustDialogProps {
  srId: string;
  srNumber: string;
  /** 지금 마감일. 없으면 입력란을 비워 둔다. */
  currentDueDate: string | Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 마감일 수동 조정 (헌법 §3, 소유자 결정 2026-09-18 D8).
 *
 * 마감일은 원칙적으로 자동 산출값이다. 운영자가 직접 바꿀 때는 **사유가 필수**이고, 비울 수 없다.
 * 서버(sr.service.updateSR)가 같은 규칙을 강제하고 사유를 SR_DUE_DATE 감사 로그에 남기며, 조정한
 * 마감일은 이후 우선순위·카테고리 변경의 자동 재산출이 덮어쓰지 않는다(due_date_manual).
 *
 * 입력은 KST 로 읽는다 — 브라우저 타임존이 달라도 같은 순간이 저장되게 fromAppZoneDateTimeInput 을 쓴다.
 */
export function DueDateAdjustDialog({
  srId,
  srNumber,
  currentDueDate,
  open,
  onOpenChange,
}: DueDateAdjustDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialValue = currentDueDate ? toAppZoneDateTimeInput(currentDueDate) : '';
  const [dateValue, setDateValue] = useState(initialValue);
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiPatch(
        `/api/srs/${srId}`,
        {
          dueDate: fromAppZoneDateTimeInput(dateValue).toISOString(),
          changeReason: reason.trim(),
        },
        { fallbackMessage: '마감일을 조정하지 못했습니다.' }
      ),
    onSuccess: async () => {
      setReason('');
      onOpenChange(false);
      toast({ title: '성공', description: '마감일을 조정했습니다.' });
      await queryClient.invalidateQueries({ queryKey: qk.sr.detail(srId) });
    },
    onError: (error) => {
      setServerError(error instanceof Error ? error.message : '마감일을 조정하지 못했습니다.');
    },
  });

  const unchanged = dateValue === initialValue;
  const canSubmit = !!dateValue && !!reason.trim() && !unchanged && !isPending;

  // 호출부는 열 때만 이 컴포넌트를 마운트한다 — 그래서 열 때마다 지금 마감일에서 새로 시작한다.
  const handleOpenChange = (next: boolean) => onOpenChange(next);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError(null);
    mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            마감일 조정
          </DialogTitle>
          <DialogDescription>
            {srNumber} - 조정한 마감일은 이후 우선순위·카테고리가 바뀌어도 자동으로 다시 계산되지
            않습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {serverError && (
              <div
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {serverError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="sr-due-date">
                새 마감일(KST) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sr-due-date"
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-due-date-reason">
                조정 사유 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sr-due-date-reason"
                placeholder="예: 고객 요청으로 일정 협의, 외부 의존 작업 대기"
                value={reason}
                maxLength={FIELD_LIMITS.SHORT_TEXT}
                onChange={(e) => setReason(e.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-sm text-muted-foreground">
                사유는 감사 기록에 남습니다. 마감일은 비울 수 없습니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? '조정 중...' : '마감일 조정'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
