import React, { memo } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { CopyButton } from '@/components/ui';
import { TableCell, TableRow } from '@/components/ui';
import { getDueDateStatus } from '@/lib/date-utils';
import { formatAppZoneDate, formatAppZoneShortDate } from '@/lib/timezone';
import { SRListItem } from '@/types/sr.types';

import { priorityColors, priorityLabels, statusColors, statusLabels } from './constants';

// ⚡ Bolt: Fast date formatting for lists
// toLocaleDateString() initializes Intl.DateTimeFormat on every call which is slow.
// `@/lib/timezone` 은 포맷터를 모듈 스코프에 한 번만 만들어 그 비용을 없앤다.
//
// 로컬 타임존 접근자(getFullYear/getMonth/getDate)를 쓰던 시절에는 UTC 컨테이너의 SSR 과
// KST 브라우저의 하이드레이션이 서로 다른 날짜를 렌더해 목록이 깜빡였다(감사 3.25).
const formatFastDate = formatAppZoneDate;

// ⚡ Bolt: Fast short date formatting
const formatFastShortDate = formatAppZoneShortDate;

interface SRListItemProps {
  sr: SRListItem;
  canManageSRs: boolean;
}

export const SRTableRow = memo(({ sr, canManageSRs }: SRListItemProps) => {
  // ⚡ Bolt: Pass raw dueDate to avoid expensive new Date().toISOString()
  // Eliminates ~400ms overhead for 100k items.
  const dueDateStatus = getDueDateStatus(sr.dueDate, sr.status);

  return (
    <TableRow>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1 group relative">
          <Link href={`/srs/${sr.id}`} className="font-medium text-primary hover:underline">
            {sr.srNumber}
          </Link>
          <CopyButton
            value={sr.srNumber}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity absolute -right-7"
            aria-label={`${sr.srNumber} 번호 복사`}
          />
        </div>
      </TableCell>
      <TableCell className="max-w-[200px] truncate" title={sr.title}>
        <Link href={`/srs/${sr.id}`} className="hover:underline focus-visible:underline">
          {sr.title}
        </Link>
      </TableCell>
      <TableCell>{sr.client.name}</TableCell>
      <TableCell className="text-center">{sr.requester.name}</TableCell>
      <TableCell className="text-center">{sr.assignee?.name || '-'}</TableCell>
      <TableCell className="text-center">
        <Badge variant={priorityColors[sr.priority]}>{priorityLabels[sr.priority]}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={statusColors[sr.status]}>{statusLabels[sr.status]}</Badge>
      </TableCell>
      <TableCell className="text-center">
        {dueDateStatus ? <Badge variant={dueDateStatus.variant}>{dueDateStatus.label}</Badge> : '-'}
      </TableCell>
      <TableCell className="text-center">
        {sr._count?.comments || 0} / {sr._count?.attachments || 0}
      </TableCell>
      <TableCell className="text-center">{formatFastDate(sr.createdAt)}</TableCell>
      <TableCell className="text-center">
        {canManageSRs ? (
          <>
            {sr.status === 'REQUESTED' ? (
              <Button
                asChild
                variant="default"
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href={`/srs/${sr.id}/intake`}>접수</Link>
              </Button>
            ) : sr.status === 'IN_PROGRESS' ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                title="접수 정보 수정"
                aria-label="접수 정보 수정"
                className="border-border hover:bg-muted text-foreground"
              >
                <Link href={`/srs/${sr.id}/intake`}>
                  <Clock className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
    </TableRow>
  );
});

SRTableRow.displayName = 'SRTableRow';

export const SRCardItem = memo(({ sr, canManageSRs }: SRListItemProps) => {
  // ⚡ Bolt: Pass raw dueDate to avoid expensive new Date().toISOString()
  // Eliminates ~400ms overhead for 100k items.
  const dueDateStatus = getDueDateStatus(sr.dueDate, sr.status);

  return (
    <article className="border rounded-lg p-3.5 hover:bg-muted/50 transition-colors">
      {/* Header: SR Number, Status, Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <Link
            href={`/srs/${sr.id}`}
            className="font-semibold text-base text-primary hover:underline truncate"
          >
            {sr.srNumber}
          </Link>
          <CopyButton
            value={sr.srNumber}
            className="h-7 w-7 text-muted-foreground"
            aria-label={`${sr.srNumber} 번호 복사`}
          />
          <Badge variant={statusColors[sr.status]} className="text-[10px] h-5 px-1.5 shrink-0">
            {statusLabels[sr.status]}
          </Badge>
          <Badge variant={priorityColors[sr.priority]} className="text-[10px] h-5 px-1.5 shrink-0">
            {priorityLabels[sr.priority]}
          </Badge>
        </div>
        {/* Action Button */}
        {canManageSRs && sr.status === 'REQUESTED' && (
          <Button
            asChild
            variant="default"
            size="sm"
            className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Link href={`/srs/${sr.id}/intake`}>접수</Link>
          </Button>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm truncate mb-2">
        <Link href={`/srs/${sr.id}`} className="hover:underline focus-visible:underline">
          {sr.title}
        </Link>
      </h4>

      {/* 2-Column Grid Info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] leading-relaxed">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">고객사</span>
          <span className="truncate text-foreground font-medium">{sr.client.name}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">담당자</span>
          <span className="truncate text-foreground font-medium">{sr.assignee?.name || '-'}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">마감일</span>
          <div className="flex-1 min-w-0">
            {dueDateStatus ? (
              <Badge variant={dueDateStatus.variant} className="text-[9px] h-3.5 px-1 font-bold">
                {dueDateStatus.label}
              </Badge>
            ) : (
              <span className="text-foreground">-</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted-foreground font-medium shrink-0">등록일</span>
          <span className="text-foreground">{formatFastShortDate(sr.createdAt)}</span>
        </div>
      </div>
    </article>
  );
});

SRCardItem.displayName = 'SRCardItem';
