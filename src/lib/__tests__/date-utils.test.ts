import { describe, expect, it, vi } from 'vitest';

import { getDaysUntilDue, getDueDateStatus } from '@/lib/date-utils';
import { formatISODateInAppZone } from '@/lib/timezone';

describe('date-utils', () => {
  describe('getDaysUntilDue', () => {
    it('should return null if no due date is provided', () => {
      expect(getDaysUntilDue(null)).toBeNull();
      expect(getDaysUntilDue(undefined)).toBeNull();
    });

    it('should calculate accurate days remaining', () => {
      /**
       * 픽스처를 앱 타임존(KST) 달력으로 만든다.
       *
       * 예전에는 `new Date()` + `setHours(0,0,0,0)` 로 만들었는데, 그건 **러너의 로컬
       * 타임존** 자정이다. `getDaysUntilDue` 는 의도적으로 KST 달력으로 일 경계를 잡으므로
       * (감사 3.25), 로컬이 KST 가 아닌 환경에서는 두 기준이 어긋나 실패한다.
       * 실제로 UTC 러너의 16:09(=KST 익일 01:09)에서 "내일"이 KST 로는 오늘이 되어 깨졌다.
       * 개발자 노트북이 KST 라 로컬에서는 항상 통과하던, 환경에 숨어 있던 결함이다.
       *
       * 정오를 쓰는 이유: KST 달력일 안에서 UTC 로 환산해도 날짜가 넘어가지 않는 시각이라
       * 경계에 걸리지 않는다.
       */
      const appZoneNoonUTC = (dayOffset: number) => {
        const [year, month, day] = formatISODateInAppZone().split('-').map(Number);
        const utc = new Date(Date.UTC(year!, month! - 1, day! + dayOffset, 12, 0, 0));
        return utc.toISOString();
      };

      expect(getDaysUntilDue(appZoneNoonUTC(1))).toBe(1);
      expect(getDaysUntilDue(appZoneNoonUTC(-1))).toBe(-1);
      expect(getDaysUntilDue(appZoneNoonUTC(0))).toBe(0);
    });
  });

  describe('getDueDateStatus', () => {
    it('should return completed status for COMPLETED', () => {
      const status = getDueDateStatus('2023-01-01', 'COMPLETED');
      expect(status).toEqual({
        label: '완료됨',
        variant: 'default',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return completed status for CONFIRMED', () => {
      const status = getDueDateStatus('2023-01-01', 'CONFIRMED');
      expect(status).toEqual({
        label: '완료됨',
        variant: 'default',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return on hold status for ON_HOLD', () => {
      // 마감일 배지는 상태 배지와 같은 행에 나란히 뜨므로 문구를 맞춘다
      // (statusLabels.ON_HOLD = '보류'). 예전에는 '보류중' 이라 한 행에 두 이름이었다.
      const status = getDueDateStatus('2023-01-01', 'ON_HOLD');
      expect(status).toEqual({
        label: '보류',
        variant: 'secondary',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return rejected status for REJECTED', () => {
      const status = getDueDateStatus('2023-01-01', 'REJECTED');
      expect(status).toEqual({
        label: '거절',
        variant: 'destructive',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return null if no due date', () => {
      const status = getDueDateStatus(null, 'IN_PROGRESS');
      expect(status).toBeNull();
    });

    it('should return overdue status', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const status = getDueDateStatus(pastDate.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: '5일 지연',
        variant: 'destructive',
        isOverdue: true,
        isUrgent: false,
      });
    });

    /**
     * 헌법 §3: **초과 판정은 달력일이 아니라 시각으로 한다.**
     *
     * 예전에는 달력일 차이(`daysUntil < 0`)로만 판정해서, 오늘 09:00 이 마감인 SR 이
     * 18:00 에도 "오늘 마감 / isOverdue:false" 였다. 12시간짜리 SLA 에서는 위반 상태가
     * 하루 종일 정상으로 보인다는 뜻이다.
     */
    it('마감 시각을 넘겼으면 같은 날이어도 초과로 판정한다', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const status = getDueDateStatus(twoHoursAgo.toISOString(), 'IN_PROGRESS');

      expect(status?.isOverdue).toBe(true);
      expect(status?.label).toBe('2시간 지연');
    });

    it('24시간 미만 지연은 일이 아니라 시간으로 표기한다', () => {
      const almostADayAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const status = getDueDateStatus(almostADayAgo.toISOString(), 'IN_PROGRESS');

      expect(status?.label).toBe('23시간 지연');
      expect(status?.isOverdue).toBe(true);
    });

    it('마감이 24시간 안으로 들어오면 날짜가 아니라 시각을 보여 준다', () => {
      // "오늘 마감"만으로는 아침 9시인지 밤 11시인지 알 수 없어 대응 순서를 정할 수 없다.
      const inSixHours = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const status = getDueDateStatus(inSixHours.toISOString(), 'IN_PROGRESS');

      expect(status?.label).toMatch(/^\d{2}:\d{2} 마감$/);
      expect(status?.isOverdue).toBe(false);
      expect(status?.isUrgent).toBe(true);
    });

    it('should return urgent status for D-1', () => {
      // "내일 마감"은 **달력상 내일이면서 24시간보다 먼** 좁은 창이다.
      // (24시간 안쪽은 시각 표기로 떨어진다.) 지금 시각에 따라 그 창이 존재하기도
      // 하고 아니기도 하므로 시스템 시각을 고정해 결정적으로 만든다.
      vi.useFakeTimers();
      try {
        // 2026-03-10 01:00 KST 로 고정 → 내일 23:00 KST 는 46시간 뒤, 달력상 D-1.
        vi.setSystemTime(new Date('2026-03-09T16:00:00Z'));
        const tomorrowLate = new Date('2026-03-11T14:00:00Z'); // 2026-03-11 23:00 KST (달력상 내일)

        const status = getDueDateStatus(tomorrowLate.toISOString(), 'IN_PROGRESS');

        expect(status).toEqual({
          label: '내일 마감',
          variant: 'destructive',
          isOverdue: false,
          isUrgent: true,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should return D-2 as urgent', () => {
      const d2 = new Date();
      d2.setDate(d2.getDate() + 2);
      const status = getDueDateStatus(d2.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: 'D-2',
        variant: 'destructive',
        isOverdue: false,
        isUrgent: true,
      });
    });

    it('should return D-3 as urgent', () => {
      const d3 = new Date();
      d3.setDate(d3.getDate() + 3);
      const status = getDueDateStatus(d3.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: 'D-3',
        variant: 'destructive',
        isOverdue: false,
        isUrgent: true,
      });
    });

    it('should return D-5 as secondary (not urgent)', () => {
      const d5 = new Date();
      d5.setDate(d5.getDate() + 5);
      const status = getDueDateStatus(d5.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: 'D-5',
        variant: 'secondary',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return D-7 as secondary', () => {
      const d7 = new Date();
      d7.setDate(d7.getDate() + 7);
      const status = getDueDateStatus(d7.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: 'D-7',
        variant: 'secondary',
        isOverdue: false,
        isUrgent: false,
      });
    });

    it('should return D-N status for far future', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const status = getDueDateStatus(futureDate.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: 'D-10',
        variant: 'default',
        isOverdue: false,
        isUrgent: false,
      });
    });
  });
});
