// src/app/(dashboard)/srs/[id]/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  MessageSquare,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react';

import { TableSkeleton } from '@/components/loading/TableSkeleton';
import { DeleteSRDialog } from '@/components/srs/DeleteSRDialog';
import { DueDateAdjustDialog } from '@/components/srs/DueDateAdjustDialog';
import { EditSRDialog } from '@/components/srs/EditSRDialog';
import { IntakeInfoCard } from '@/components/srs/IntakeInfoCard';
import { SRActivities } from '@/components/srs/SRActivities';
import { SRAttachments } from '@/components/srs/SRAttachments';
import { SRComments } from '@/components/srs/SRComments';
import { SRDueDateField } from '@/components/srs/SRDueDateField';
import { SRReopenBlockedNotice, SRStatusActions } from '@/components/srs/SRStatusActions';
import { SRStatusBadge } from '@/components/srs/SRStatusBadge';
import { SRStatusTimeline } from '@/components/srs/SRStatusTimeline';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { CopyButton } from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteSR, useSRDetails } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import { priorityBadgeVariantOf, priorityLabels } from '@/lib/constants/sr';
import {
  canEditSRContentAt,
  canViewerAdjustDueDate,
  canViewerAttachToSR,
  canViewerConfirmSR,
  getReopenAvailability,
  isRejectBlockedAfterCompletion,
  SR_CONTENT_LOCKED_MESSAGE,
} from '@/lib/sr-state-machine';

export default function SRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const srId = params.id as string;

  const [activeTab, setActiveTab] = useState('comments');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDueDateDialogOpen, setIsDueDateDialogOpen] = useState(false);

  const { toast } = useToast();
  const { hasAnyRole, roles, permissions } = usePermissions();
  const { data: session } = useSession();

  // React Query를 사용한 SR 상세 조회
  const { data: sr, isLoading, error, refetch } = useSRDetails(srId);

  // SR 삭제 mutation
  const deleteMutation = useDeleteSR();

  const handleSRUpdated = () => {
    setIsEditDialogOpen(false);
    // React Query가 자동으로 최신 데이터를 가져옴
  };

  if (isLoading) {
    return <TableSkeleton columns={5} />;
  }

  if (error || !sr) {
    return (
      <div className="text-center p-8">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">SR을 불러올 수 없습니다</h2>
        <p className="mt-2 text-muted-foreground">
          {error instanceof Error
            ? error.message
            : '요청한 SR을 찾을 수 없거나 오류가 발생했습니다.'}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={() => refetch()} variant="outline">
            다시 시도
          </Button>
          <Button asChild>
            <Link href="/srs">목록으로 돌아가기</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 접수 이후 SR 내용은 운영자만 고친다(서버: policies.ensureCanEditSRContent 와 같은 판정 함수).
  // (ENGINEER 가 자기 배정분만 고칠 수 있다는 범위는 이 화면에 들어온 시점에 이미 걸러져 있다.)
  const canEditContent = canEditSRContentAt(sr.status, { roles: roles || [], permissions });
  // 마감일 수동 조정은 운영자 소유 값이다(헌법 §3 — 서버: 운영자 필드 규칙 + 사유 필수·비우기 금지).
  // 한 번 완료된 SR 은 접수 권한자(ADMIN·MANAGER)만 조정한다(D9 — 서버와 같은 판정 함수).
  const canAdjustDueDate = canViewerAdjustDueDate({ roles: roles || [], permissions }, sr);

  // 재오픈 버튼과 그 아래 안내가 같은 판정을 보도록 한 번만 계산한다.
  // 서버와 같은 규칙(sr-state-machine)이므로 확인완료 SR 은 confirmedAt 을, 담당자·고객사
  // 소속·신청자 여부까지 함께 넘겨야 화면과 서버의 답이 갈리지 않는다.
  const reopen = session?.user
    ? getReopenAvailability(
        sr.status,
        {
          completedAt: sr.completedAt,
          confirmedAt: sr.confirmedAt,
          assigneeId: sr.assigneeId,
          clientId: sr.clientId,
          requesterId: sr.requesterId,
        },
        {
          id: session.user.id,
          roles: roles || [],
          permissions,
          clientIds: session.user.clientIds ?? [],
        }
      )
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 md:gap-4 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="shrink-0 -ml-2 md:ml-0 h-8 w-8 md:h-9 md:w-9"
            >
              {/* 아이콘만 있는 링크는 낭독기에 이름 없는 링크로 읽힌다(axe link-name). */}
              <Link href="/srs" aria-label="SR 목록으로 돌아가기">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-3xl font-bold tracking-tight leading-none">
                  {sr.srNumber}
                </h1>
                <CopyButton
                  value={sr.srNumber}
                  className="text-muted-foreground hover:text-foreground"
                />
                <div className="flex gap-1.5 shrink-0">
                  {/*
                    상태 배지 문구는 액션 버튼 문구와 겹친다 — ON_HOLD 라벨을 '보류' 로
                    통일하면서(2026-08-09) 배지 '보류' 와 SRStatusActions 의 '보류' 버튼이
                    같은 화면에 같은 글자로 존재하게 됐다. 텍스트로 배지를 겨냥하면
                    버튼에 먼저 걸리므로 테스트가 잡을 훅을 배지 자신에게 준다.
                  */}
                  <SRStatusBadge
                    data-testid="sr-status-badge"
                    status={sr.status}
                    className="h-5 px-1.5 text-[10px] md:text-xs md:h-6 md:px-2.5"
                  />
                  <Badge
                    variant={priorityBadgeVariantOf(sr.requestedPriority)}
                    className="h-5 px-1.5 text-[10px] md:text-xs md:h-6 md:px-2.5"
                  >
                    {priorityLabels[sr.requestedPriority]}
                  </Badge>
                </div>
              </div>
              <p
                data-testid="sr-title"
                className="text-base md:text-2xl font-semibold truncate leading-tight"
              >
                {sr.title}
              </p>
            </div>
          </div>

          {/* Action Buttons - Mobile: Icon only */}
          <div className="flex gap-1.5 md:gap-2 shrink-0">
            {((sr.status as string) === 'INTAKE' || (sr.status as string) === 'IN_PROGRESS') &&
              hasAnyRole(['MANAGER', 'ADMIN']) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/srs/${srId}/intake`)}
                  className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
                  title="접수 정보 수정"
                >
                  <Clock className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">접수 정보 수정</span>
                </Button>
              )}
            {session?.user && reopen && (
              <div className="flex">
                {/* SRStatusActions returns buttons, assume it handles responsive or is just one button. 
                     If it returns multiple buttons, this might need deeper dive. 
                     For now, wrapping standard buttons. */}
                <SRStatusActions
                  srId={srId}
                  srNumber={sr.srNumber}
                  status={sr.status as any}
                  userRoles={roles || []}
                  canConfirm={canViewerConfirmSR(
                    {
                      id: session.user.id,
                      roles: roles || [],
                      permissions,
                      clientIds: session.user.clientIds ?? [],
                    },
                    sr
                  )}
                  reopen={reopen}
                  rejectBlocked={isRejectBlockedAfterCompletion(sr)}
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (canEditContent) {
                  setIsEditDialogOpen(true);
                } else {
                  toast({
                    title: '알림',
                    description: SR_CONTENT_LOCKED_MESSAGE,
                    variant: 'default',
                  });
                }
              }}
              disabled={!canEditContent}
              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
              title="수정"
            >
              <Pencil className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">수정</span>
            </Button>
            {hasAnyRole(['ADMIN', 'MANAGER', 'CLIENT_ADMIN']) && (
              <Button
                onClick={() => setIsDeleteDialogOpen(true)}
                variant="destructive"
                size="sm"
                className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3"
                title="삭제"
              >
                <Trash2 className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">삭제</span>
              </Button>
            )}
          </div>
        </div>

        {/* 재오픈 버튼이 막혀 있으면 그 이유를 헤더 바로 아래 전체 폭으로 보인다.
            모바일에서 버튼은 아이콘뿐이라 이 안내가 유일한 설명이다. */}
        {reopen && <SRReopenBlockedNotice reopen={reopen} />}
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-3 md:items-stretch">
        {/* Details Card */}
        <div className="md:col-span-2 space-y-4 md:space-y-6 flex flex-col">
          <div className="p-4 md:p-6 bg-card rounded-lg shadow border flex-1">
            {/* 페이지 제목이 h1 이므로 섹션 제목은 h2 여야 한다. h1 → h3 로 건너뛰면
                낭독기 사용자가 구조를 잘못 파악한다(axe: heading-order). */}
            <h2 className="text-base md:text-lg font-semibold mb-3">상세 정보</h2>
            <div className="space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-1">
                  요청 내용
                </h3>
                <p className="text-sm md:text-base text-foreground whitespace-pre-line leading-relaxed">
                  {sr.description}
                </p>
              </div>

              {/* Mobile: Use 2 columns for better density */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:gap-4">
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">고객사</h3>
                  <p className="text-sm mt-0.5">{sr.client?.name || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">카테고리</h3>
                  <p className="text-sm mt-0.5">{sr.serviceCategory?.categoryName || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">요청자</h3>
                  <p className="text-sm mt-0.5">{sr.requester?.name || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">담당자</h3>
                  <p className="text-sm mt-0.5">{sr.assignee?.name || '미지정'}</p>
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">
                    요청 우선순위
                  </h3>
                  <p className="text-sm mt-0.5">{priorityLabels[sr.requestedPriority]}</p>
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">
                    실제 우선순위
                  </h3>
                  <p className="text-sm mt-0.5">
                    {sr.actualPriority ? priorityLabels[sr.actualPriority] : 'N/A'}
                  </p>
                </div>
                {sr.status === 'REQUESTED' && sr.estimatedCompletionDate && (
                  <div>
                    <h3 className="text-xs md:text-sm font-medium text-muted-foreground">
                      예상 완료일
                    </h3>
                    <p className="text-sm mt-0.5">
                      {new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                )}
                {['INTAKE', 'IN_PROGRESS', 'ON_HOLD'].includes(sr.status as string) && (
                  <SRDueDateField
                    dueDate={sr.dueDate}
                    dueDateManual={sr.dueDateManual}
                    status={sr.status}
                    canAdjust={canAdjustDueDate}
                    onAdjust={() => setIsDueDateDialogOpen(true)}
                  />
                )}

                {/* Attachment Summary Inline for Mobile */}
                <div>
                  <h3 className="text-xs md:text-sm font-medium text-muted-foreground">첨부파일</h3>
                  <div
                    className="mt-0.5 flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors text-sm"
                    onClick={() => setActiveTab('attachments')}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="font-medium">{sr._count?.attachments || 0}개</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Intake Info Card */}
          <IntakeInfoCard sr={sr} />

          {/* Status History Timeline */}
          {sr.statusHistory && sr.statusHistory.length > 0 && (
            <SRStatusTimeline statusHistory={sr.statusHistory} currentStatus={sr.status} />
          )}
        </div>

        {/* Tabs for comments, activities, attachments */}
        <div className="md:col-span-1 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="comments" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> 댓글{' '}
                {sr._count?.comments > 0 && `(${sr._count.comments})`}
              </TabsTrigger>
              <TabsTrigger value="activities" className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> 활동 이력
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> 첨부파일{' '}
                {sr._count?.attachments > 0 && `(${sr._count.attachments})`}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="mt-6">
              <SRComments srId={sr.id} />
            </TabsContent>
            <TabsContent value="activities" className="mt-6">
              <SRActivities srId={sr.id} />
            </TabsContent>
            <TabsContent value="attachments" className="mt-6">
              <SRAttachments
                srId={sr.id}
                /*
                  권위는 서버에 있다 — src/lib/policies.ts 의 canDeleteAttachment 가
                  DELETE /api/attachments/[id] 를 게이트한다. 여기 조건은 그것을 그대로
                  미러링해 "누르면 반드시 실패하는 버튼" 을 만들지 않기 위한 것이다.
                  (policies.ts 를 직접 import 하지 않는 이유: 그 모듈이 @prisma/client 와
                   logger 를 끌어와 클라이언트 번들에 들어가면 안 된다. 순수 규칙만 떼어낸
                   클라이언트 안전 모듈로 분리하는 것이 다음 단계다.)
                */
                canDelete={
                  hasAnyRole(['ADMIN', 'MANAGER']) ||
                  (session?.user?.id === sr.requesterId && sr.status === 'REQUESTED')
                }
                canUpload={
                  !!session?.user &&
                  canViewerAttachToSR(
                    {
                      id: session.user.id,
                      roles: roles || [],
                      permissions,
                      clientIds: session.user.clientIds ?? [],
                    },
                    sr
                  )
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      {isDueDateDialogOpen && (
        <DueDateAdjustDialog
          srId={srId}
          srNumber={sr.srNumber}
          currentDueDate={sr.dueDate}
          open={isDueDateDialogOpen}
          onOpenChange={setIsDueDateDialogOpen}
        />
      )}

      <EditSRDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        sr={sr}
        onUpdated={handleSRUpdated}
      />
      <DeleteSRDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        sr={sr}
        onDelete={async (srId) => {
          await deleteMutation.mutateAsync(srId);
        }}
      />
    </div>
  );
}
