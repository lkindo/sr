import { describe, expect, it } from 'vitest';

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

    it('should return urgent status for D-Day', () => {
      const today = new Date();
      const status = getDueDateStatus(today.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: '오늘 마감',
        variant: 'destructive',
        isOverdue: false,
        isUrgent: true,
      });
    });

    it('should return urgent status for D-1', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const status = getDueDateStatus(tomorrow.toISOString(), 'IN_PROGRESS');
      expect(status).toEqual({
        label: '내일 마감',
        variant: 'destructive',
        isOverdue: false,
        isUrgent: true,
      });
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
