'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';

import { Badge, Button, TableCell, TableRow } from '@/components/ui';
import { getDueDateStatus } from '@/lib/date-utils';
import { SRListItem } from '@/types/sr.types';

import {
  priorityColors,
  priorityLabels,
  statusColors,
  statusLabels,
} from './constants';

interface SRTableRowProps {
  sr: SRListItem;
  hasManageRole: boolean;
}

export const SRTableRow = memo(function SRTableRow({
  sr,
  hasManageRole,
}: SRTableRowProps) {
  const router = useRouter();

  const dueDateStatus = getDueDateStatus(
    sr.dueDate ? new Date(sr.dueDate).toISOString() : null,
    sr.status
  );

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/srs/${sr.id}`)}
    >
      <TableCell className="font-medium text-primary hover:underline text-center">
        <Link href={`/srs/${sr.id}`}>{sr.srNumber}</Link>
      </TableCell>
      <TableCell className="max-w-[200px] truncate" title={sr.title}>
        {sr.title}
      </TableCell>
      <TableCell>{sr.client.name}</TableCell>
      <TableCell className="text-center">{sr.requester.name}</TableCell>
      <TableCell className="text-center">{sr.assignee?.name || '-'}</TableCell>
      <TableCell className="text-center">
        <Badge variant={priorityColors[sr.priority]}>
          {priorityLabels[sr.priority]}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={statusColors[sr.status]}>{statusLabels[sr.status]}</Badge>
      </TableCell>
      <TableCell className="text-center">
        {dueDateStatus ? (
          <Badge variant={dueDateStatus.variant}>{dueDateStatus.label}</Badge>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell className="text-center">
        {sr._count?.comments || 0} / {sr._count?.attachments || 0}
      </TableCell>
      <TableCell className="text-center">
        {new Date(sr.createdAt)
          .toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
          .replace(/\./g, '. ')
          .trim()}
      </TableCell>
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        {hasManageRole ? (
          <>
            {sr.status === 'REQUESTED' ? (
              <Button
                variant="default"
                size="sm"
                className="bg-[hsl(var(--sr-primary-dark))] text-white hover:bg-[hsl(var(--sr-sidebar-hover))]"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/srs/${sr.id}/intake`);
                }}
              >
                접수
              </Button>
            ) : sr.status === 'IN_PROGRESS' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/srs/${sr.id}/intake`);
                }}
                title="접수 정보 수정"
                aria-label="접수 정보 수정"
              >
                <Clock className="h-4 w-4" />
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
