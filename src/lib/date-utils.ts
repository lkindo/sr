import { diffCalendarDaysInAppZone, formatAppZoneTime } from './timezone';

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

  // 보류 상태: 보류 표시.
  //
  // 문구를 '보류중' 이 아니라 '보류' 로 둔다 — 상태 배지(statusLabels.ON_HOLD)와
  // 같은 행에 나란히 렌더되기 때문이다(SRListItem.tsx 의 인접 열). 두 배지가
  // '보류' 와 '보류중' 으로 갈리면 사용자는 다른 단계라고 읽는다.
  // 남은 '완료됨' 은 COMPLETED 와 CONFIRMED 를 합쳐 부르므로 단순 치환이 불가하다 — 별건.
  if (status === 'ON_HOLD') {
    return {
      label: '보류',
      variant: 'secondary',
      isOverdue: false,
      isUrgent: false,
    };
  }

  // 거절 상태: 거절 표시.
  // 상태 배지(statusLabels.REJECTED)와 같은 행에 나란히 뜨므로 문구를 맞춘다 —
  // /srs 목록 한 행에서 상태 열 '거절' 옆 마감일 열이 '거절됨' 이면 다른 단계로 읽힌다.
  // (이곳이 두 단어가 실제로 동시에 보이던 유일한 지점이다.)
  if (status === 'REJECTED') {
    return {
      label: '거절',
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

  /**
   * **초과 판정은 달력일이 아니라 시각으로 한다** (헌법 §3).
   *
   * 예전에는 `daysUntil < 0` 하나로 판정했다. 달력일 차이라, 오늘 09:00 이 마감인 SR 은
   * 18:00 이 되어 이미 9시간을 넘겼는데도 `daysUntil === 0` 이라 "오늘 마감"으로 뜨고
   * `isOverdue` 는 거짓이었다. 카테고리 SLA 가 12시간이면 **위반 상태가 하루 종일
   * 정상으로 보인다** — 짧은 SLA 일수록 정확히 안 보이는 구조였다.
   */
  const dueMs = new Date(dueDate as string | Date).getTime();
  const remainingMs = Number.isFinite(dueMs) ? dueMs - Date.now() : null;

  if (remainingMs !== null && remainingMs < 0) {
    // 지연 폭도 시각 기준으로 센다. 24시간 미만이면 '일' 로 반올림하지 않고 시간으로 쓴다.
    const overdueHours = Math.floor(-remainingMs / (60 * 60 * 1000));
    return {
      label:
        overdueHours < 24
          ? `${Math.max(1, overdueHours)}시간 지연`
          : `${Math.floor(overdueHours / 24)}일 지연`,
      variant: 'destructive',
      isOverdue: true,
      isUrgent: false,
    };
  }

  // 24시간 안으로 들어오면 날짜가 아니라 **시각**을 보여 준다.
  // "오늘 마감"만으로는 아침 9시인지 밤 11시인지 알 수 없어 대응 우선순위를 정할 수 없다.
  if (remainingMs !== null && remainingMs < 24 * 60 * 60 * 1000) {
    return {
      label: `${formatAppZoneTime(dueDate as string | Date)} 마감`,
      variant: 'destructive',
      isOverdue: false,
      isUrgent: true,
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
