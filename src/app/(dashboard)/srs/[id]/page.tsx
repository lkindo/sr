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
import { EditSRDialog } from '@/components/srs/EditSRDialog';
import { IntakeInfoCard } from '@/components/srs/IntakeInfoCard';
import { SRActivities } from '@/components/srs/SRActivities';
import { SRAttachments } from '@/components/srs/SRAttachments';
import { SRComments } from '@/components/srs/SRComments';
import { SRStatusActions } from '@/components/srs/SRStatusActions';
import { SRStatusTimeline } from '@/components/srs/SRStatusTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteSR, useSRDetails } from '@/hooks/use-sr';
import { useToast } from '@/hooks/use-toast';
import { priorityLabels, statusLabels } from '@/lib/constants/sr';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  REQUESTED: 'secondary',
  INTAKE: 'default',
  IN_PROGRESS: 'default',
  ON_HOLD: 'secondary',
  COMPLETED: 'default',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
};

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};

export default function SRDetailPage() {
  const params = useParams();
  const router = useRouter();
  const srId = params.id as string;

  const [activeTab, setActiveTab] = useState('comments');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { toast } = useToast();
  const { hasAnyRole, roles } = usePermissions();
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
              <Link href="/srs">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-3xl font-bold tracking-tight leading-none">
                  {sr.srNumber}
                </h2>
                <div className="flex gap-1.5 shrink-0">
                  <Badge
                    variant={statusColors[sr.status]}
                    className="h-5 px-1.5 text-[10px] md:text-xs md:h-6 md:px-2.5"
                  >
                    {statusLabels[sr.status]}
                  </Badge>
                  <Badge
                    variant={priorityColors[sr.requestedPriority]}
                    className="h-5 px-1.5 text-[10px] md:text-xs md:h-6 md:px-2.5"
                  >
                    {priorityLabels[sr.requestedPriority]}
                  </Badge>
                </div>
              </div>
              <p className="text-base md:text-2xl font-semibold truncate leading-tight">
                {sr.title}
              </p>
            </div>
          </div>

          {/* Action Buttons - Mobile: Icon only */}
          <div className="flex gap-1 shrink-0">
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
            {session?.user && (
              <div className="flex">
                {/* SRStatusActions returns buttons, assume it handles responsive or is just one button. 
                     If it returns multiple buttons, this might need deeper dive. 
                     For now, wrapping standard buttons. */}
                <SRStatusActions
                  srId={srId}
                  srNumber={sr.srNumber}
                  status={sr.status as any}
                  completedAt={sr.completedAt}
                  userRoles={roles || []}
                  isRequestor={session.user.id === sr.requesterId}
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (sr.status === 'REQUESTED' || hasAnyRole(['ADMIN'])) {
                  setIsEditDialogOpen(true);
                } else {
                  toast({
                    title: '알림',
                    description: "SR 수정은 '요청됨' 상태인 경우에만 가능합니다.",
                    variant: 'default',
                  });
                }
              }}
              disabled={sr.status !== 'REQUESTED' && !hasAnyRole(['ADMIN'])}
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
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-3 md:items-stretch">
        {/* Details Card */}
        <div className="md:col-span-2 space-y-4 md:space-y-6 flex flex-col">
          <div className="p-4 md:p-6 bg-white rounded-lg shadow border flex-1">
            <h3 className="text-base md:text-lg font-semibold mb-3">상세 정보</h3>
            <div className="space-y-3 md:space-y-4">
              <div>
                <h4 className="text-xs md:text-sm font-medium text-muted-foreground mb-1">
                  요청 내용
                </h4>
                <p className="text-sm md:text-base text-foreground whitespace-pre-line leading-relaxed">
                  {sr.description}
                </p>
              </div>

              {/* Mobile: Use 2 columns for better density */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:gap-4">
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">고객사</h4>
                  <p className="text-sm mt-0.5">{sr.client?.name || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">카테고리</h4>
                  <p className="text-sm mt-0.5">{sr.serviceCategory?.categoryName || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">요청자</h4>
                  <p className="text-sm mt-0.5">{sr.requester?.name || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">담당자</h4>
                  <p className="text-sm mt-0.5">{sr.assignee?.name || '미지정'}</p>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">
                    요청 우선순위
                  </h4>
                  <p className="text-sm mt-0.5">{priorityLabels[sr.requestedPriority]}</p>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">
                    실제 우선순위
                  </h4>
                  <p className="text-sm mt-0.5">
                    {sr.actualPriority ? priorityLabels[sr.actualPriority] : 'N/A'}
                  </p>
                </div>
                {sr.status === 'REQUESTED' && sr.estimatedCompletionDate && (
                  <div>
                    <h4 className="text-xs md:text-sm font-medium text-muted-foreground">
                      예상 완료일
                    </h4>
                    <p className="text-sm mt-0.5">
                      {new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                )}
                {['INTAKE', 'IN_PROGRESS', 'ON_HOLD'].includes(sr.status as string) &&
                  sr.estimatedCompletionDate && (
                    <div className="col-span-2 md:col-span-1">
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground">
                        SLA 마감일
                      </h4>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-sm">
                          {new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR')}
                        </span>
                        {(() => {
                          const days = Math.ceil(
                            (new Date(sr.estimatedCompletionDate).getTime() -
                              new Date().getTime()) /
                              (1000 * 60 * 60 * 24)
                          );
                          const variant =
                            days < 0
                              ? 'destructive'
                              : days <= 1
                                ? 'destructive'
                                : days <= 3
                                  ? 'secondary'
                                  : 'default';
                          const label = days <= 0 ? '지연' : `${days}일 남음`;
                          return (
                            <Badge
                              variant={variant}
                              className="h-4 px-1 text-[10px] md:h-5 md:px-2"
                            >
                              {label}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                {/* Attachment Summary Inline for Mobile */}
                <div>
                  <h4 className="text-xs md:text-sm font-medium text-muted-foreground">첨부파일</h4>
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
                canDelete={
                  hasAnyRole(['ADMIN', 'MANAGER']) ||
                  (session?.user?.id === sr.requesterId && sr.status === 'REQUESTED')
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
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
