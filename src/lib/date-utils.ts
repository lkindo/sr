import type { SRBadgeVariant } from './constants/sr';
import { diffCalendarDaysInAppZone, formatAppZoneTime } from './timezone';

export function getDaysUntilDue(dueDate: string | Date | null | undefined): number | null {
  if (!dueDate) return null;

  // 일 경계를 앰비언트 로컬 타임존이 아니라 KST 달력으로 잡는다.
  // `setHours(0,0,0,0)` 는 UTC 컨테이너에서는 UTC 자정, 브라우저에서는 KST 자정을 뜻해
  // 같은 dueDate 가 서버에서 '오늘 마감', 클라이언트에서 'D-1' 로 갈렸다(감사 3.25).
  return diffCalendarDaysInAppZone(dueDate);
}

/**
 * 마감을 넘겼으면 '지연' 문구, 아니면 null. 시각으로 판정한다(헌법 §3) — 24시간 미만은 시간으로 쓴다.
 */
function overdueLabelOf(dueDate: string | Date | null | undefined): string | null {
  if (!dueDate) return null;
  const dueMs = new Date(dueDate).getTime();
  if (!Number.isFinite(dueMs)) return null;
  const remainingMs = dueMs - Date.now();
  if (remainingMs >= 0) return null;
  const overdueHours = Math.floor(-remainingMs / (60 * 60 * 1000));
  return overdueHours < 24
    ? `${Math.max(1, overdueHours)}시간 지연`
    : `${Math.floor(overdueHours / 24)}일 지연`;
}

/**
 * 마감 열의 배지. **상태를 되풀이하지 않는다**(2026-09-18 소유자 결정 D16 2단계).
 *
 * 예전에는 완료·확인완료를 '완료됨', 거절을 '거절', 보류를 '보류' 로 다시 적어 한 행에 빨간 '거절' 이 두 번 나왔다.
 * 상태는 바로 옆 상태 배지가 보인다. 그래서 끝난 SR(완료·확인완료·거절)은 배지가 없고(null — 목록은 '-'),
 * 보류는 다른 진행 중 SR 과 같은 규칙을 따른다 — 보류 중에도 SLA 시계는 멈추지 않는다(결정 D10).
 *
 * 색: 지연·24시간 안·오늘·내일은 빨강(danger), D-2·D-3 은 주황(caution), 그 뒤는 색 없는 테두리(neutral)다.
 * 빨강은 거절·긴급·마감 임박에만 남긴다.
 */
export function getDueDateStatus(
  dueDate: string | Date | null | undefined,
  status?: string
): {
  label: string;
  variant: SRBadgeVariant;
  isOverdue: boolean;
  isUrgent: boolean;
} | null {
  if (status === 'COMPLETED' || status === 'CONFIRMED' || status === 'REJECTED') {
    return null;
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
    return {
      label: overdueLabelOf(dueDate) as string,
      variant: 'danger',
      isOverdue: true,
      isUrgent: false,
    };
  }

  // 24시간 안으로 들어오면 날짜가 아니라 **시각**을 보여 준다.
  // "오늘 마감"만으로는 아침 9시인지 밤 11시인지 알 수 없어 대응 우선순위를 정할 수 없다.
  if (remainingMs !== null && remainingMs < 24 * 60 * 60 * 1000) {
    return {
      label: `${formatAppZoneTime(dueDate as string | Date)} 마감`,
      variant: 'danger',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil === 0) {
    return {
      label: '오늘 마감',
      variant: 'danger',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil === 1) {
    return {
      label: '내일 마감',
      variant: 'danger',
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (daysUntil <= 3) {
    return {
      label: `D-${daysUntil}`,
      variant: 'caution',
      isOverdue: false,
      isUrgent: true,
    };
  }

  return {
    label: `D-${daysUntil}`,
    variant: 'neutral',
    isOverdue: false,
    isUrgent: false,
  };
}
