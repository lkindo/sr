'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { apiPatch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

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
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const blocked = Boolean(disabledReason);

  /**
   * 상태 전이 요청.
   *
   * ── 왜 `use-sr.ts` 의 `useChangeSRStatus` 를 재사용하지 않는가 ─────────────
   * 같은 `PATCH /api/srs/[id]/status` 를 부르므로 합치고 싶어지지만, 그 훅의 계약이
   * 이 다이얼로그의 계약과 **세 군데에서 정면으로 충돌한다.**
   *
   *  1. 그 훅은 `onSettled` 에서 `invalidateQueries` + `router.refresh()` 를 한다.
   *     `onSettled` 는 `mutateAsync` 가 resolve 되기 **전에** 끝나야 하므로, 여기서
   *     `await mutateAsync(...)` 한 뒤 다이얼로그를 닫으면 아래 ⚠️ 의 순서가 그대로
   *     뒤집힌다 — 되살아나는 것이 바로 이중 제출이다.
   *  2. 그 훅은 `onSettled` 라서 **실패했을 때도** `router.refresh()` 를 한다.
   *     이 다이얼로그는 실패 시 아무것도 갱신하지 않고 열린 채로 남아야 한다.
   *  3. 그 훅은 `onMutate` 에서 `['sr', id]` 를 낙관적으로 고친다. 이 다이얼로그는
   *     서버 판정(완료 조건·거절 권한·재오픈 7일 창)에 걸릴 수 있는 전이만 다루므로,
   *     낙관적으로 찍었다가 되돌리면 상태 배지가 잘못된 값으로 한 번 깜빡인다.
   *
   * 즉 겹치는 것은 URL 과 메서드뿐이고 성공/실패 후 처리는 서로 반대다. 지금은
   * 중복을 남긴다 — 합치려면 그 훅에서 `onSettled` 를 걷어내고 호출부가 후처리를
   * 정하는 형태로 먼저 바꿔야 한다.
   */
  const { mutate: changeStatus, isPending: loading } = useMutation({
    mutationFn: (trimmed: string) =>
      apiPatch(
        `/api/srs/${srId}/status`,
        config.bodyKey === 'resolutionDescription'
          ? { action, resolutionDescription: trimmed }
          : { action, reason: trimmed },
        { fallbackMessage: '상태 변경에 실패했습니다.' }
      ),
    onSuccess: async () => {
      // UI 를 먼저 정리한 뒤 백그라운드로 갱신한다. 순서를 뒤집으면 이미 처리된
      // 다이얼로그가 갱신이 끝날 때까지 열려 있어 사용자가 두 번 제출하게 된다.
      setText('');
      onOpenChange(false);

      toast({ title: '성공', description: config.successMessage });

      // 여기서만 `await` 한다. onSuccess 가 끝날 때까지 `isPending` 이 유지되므로
      // 기존의 `finally { setLoading(false) }` 와 같은 시점에 잠금이 풀린다.
      await queryClient.invalidateQueries({ queryKey: qk.sr.detail(srId) });
      router.refresh();
      router.push('/srs');
    },
    onError: (error) => {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (blocked) return;

    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: '오류', description: config.emptyError, variant: 'destructive' });
      return;
    }

    changeStatus(trimmed);
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
