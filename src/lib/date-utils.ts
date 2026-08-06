import { diffCalendarDaysInAppZone } from './timezone';

export function getDaysUntilDue(dueDate: string | Date | null | undefined): number | null {
  if (!dueDate) return null;

  // 일 경계를 앰비언트 로컬 타임존이 아니라 KST 달력으로 잡는다.
  // `setHours(0,0,0,0)` 는 UTC 컨테이너에서는 UTC 자정, 브라우저에서는 KST 자정을 뜻해
  // 같은 dueDate 가 서버에서 '오늘 마감', 클라이언트에서 'D-1' 로 갈렸다(감사 3.25).
  return diffCalendarDaysInAppZone(dueDate);
}

export function getDueDateStatus(
  dueDate: string | Date | null | undefined,
  status?: string
): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive';
  isOverdue: boolean;
  isUrgent: boolean;
} | null {
  // 완료/확인완료 상태: 마감일 대신 완료 표시
  if (status === 'COMPLETED' || status === 'CONFIRMED') {
    return {
      label: '완료됨',
      variant: 'default',
      isOverdue: false,
      isUrgent: false,
    };
  }

  // 보류 상태: 보류 표시
  if (status === 'ON_HOLD') {
    return {
      label: '보류중',
      variant: 'secondary',
      isOverdue: false,
      isUrgent: false,
    };
  }

  // 거절 상태: 거절 표시
  if (status === 'REJECTED') {
    return {
      label: '거절됨',
      variant: 'destructive',
      isOverdue: false,
      isUrgent: false,
    };
  }

  // 진행중인 SR만 마감일 계산
  const daysUntil = getDaysUntilDue(dueDate);

  if (daysUntil === null) {
    return null;
  }

  if (daysUntil < 0) {
    return {
      label: `${Math.abs(daysUntil)}일 지연`,
      variant: 'destructive',
      isOverdue: true,
      isUrgent: false,
    };
  }

  if (daysUntil === 0) {
    return {
      label: '오늘 마감',
      variant: 'destructive',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil === 1) {
    return {
      label: '내일 마감',
      variant: 'destructive',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil <= 3) {
    return {
      label: `D-${daysUntil}`,
      variant: 'destructive',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil <= 7) {
    return {
      label: `D-${daysUntil}`,
      variant: 'secondary',
      isOverdue: false,
      isUrgent: false,
    };
  }

  return {
    label: `D-${daysUntil}`,
    variant: 'default',
    isOverdue: false,
    isUrgent: false,
  };
}
