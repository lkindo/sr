'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, PauseCircle, RotateCcw, XCircle } from 'lucide-react';

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

/**
 * SR 상태 변경 다이얼로그 (완료 / 보류 / 거절 / 재오픈 공용).
 *
 * 넷은 621줄에 걸쳐 같은 것을 네 번 쓰고 있었다 — 같은 폼, 같은
 * `PATCH /api/srs/[id]/status`, 같은 성공/실패 토스트, 같은 캐시 무효화와 목록 이동,
 * 같은 Ctrl+Enter 단축키. 실제로 다른 것은 아래 설정표의 값들뿐이다.
 * 넷 중 하나만 고치고 나머지를 잊는 것이 이 구조의 기본 실패 모드였다.
 *
 * **제출 버튼 문구는 글자 그대로 유지해야 한다.** `e2e/helpers/test-helpers.ts` 의
 * `SR_ACTION_DIALOG_SUBMIT` 이 `/^완료 처리$/` 같은 정규식으로 이 버튼을 찾는다.
 */

/** 다이얼로그를 여는 상태 전이. start/resume/confirm 은 다이얼로그 없이 즉시 전환된다. */
type SRDialogAction = 'complete' | 'hold' | 'reject' | 'reopen';

interface ActionConfig {
  icon: typeof CheckCircle;
  iconClassName: string;
  title: string;
  /** `{srNumber} - ` 뒤에 붙는 설명. */
  description: string;
  fieldLabel: string;
  placeholder: string;
  helpText: string;
  /** 서버가 받는 본문 키. complete 만 resolutionDescription 이고 나머지는 reason 이다. */
  bodyKey: 'resolutionDescription' | 'reason';
  submitLabel: string;
  submitVariant?: 'default' | 'secondary' | 'destructive';
  /** 입력이 비었을 때의 오류 문구. */
  emptyError: string;
  successMessage: string;
}

const ACTIONS: Record<SRDialogAction, ActionConfig> = {
  complete: {
    icon: CheckCircle,
    iconClassName: 'h-5 w-5 text-green-600',
    title: 'SR 완료 처리',
    description: 'SR을 완료 처리합니다. 해결 내용을 입력해주세요.',
    fieldLabel: '해결 내용',
    placeholder: '어떻게 해결했는지 상세히 기록해주세요...',
    helpText: '신청자가 확인할 수 있는 내용입니다. (Ctrl+Enter로 저장)',
    bodyKey: 'resolutionDescription',
    submitLabel: '완료 처리',
    emptyError: '해결 내용을 입력해주세요.',
    successMessage: 'SR이 완료 처리되었습니다.',
  },
  hold: {
    icon: PauseCircle,
    iconClassName: 'h-5 w-5 text-yellow-600',
    title: 'SR 보류 처리',
    description: 'SR을 일시 보류합니다. 보류 사유를 입력해주세요.',
    fieldLabel: '보류 사유',
    placeholder: '추가 정보 대기, 고객 응답 대기, 외부 의존성 대기 등...',
    helpText: '보류 사유는 활동 기록에 저장되며 관련자가 확인할 수 있습니다. (Ctrl+Enter로 저장)',
    bodyKey: 'reason',
    submitLabel: '보류 처리',
    submitVariant: 'secondary',
    emptyError: '보류 사유를 입력해주세요.',
    successMessage: 'SR이 보류 처리되었습니다.',
  },
  reject: {
    icon: XCircle,
    iconClassName: 'h-5 w-5 text-destructive',
    title: 'SR 거절 처리',
    description: 'SR을 거절합니다. 거절 사유를 입력해주세요.',
    fieldLabel: '거절 사유',
    placeholder: '거절 사유를 명확히 기입해주세요...',
    helpText: '신청자에게 거절 사유가 전달됩니다. (Ctrl+Enter로 저장)',
    bodyKey: 'reason',
    submitLabel: '거절 처리',
    submitVariant: 'destructive',
    emptyError: '거절 사유를 입력해주세요.',
    successMessage: 'SR이 거절 처리되었습니다.',
  },
  reopen: {
    icon: RotateCcw,
    iconClassName: 'h-5 w-5 text-blue-600',
    title: 'SR 재오픈',
    description: '완료된 SR을 다시 진행합니다. 재오픈 사유를 입력해주세요.',
    fieldLabel: '재오픈 사유',
    placeholder: '문제가 재발견되었거나 추가 작업이 필요한 이유를 기입해주세요...',
    helpText: "재오픈 시 SR 상태가 '진행중'으로 변경됩니다. (Ctrl+Enter로 저장)",
    bodyKey: 'reason',
    submitLabel: '재오픈',
    emptyError: '재오픈 사유를 입력해주세요.',
    successMessage: 'SR이 재오픈되었습니다.',
  },
};

interface SRStatusChangeDialogProps {
  action: SRDialogAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  srId: string;
  srNumber: string;
  /**
   * 값이 있으면 입력과 제출을 막고 그 문구를 경고로 띄운다.
   * 재오픈의 "완료 후 7일" 창이 이 형태로 들어온다 — 넷 중 하나만 갖는 제약을
   * 컴포넌트 안에 특수 분기로 넣는 대신 호출부가 판정해 넘긴다.
   */
  disabledReason?: string | null;
}

export function SRStatusChangeDialog({
  action,
  open,
  onOpenChange,
  srId,
  srNumber,
  disabledReason,
}: SRStatusChangeDialogProps) {
  const config = ACTIONS[action];
  const Icon = config.icon;

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const blocked = Boolean(disabledReason);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (blocked) return;

    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: '오류', description: config.emptyError, variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/srs/${srId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          config.bodyKey === 'resolutionDescription'
            ? { action, resolutionDescription: trimmed }
            : { action, reason: trimmed }
        ),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '상태 변경에 실패했습니다.');
      }

      // UI 를 먼저 정리한 뒤 백그라운드로 갱신한다. 순서를 뒤집으면 이미 처리된
      // 다이얼로그가 갱신이 끝날 때까지 열려 있어 사용자가 두 번 제출하게 된다.
      setText('');
      onOpenChange(false);

      toast({ title: '성공', description: config.successMessage });

      await queryClient.invalidateQueries({ queryKey: ['sr', srId] });
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
            <Icon className={config.iconClassName} />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {srNumber} - {config.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {disabledReason && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {disabledReason}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sr-status-reason">
                {config.fieldLabel} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sr-status-reason"
                placeholder={config.placeholder}
                className="min-h-[120px]"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={loading || blocked}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleSubmit();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">{config.helpText}</p>
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
            <Button type="submit" disabled={loading || blocked} variant={config.submitVariant}>
              {loading ? '처리 중...' : config.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
