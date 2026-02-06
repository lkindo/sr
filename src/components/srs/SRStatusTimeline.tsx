'use client';

import { AlertCircle, CheckCircle, Clock, Pause, User, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { statusLabels } from '@/lib/constants/sr';
import { cn } from '@/lib/utils';

interface StatusHistoryItem {
  id: string;
  previousStatus: string | null;
  currentStatus: string;
  changedAt: Date | string;
  changeReason: string | null;
  user: {
    id: string;
    name: string;
    image: string | null;
  };
}

interface SRStatusTimelineProps {
  statusHistory: StatusHistoryItem[];
  currentStatus: string;
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  REQUESTED: 'secondary',
  INTAKE: 'default',
  IN_PROGRESS: 'default',
  ON_HOLD: 'secondary',
  COMPLETED: 'default',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
};

const statusIcons: Record<string, React.ElementType> = {
  REQUESTED: AlertCircle,
  INTAKE: Clock,
  IN_PROGRESS: Clock,
  ON_HOLD: Pause,
  COMPLETED: CheckCircle,
  CONFIRMED: CheckCircle,
  REJECTED: XCircle,
};

/**
 * 경과 시간을 한국어로 표시
 */
const getTimeAgo = (date: Date | string): string => {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffWeeks < 4) return `${diffWeeks}주 전`;
  return `${diffMonths}개월 전`;
};

export function SRStatusTimeline({ statusHistory, currentStatus }: SRStatusTimelineProps) {
  if (!statusHistory || statusHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>상태 변경 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">상태 변경 이력이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>상태 변경 이력</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {statusHistory.map((history, index) => {
            const Icon = statusIcons[history.currentStatus] || Clock;
            const isCurrentStatus = history.currentStatus === currentStatus;
            const isMostRecent = index === 0;

            return (
              <div key={history.id} className="relative">
                {/* 타임라인 연결선 */}
                {index < statusHistory.length - 1 && (
                  <div className="absolute left-[15px] top-8 bottom-0 w-[2px] bg-border" />
                )}

                <div className="flex gap-4">
                  {/* 아이콘 */}
                  <div
                    className={cn(
                      'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                      isCurrentStatus
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={statusColors[history.currentStatus]}
                        className={cn(isCurrentStatus && 'ring-2 ring-primary ring-offset-2')}
                      >
                        {statusLabels[history.currentStatus]}
                      </Badge>
                      {isMostRecent && (
                        <Badge variant="outline" className="text-xs">
                          최근
                        </Badge>
                      )}
                    </div>

                    {history.changeReason && (
                      <p className="text-sm text-foreground mb-2">{history.changeReason}</p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{history.user.name}</span>
                      <span>•</span>
                      <span>{getTimeAgo(history.changedAt)}</span>
                      <span>•</span>
                      <span>
                        {new Date(history.changedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
