import { memo } from 'react';
import Link from 'next/link';

import { Badge, Button } from '@/components/ui';
import { getDueDateStatus } from '@/lib/date-utils';
import { SRListItem } from '@/types/sr.types';

import { priorityColors, priorityLabels, statusColors, statusLabels } from './constants';

interface SRCardItemProps {
  sr: SRListItem;
  canManageIntake: boolean;
  onCardClick: (id: string) => void;
  onIntakeClick: (id: string) => void;
}

export const SRCardItem = memo(function SRCardItem({
  sr,
  canManageIntake,
  onCardClick,
  onIntakeClick,
}: SRCardItemProps) {
  const dueDateStatus = getDueDateStatus(
    sr.dueDate ? new Date(sr.dueDate).toISOString() : null,
    sr.status
  );

  return (
    <div
      className="border rounded-lg p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={() => onCardClick(sr.id)}
    >
      {/* Header: SR Number, Status, Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <Link
            href={`/srs/${sr.id}`}
            className="font-semibold text-base text-primary hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {sr.srNumber}
          </Link>
          <Badge
            variant={statusColors[sr.status]}
            className="text-[10px] h-5 px-1.5 shrink-0"
          >
            {statusLabels[sr.status]}
          </Badge>
          <Badge
            variant={priorityColors[sr.priority]}
            className="text-[10px] h-5 px-1.5 shrink-0"
          >
            {priorityLabels[sr.priority]}
          </Badge>
        </div>
        {/* Action Button */}
        {canManageIntake && sr.status === 'REQUESTED' && (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs bg-[hsl(var(--sr-primary-dark))] shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onIntakeClick(sr.id);
            }}
          >
            접수
          </Button>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm truncate mb-2">{sr.title}</h4>

      {/* 2-Column Grid Info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-relaxed">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">고객사</span>
          <span className="truncate text-foreground font-medium">{sr.client.name}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">담당자</span>
          <span className="truncate text-foreground font-medium">
            {sr.assignee?.name || '-'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">마감일</span>
          <div className="flex-1 min-w-0">
            {dueDateStatus ? (
              <Badge
                variant={dueDateStatus.variant}
                className="text-[9px] h-3.5 px-1 font-bold"
              >
                {dueDateStatus.label}
              </Badge>
            ) : (
              <span className="text-foreground">-</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">등록일</span>
          <span className="text-foreground">
            {new Date(sr.createdAt).toLocaleDateString('ko-KR').slice(2)}
          </span>
        </div>
      </div>
    </div>
  );
});
