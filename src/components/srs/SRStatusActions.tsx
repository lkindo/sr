'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, Loader2, PauseCircle, Play, RotateCcw, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import { CompleteSRDialog } from './CompleteSRDialog';
import { HoldSRDialog } from './HoldSRDialog';
import { RejectSRDialog } from './RejectSRDialog';
import { ReopenSRDialog } from './ReopenSRDialog';

type SRStatus =
  | 'REQUESTED'
  | 'INTAKE'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'REJECTED';

interface SRStatusActionsProps {
  srId: string;
  srNumber: string;
  status: SRStatus;
  completedAt: Date | null;
  userRoles: string[];
  isRequestor: boolean;
}

export function SRStatusActions({
  srId,
  srNumber,
  status,
  completedAt,
  userRoles,
  isRequestor,
}: SRStatusActionsProps) {
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 권한 체크
  const hasRole = (roles: string[]) => roles.some((role) => userRoles.includes(role));
  const canManage = hasRole(['ADMIN', 'MANAGER', 'ENGINEER']);
  const canAccept = hasRole(['ADMIN', 'MANAGER']);
  const isManager = hasRole(['ADMIN', 'MANAGER']);

  // 간단한 상태 변경 (다이얼로그 없음)
  const handleSimpleStatusChange = async (action: string) => {
    setLoadingAction(action);

    try {
      const response = await fetch(`/api/srs/${srId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '상태 변경에 실패했습니다.');
      }

      toast({
        title: '성공',
        description: '상태가 변경되었습니다.',
      });

      // 캐시 무효화 및 페이지 새로고침 (완료될 때까지 대기)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sr', srId] }),
        queryClient.invalidateQueries({ queryKey: ['srs'] }),
      ]);
      router.refresh();
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
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
            {(isRequestor || isManager) && (
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
        if (!isRequestor && !isManager) return null;
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

  return (
    <>
      <div className="flex gap-1 shrink-0">{renderActions()}</div>

      {/* 다이얼로그들 */}
      <CompleteSRDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <HoldSRDialog
        open={holdDialogOpen}
        onOpenChange={setHoldDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <RejectSRDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        srId={srId}
        srNumber={srNumber}
      />
      <ReopenSRDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        srId={srId}
        srNumber={srNumber}
        completedAt={completedAt}
      />
    </>
  );
}
