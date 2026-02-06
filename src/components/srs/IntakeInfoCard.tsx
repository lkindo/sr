/**
 * SR 접수 정보 카드 컴포넌트
 */

import { AlertTriangle, Clock, FileText, User } from 'lucide-react';

import { Badge } from '@/components/ui';
import { priorityLabels } from '@/lib/constants/sr';
import type { SRDetails } from '@/types/sr.types';

interface IntakeInfoCardProps {
  sr: SRDetails;
}

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};

export function IntakeInfoCard({ sr }: IntakeInfoCardProps) {
  // 접수 정보가 있는 상태만 표시
  const showIntakeInfo = ['INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED'].includes(
    sr.status
  );

  if (!showIntakeInfo || !sr.intakeAt) {
    return null;
  }

  // 우선순위 변경 여부
  const priorityChanged = sr.requestedPriority !== sr.actualPriority;

  return (
    <div className="p-6 bg-white rounded-lg shadow border">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-[hsl(var(--sr-primary))]" />
        <h3 className="text-lg font-semibold">접수 정보</h3>
      </div>

      <div className="space-y-4">
        {/* 접수자 및 접수 일시 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">접수자</h4>
            </div>
            <p className="mt-1 text-foreground">{sr.intakeBy?.name || 'N/A'}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">접수 일시</h4>
            </div>
            <p className="mt-1 text-foreground">
              {sr.intakeAt
                ? new Date(sr.intakeAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'N/A'}
            </p>
          </div>
        </div>

        {/* 우선순위 비교 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium text-muted-foreground">우선순위</h4>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">요청:</span>
              <Badge variant={priorityColors[sr.requestedPriority]}>
                {priorityLabels[sr.requestedPriority]}
              </Badge>
            </div>
            {sr.actualPriority && (
              <>
                <span className="text-muted-foreground">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">실제:</span>
                  <Badge
                    variant={priorityColors[sr.actualPriority]}
                    className={priorityChanged ? 'ring-2 ring-orange-500 ring-offset-2' : ''}
                  >
                    {priorityLabels[sr.actualPriority]}
                  </Badge>
                  {priorityChanged && (
                    <span className="text-xs text-orange-600 font-medium">변경됨</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 예상 작업 시간 및 완료일 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sr.estimatedHours !== null && sr.estimatedHours !== undefined && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">예상 작업 시간</h4>
              <p className="mt-1 text-foreground">{sr.estimatedHours}시간</p>
            </div>
          )}
          {sr.estimatedCompletionDate && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">예상 완료일</h4>
              <p className="mt-1 text-foreground">
                {new Date(sr.estimatedCompletionDate).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>

        {/* 접수 메모 */}
        {sr.intakeNotes && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">접수 메모</h4>
            <div className="mt-1 p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-sm text-foreground whitespace-pre-line">{sr.intakeNotes}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
