'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  Clock,
  Info,
  Loader2,
  PauseCircle,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, Button } from '@/components/ui';
import { useChangeSRStatus } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { ReopenAvailability, ReopenBlock } from '@/lib/sr-state-machine';

import { SRStatusChangeDialog } from './SRStatusChangeDialog';

type SRStatus =
  'REQUESTED' | 'INTAKE' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CONFIRMED' | 'REJECTED';

/**
 * 재오픈 불가 안내의 DOM id. 비활성 재오픈 버튼이 `aria-describedby` 로 이 안내를 가리킨다.
 * 버튼과 안내가 같은 모듈에 있어야 id 가 한쪽만 바뀌지 않는다.
 */
const REOPEN_BLOCKED_REASON_ID = 'sr-reopen-blocked-reason';

interface SRStatusActionsProps {
  srId: string;
  srNumber: string;
  status: SRStatus;
  userRoles: string[];
  /**
   * '확인 완료' 버튼을 보일지 — 호출부가 `sr-state-machine.canViewerConfirmSR` 로 서버와 같은 규칙으로
   * 판정해 넘긴다(신청자 본인, 또는 운영자가 등록한 SR 의 해당 고객사 CLIENT_ADMIN).
   */
  canConfirm: boolean;
  /**
   * 재오픈 버튼의 노출·비활성·이유. `getReopenAvailability`(sr-state-machine)로 계산해 넘긴다.
   * 커스텀 역할도 권한으로 재오픈할 수 있으므로(감사 4.3) 그 계산에 사용자 권한이 들어간다.
   *
   * 예전에는 이 컴포넌트가 `completedAt` 만 받아 자체 7일 사본으로 판정했다. 그 사본은
   * 확인완료 SR 의 기산점(confirmedAt)도, 기산점 NULL(fail-closed)도, 담당자 요건도,
   * 신청자가 아닌 고객사 사용자의 403 도 몰라서 서버와 계속 다른 답을 냈다.
   * 페이지가 한 번 계산해 버튼과 안내(`SRReopenBlockedNotice`)에 같은 값을 준다.
   */
  reopen: ReopenAvailability;
  /**
   * 거절 버튼을 감출지 — 한 번 완료된 SR 은 거절로 끝내지 않는다(D9). 호출부가
   * `sr-state-machine.isRejectBlockedAfterCompletion` 으로 서버와 같은 규칙으로 판정해 넘긴다.
   */
  rejectBlocked?: boolean;
}

/**
 * 안내 제목 — 막힌 **이유의 요약**이다.
 *
 * 본문은 서버 거부 문구 그대로라 "…재오픈할 수 없습니다." 로 시작한다. 제목까지 같은
 * 문장이면 한 화면에서 같은 말을 두 번 하고, 정작 사용자가 찾는 "왜" 는 본문을 읽어야
 * 나온다. 제목이 이유를 먼저 말하고 본문이 근거(시각·기한)와 다음 행동을 잇는다.
 *
 * 문구가 아니라 `code` 로 고른다 — 서버 문구가 다듬어져도 여기가 따라 깨지지 않는다.
 */
const REOPEN_BLOCK_TITLES: Record<ReopenBlock['code'], string> = {
  WINDOW_EXPIRED: '재오픈 기한이 지났습니다',
  ANCHOR_UNKNOWN: '재오픈 기한을 확인할 수 없습니다',
  ASSIGNEE_MISSING: '담당자가 지정되지 않았습니다',
  NOT_PERMITTED: '재오픈 권한이 없습니다',
};

/**
 * 재오픈이 막힌 이유를 **화면에 보이는 글**로 알린다.
 *
 * 툴팁이나 다이얼로그 안의 한 줄로는 부족했다 — 비활성 버튼은 포인터 이벤트가 없어
 * 툴팁이 뜨지 않고, 모바일(390px)에서는 버튼이 아이콘뿐이라 무엇이 막혔는지조차 보이지
 * 않는다. 실제로 "재오픈이 안 된다" 는 보고가 다이얼로그 속 작은 빨간 글을 보지 못한 채
 * 들어왔다. 헤더 바로 아래 전체 폭으로 그린다(헤더 행 안은 390px 에서 공간이 없다).
 */
export function SRReopenBlockedNotice({ reopen }: { reopen: ReopenAvailability }) {
  if (!reopen.visible || !reopen.block) return null;
  return (
    // 페이지를 열 때부터 있는 안내이므로 role="alert"(즉시 낭독) 대신 note 로 둔다.
    <Alert role="note" id={REOPEN_BLOCKED_REASON_ID} data-testid={REOPEN_BLOCKED_REASON_ID}>
      <Info className="h-4 w-4" aria-hidden="true" />
      {/* 제목이지만 **헤딩이 아니다**. `AlertTitle` 은 <h5> 로 렌더되는데, 이 안내는 상세
          페이지의 h1(SR 번호)과 h2(상세 정보) 사이에 들어가므로 h1 → h5 → h2 가 되어
          heading-order 를 깨뜨린다(axe 로 실측: 안내가 뜬 페이지에서만 위반 1건).
          같은 페이지에서 이미 한 번 고친 문제다(page.tsx 의 h2 주석). 보이는 모양은
          AlertTitle 과 같은 클래스로 유지한다. */}
      <p className="mb-1 font-medium leading-none tracking-tight">
        {REOPEN_BLOCK_TITLES[reopen.block.code]}
      </p>
      <AlertDescription>{reopen.block.message}</AlertDescription>
    </Alert>
  );
}

export function SRStatusActions({
  srId,
  srNumber,
  status,
  userRoles,
  canConfirm,
  reopen,
  rejectBlocked = false,
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
   * 재오픈 가능 여부는 상태 머신에서 도출한다(`reopen` prop).
   *
   * 예전에는 `isManager = hasRole(['ADMIN','MANAGER'])` 로 여기서 독립 판단했는데,
   * 재오픈 규칙에는 MANAGER 가 없어서 버튼은 보이고 서버는 항상 거부하는 막다른 길이
   * 생겼다(감사 4.3). 규칙을 바꿀 때 UI 가 따라오지 않으면 같은 발산이 반복된다.
   */
  const reopenBlocked = Boolean(reopen.block);

  // 모바일에서는 아이콘뿐이므로 이름(aria-label)은 '재오픈' 그대로 두고, 막힌 이유는
  // 설명(aria-describedby)으로 화면의 안내 문단을 가리킨다. 이름에 이유를 섞으면
  // e2e 헬퍼의 `/^재오픈$/` 도, 낭독기 사용자의 버튼 탐색도 함께 깨진다.
  //
  // `title` 에도 이유를 싣지 않는다(다른 버튼들과 같이 이름만 둔다). 비활성 버튼은
  // `disabled:pointer-events-none` 이라 마우스 툴팁이 아예 뜨지 않고, aria-describedby 가
  // 있으면 접근 가능한 설명도 title 이 아니라 그쪽을 쓴다 — 실제로 아무 데도 닿지 않는 문구다.
  const renderReopenButton = () => (
    <Button
      variant="outline"
      onClick={() => setReopenDialogOpen(true)}
      disabled={!!loadingAction || reopenBlocked}
      aria-label="재오픈"
      aria-describedby={reopenBlocked ? REOPEN_BLOCKED_REASON_ID : undefined}
      className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
      title="재오픈"
    >
      <RotateCcw className="h-4 w-4 md:mr-2" />
      <span className="hidden md:inline">재오픈</span>
    </Button>
  );

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
        // 접수됨 상태: 진행 시작, 거절. 보류는 진행 중에만 된다(상태머신 INTAKE → IN_PROGRESS·REJECTED).
        // 거절 버튼이 없어서 접수 뒤 범위 밖으로 판명된 SR 을 화면으로는 거절할 수 없었다 — 전이표·
        // status 라우트·헌법은 모두 허용한다.
        if (!canManage) return null;
        return (
          <>
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
            {/* 한 번 완료된 SR 은 거절로 끝내지 않는다(D9) — 재작업을 마치면 다시 완료로 종결한다. */}
            {!rejectBlocked && (
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
            )}
          </>
        );

      case 'COMPLETED':
        // 완료 상태: 확인 완료 (canConfirm — 신청자, 또는 운영자가 등록한 SR 의 고객사 관리자), 재오픈
        return (
          <>
            {canConfirm && (
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
            {reopen.visible && renderReopenButton()}
          </>
        );

      case 'CONFIRMED':
        // 확인완료 상태: 재오픈 (확인 후 7일 이내, 관리자/신청자)
        if (!reopen.visible) return null;
        return renderReopenButton();

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
        // 버튼이 막혀 있으면 다이얼로그는 열리지 않지만, 열린 뒤에 막히는 경우(판정 갱신)에도
        // 같은 이유로 제출을 막도록 함께 넘긴다.
        disabledReason={reopen.block?.message ?? null}
      />
    </>
  );
}
