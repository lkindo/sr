'use client';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { getDueDateStatus } from '@/lib/date-utils';
import { formatAppZoneDate, formatAppZoneTime } from '@/lib/timezone';

interface SRDueDateFieldProps {
  dueDate: string | Date | null;
  /** 운영자가 직접 지정한 마감일인가(due_date_manual). */
  dueDateManual: boolean;
  status: string;
  /** 보는 사람이 마감일을 조정할 수 있는가. 참이면 '조정' 버튼을 보인다. */
  canAdjust: boolean;
  onAdjust: () => void;
}

/**
 * SR 상세의 SLA 마감일 칸.
 *
 * 저장된 마감일(dueDate)을 보여 준다. 예전에는 접수자가 고른 **예상 완료일**을 "SLA 마감일" 이라는
 * 이름으로 보여 주고 달력일로 "N일 남음/지연" 을 셌다 — 실제 SLA 판정(시각 기준)과 다른 값이었다.
 * 지연 판정은 목록과 같은 getDueDateStatus 를 쓴다. 직접 지정한 마감일에는 그 사실을 표시한다
 * (이후 우선순위·카테고리 변경의 자동 재산출이 덮어쓰지 않는다 — 헌법 §3).
 */
export function SRDueDateField({
  dueDate,
  dueDateManual,
  status,
  canAdjust,
  onAdjust,
}: SRDueDateFieldProps) {
  const dueDateStatus = getDueDateStatus(dueDate, status);

  return (
    <div className="col-span-2 md:col-span-1">
      <h3 className="text-xs md:text-sm font-medium text-muted-foreground">SLA 마감일</h3>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="text-sm" data-testid="sr-due-date">
          {dueDate ? `${formatAppZoneDate(dueDate)} ${formatAppZoneTime(dueDate)}` : '미산정'}
        </span>
        {dueDateStatus && (
          <Badge variant={dueDateStatus.variant} className="h-4 px-1 text-[10px] md:h-5 md:px-2">
            {dueDateStatus.label}
          </Badge>
        )}
        {dueDateManual && (
          <Badge variant="outline" className="h-4 px-1 text-[10px] md:h-5 md:px-2">
            직접 지정
          </Badge>
        )}
        {canAdjust && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onAdjust}>
            조정
          </Button>
        )}
      </div>
    </div>
  );
}
