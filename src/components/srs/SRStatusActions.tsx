'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, Loader2, PauseCircle, Play, RotateCcw, XCircle } from 'lucide-react';

import { Button } from '@/components/ui';
import { useChangeSRStatus } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { canPerformTransition } from '@/lib/sr-state-machine';

import { SRStatusChangeDialog } from './SRStatusChangeDialog';

/** 재오픈 허용 창. sr-state-machine 의 서버 판정과 같은 값이어야 한다. */
const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type SRStatus =
  'REQUESTED' | 'INTAKE' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CONFIRMED' | 'REJECTED';

interface SRStatusActionsProps {
  srId: string;
  srNumber: string;
  status: SRStatus;
  completedAt: Date | null;
  userRoles: string[];
  /** 커스텀 역할도 전이할 수 있으므로 권한도 함께 넘긴다(감사 4.3). */
  userPermissions?: string[];
  isRequestor: boolean;
}

export function SRStatusActions({
  srId,
  srNumber,
  status,
  completedAt,
  userRoles,
  userPermissions,
  isRequestor,
}: SRStatusActionsProps) {
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const { mutateAsync: changeStatus } = useChangeSRStatus(srId);

  // 권한 체크
  const hasRole = (roles: string[]) => roles.some((role) => userRoles.includes(role));
  const canManage = hasRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canAccept = hasRole(['ADMIN', 'MANAGER']);

  /**
   * 전이 가능 여부는 상태 머신에서 도출한다.
   *
   * 예전에는 `isManager = hasRole(['ADMIN','MANAGER'])` 로 여기서 독립 판단했는데,
   * 재오픈 규칙에는 MANAGER 가 없어서 버튼은 보이고 서버는 항상 거부하는 막다른 길이
   * 생겼다(감사 4.3). 규칙을 바꿀 때 UI 가 따라오지 않으면 같은 발산이 반복된다.
   */
  const can = (to: SRStatus) => canPerformTransition(status, to, userRoles, userPermissions);
  const canReopen = can('IN_PROGRESS');

  // 간단한 상태 변경 (다이얼로그 없음)
  const handleSimpleStatusChange = async (action: string) => {
    setLoadingAction(action);

    try {
      await changeStatus({ action });

      toast({
        title: '성공',
        description: '상태가 변경되었습니다.',
      });
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
      logger.error('SR 상태 변경 실패', error instanceof Error ? error : undefined);
    } finally {
      setLoadingAction(null);
    }
  };

  // 접수 페이지로 이동
  const handleIntake = () => {
    setLoadingAction('intake');
    router.push(`/srs/${srId}/intake`);
  };

  // 상태별 버튼 렌더링
  const renderActions = () => {
    switch (status) {
      case 'REQUESTED':
        // 요청됨 상태: 접수하기, 거절
        if (!canAccept) return null;
        return (
          <>
            <Button
              onClick={handleIntake}
              disabled={!!loadingAction}
              aria-label="접수하기"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="접수하기"
            >
              {loadingAction === 'intake' ? (
                <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
              ) : (
                <Clock className="h-4 w-4 md:mr-2" />
              )}
              <span className="hidden md:inline">접수하기</span>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectDialogOpen(true)}
              disabled={!!loadingAction}
              aria-label="거절"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="거절"
            >
              <XCircle className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">거절</span>
            </Button>
          </>
        );

      case 'INTAKE':
        // 접수됨 상태: 진행 시작, 보류(접수단계에선 보류불가?), 거절
        if (!canManage) return null;
        return (
          <Button
            onClick={() => handleSimpleStatusChange('start')}
            disabled={!!loadingAction}
            aria-label="진행 시작"
            className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
            title="진행 시작"
          >
            {loadingAction === 'start' ? (
              <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 md:mr-2" />
            )}
            <span className="hidden md:inline">진행 시작</span>
          </Button>
        );
      case 'IN_PROGRESS':
        // 진행중 상태: 완료 처리, 보류
        if (!canManage) return null;
        return (
          <>
            <Button
              onClick={() => setCompleteDialogOpen(true)}
              disabled={!!loadingAction}
              aria-label="완료 처리"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="완료 처리"
            >
              <CheckCircle className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">완료 처리</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setHoldDialogOpen(true)}
              disabled={!!loadingAction}
              aria-label="보류"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="보류"
            >
              <PauseCircle className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">보류</span>
            </Button>
          </>
        );

      case 'ON_HOLD':
        // 보류 상태: 진행 재개, 거절
        if (!canManage) return null;
        return (
          <>
            <Button
              onClick={() => handleSimpleStatusChange('resume')}
              disabled={!!loadingAction}
              aria-label="진행 재개"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="진행 재개"
            >
              {loadingAction === 'resume' ? (
                <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 md:mr-2" />
              )}
              <span className="hidden md:inline">진행 재개</span>
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectDialogOpen(true)}
              disabled={!!loadingAction}
              aria-label="거절"
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="거절"
            >
              <XCircle className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">거절</span>
            </Button>
          </>
        );

      case 'COMPLETED':
        // 완료 상태: 확인 완료 (신청자만), 재오픈 (관리자/신청자)
        return (
          <>
            {isRequestor && (
              <Button
                onClick={() => handleSimpleStatusChange('confirm')}
                disabled={!!loadingAction}
                aria-label="확인 완료"
                className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
                title="확인 완료"
              >
                {loadingAction === 'confirm' ? (
                  <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 md:mr-2" />
                )}
                <span className="hidden md:inline">확인 완료</span>
              </Button>
            )}
            {(isRequestor || canReopen) && (
              <Button
                variant="outline"
                onClick={() => setReopenDialogOpen(true)}
                disabled={!!loadingAction}
                aria-label="재오픈"
                className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
                title="재오픈"
              >
                <RotateCcw className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">재오픈</span>
              </Button>
            )}
          </>
        );

      case 'CONFIRMED':
        // 확인완료 상태: 재오픈 (7일 이내, 관리자/신청자)
        if (!isRequestor && !canReopen) return null;
        return (
          <Button
            variant="outline"
            onClick={() => setReopenDialogOpen(true)}
            disabled={!!loadingAction}
            aria-label="재오픈"
            className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
            title="재오픈"
          >
            <RotateCcw className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">재오픈</span>
          </Button>
        );

      case 'REJECTED':
        // 거절 상태: 액션 없음
        return null;

      default:
        return null;
    }
  };

  // 재오픈 가능 창은 완료 후 7일이다. 완료일이 없으면(레거시 데이터) 서버 판정에 맡긴다.
  const reopenBlockedReason =
    completedAt && new Date().getTime() - new Date(completedAt).getTime() > REOPEN_WINDOW_MS
      ? '완료 후 7일이 지나 재오픈할 수 없습니다.'
      : null;

  return (
    <>
      <div className="flex gap-1 shrink-0">{renderActions()}</div>

      {/* 다이얼로그들 — 넷 다 같은 컴포넌트이고 action 만 다르다. */}
      <SRStatusChangeDialog
        action="complete"
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <SRStatusChangeDialog
        action="hold"
        open={holdDialogOpen}
        onOpenChange={setHoldDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <SRStatusChangeDialog
        action="reject"
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <SRStatusChangeDialog
        action="reopen"
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        srId={srId}
        srNumber={srNumber}
        disabledReason={reopenBlockedReason}
      />
    </>
  );
}
