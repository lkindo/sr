'use client';

import { AlertTriangle, FileText } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui';
import { Badge } from '@/components/ui';
import { ScrollArea } from '@/components/ui';

export interface OngoingSR {
  id: string;
  srNumber: string;
  title: string;
  status: string;
  priority: string;
  clientName: string;
  assigneeName?: string;
}

interface UserReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  sourceClientName: string;
  targetClientName: string;
  onConfirm: (force?: boolean) => void;
  isLoading?: boolean;
  ongoingSRs?: OngoingSR[];
  showWarning?: boolean;
}

export function UserReassignDialog({
  open,
  onOpenChange,
  userName,
  sourceClientName,
  targetClientName,
  onConfirm,
  isLoading = false,
  ongoingSRs = [],
  showWarning = false,
}: UserReassignDialogProps) {
  const hasOngoingSRs = ongoingSRs.length > 0;

  const getStatusBadge = (status: string) => {
    const statusMap: Record<
      string,
      { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
    > = {
      REQUESTED: { label: '요청됨', variant: 'secondary' },
      INTAKE: { label: '접수중', variant: 'default' },
      IN_PROGRESS: { label: '진행중', variant: 'default' },
      ON_HOLD: { label: '보류', variant: 'outline' },
    };
    const statusInfo = statusMap[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<
      string,
      { label: string; variant: 'default' | 'destructive' | 'secondary' }
    > = {
      CRITICAL: { label: '긴급', variant: 'destructive' },
      HIGH: { label: '높음', variant: 'destructive' },
      MEDIUM: { label: '보통', variant: 'default' },
      LOW: { label: '낮음', variant: 'secondary' },
    };
    const priorityInfo = priorityMap[priority] || {
      label: priority,
      variant: 'secondary' as const,
    };
    return <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasOngoingSRs && showWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            사용자 소속 변경
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <strong>{userName}</strong> 사용자의 소속을 변경하시겠습니까?
              </p>
              <div className="text-sm bg-muted p-3 rounded-md space-y-1">
                <div>
                  <span className="text-muted-foreground">현재:</span>{' '}
                  <strong>{sourceClientName}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">변경:</span>{' '}
                  <strong className="text-primary">{targetClientName}</strong>
                </div>
              </div>

              {hasOngoingSRs && showWarning && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 rounded-md space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="font-semibold text-amber-900 dark:text-amber-100">
                        진행 중인 SR {ongoingSRs.length}건이 있습니다
                      </div>
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        이 사용자가 담당하거나 요청한 진행 중인 SR이 있습니다. 소속을 변경해도 기존
                        SR은 그대로 유지되지만, 다른 담당자에게 재할당하는 것을 권장합니다.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
                      <FileText className="h-4 w-4" />
                      진행 중인 SR 목록
                    </div>
                    <ScrollArea className="h-48 rounded-md border bg-card">
                      <div className="p-3 space-y-2">
                        {ongoingSRs.map((sr) => (
                          <div
                            key={sr.id}
                            className="p-3 bg-muted rounded-md space-y-2 hover:bg-accent transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">
                                  {sr.srNumber}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {sr.title}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {getStatusBadge(sr.status)}
                                {getPriorityBadge(sr.priority)}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>고객사: {sr.clientName}</span>
                              {sr.assigneeName && <span>담당자: {sr.assigneeName}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>취소</AlertDialogCancel>
          {showWarning ? (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // 자동 닫힘 방지
                onConfirm(true);
              }}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  처리 중...
                </span>
              ) : (
                '진행 중인 SR 유지하고 이동'
              )}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // 자동 닫힘 방지
                onConfirm(false);
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  처리 중...
                </span>
              ) : (
                '확인'
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
