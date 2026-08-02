import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APP_TIME_ZONE,
  appZoneDateStamp,
  diffCalendarDaysInAppZone,
  formatAppZoneDate,
  formatAppZoneShortDate,
  formatISODateInAppZone,
  getAppZoneDateParts,
} from '../timezone';

/**
 * 감사 3.25 회귀 테스트.
 *
 * 핵심 시나리오: 2026-07-30 08:00 KST = 2026-07-29 23:00 **UTC**.
 * 로컬 타임존 접근자를 쓰면 UTC 컨테이너는 '07-29', KST 브라우저는 '07-30' 을 만든다.
 * 이 모듈은 어느 쪽에서 실행되든 항상 KST 달력일을 돌려줘야 한다.
 */

// 2026-07-30 08:00 KST
const MORNING_KST = new Date('2026-07-29T23:00:00.000Z');
// 2026-07-30 08:59 KST — UTC 로는 아직 전날
const JUST_BEFORE_UTC_ROLLOVER = new Date('2026-07-29T23:59:59.000Z');
// 2026-07-30 09:00 KST — UTC 날짜가 막 넘어간 순간
const AT_UTC_ROLLOVER = new Date('2026-07-30T00:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('formatISODateInAppZone', () => {
  it('UTC 로는 전날인 KST 오전 시각을 KST 달력일로 돌려준다', () => {
    expect(MORNING_KST.toISOString().slice(0, 10)).toBe('2026-07-29'); // 결함의 근원
    expect(formatISODateInAppZone(MORNING_KST)).toBe('2026-07-30');
  });

  it('UTC 자정 직전/직후가 같은 KST 달력일에 머문다', () => {
    expect(formatISODateInAppZone(JUST_BEFORE_UTC_ROLLOVER)).toBe('2026-07-30');
    expect(formatISODateInAppZone(AT_UTC_ROLLOVER)).toBe('2026-07-30');
  });

  it('KST 자정 경계에서 날짜가 넘어간다', () => {
    // 2026-07-30 23:59:59 KST
    expect(formatISODateInAppZone(new Date('2026-07-30T14:59:59.000Z'))).toBe('2026-07-30');
    // 2026-07-31 00:00:00 KST
    expect(formatISODateInAppZone(new Date('2026-07-30T15:00:00.000Z'))).toBe('2026-07-31');
  });

  it('문자열과 타임스탬프 입력도 받는다', () => {
    expect(formatISODateInAppZone('2026-07-29T23:00:00.000Z')).toBe('2026-07-30');
    expect(formatISODateInAppZone(MORNING_KST.getTime())).toBe('2026-07-30');
  });
});

describe('getAppZoneDateParts', () => {
  it('KST 기준 연/월/일을 숫자로 분해한다', () => {
    expect(getAppZoneDateParts(MORNING_KST)).toEqual({ year: 2026, month: 7, day: 30 });
  });
});

describe('formatAppZoneDate / formatAppZoneShortDate', () => {
  it('KST 달력일을 고정폭으로 포맷한다', () => {
    expect(formatAppZoneDate(MORNING_KST)).toBe('2026. 07. 30.');
  });

  it('짧은 표기는 두 자리 연도와 패딩 없는 월/일을 쓴다', () => {
    expect(formatAppZoneShortDate(MORNING_KST)).toBe('26. 7. 30.');
  });

  it('SSR(UTC 가정)과 하이드레이션(KST 가정)이 같은 문자열을 만든다', () => {
    // 같은 순간을 두 번 포맷하면 실행 환경과 무관하게 결과가 같아야 한다.
    const first = formatAppZoneDate(MORNING_KST);
    const second = formatAppZoneDate(new Date(MORNING_KST.getTime()));
    expect(first).toBe(second);
    expect(first).toBe('2026. 07. 30.');
  });
});

describe('appZoneDateStamp', () => {
  it('SR 번호용 YYYYMMDD 를 KST 기준으로 만든다', () => {
    expect(appZoneDateStamp(MORNING_KST)).toBe('20260730');
  });

  it('KST 오전 9시 이전에도 당일 번호를 쓴다 (UTC 기준이면 전날이 된다)', () => {
    // 이 시각의 toISOString() 기반 채번은 '20260729' 를 만들었다.
    expect(appZoneDateStamp(JUST_BEFORE_UTC_ROLLOVER)).toBe('20260730');
  });
});

describe('diffCalendarDaysInAppZone', () => {
  it('같은 KST 달력일이면 0', () => {
    expect(diffCalendarDaysInAppZone(AT_UTC_ROLLOVER, MORNING_KST)).toBe(0);
  });

  it('KST 기준 다음 날이면 1', () => {
    expect(diffCalendarDaysInAppZone('2026-07-30T15:00:00.000Z', MORNING_KST)).toBe(1);
  });

  it('지난 날짜는 음수', () => {
    expect(diffCalendarDaysInAppZone('2026-07-28T23:00:00.000Z', MORNING_KST)).toBe(-1);
  });

  it('시각이 아니라 달력일 차이를 센다 (23:59 → 00:01 은 1일)', () => {
    const lateKst = new Date('2026-07-30T14:59:00.000Z'); // 30일 23:59 KST
    const earlyKst = new Date('2026-07-30T15:01:00.000Z'); // 31일 00:01 KST
    expect(diffCalendarDaysInAppZone(earlyKst, lateKst)).toBe(1);
  });

  it('30일 차이도 정확히 센다 (DST 없는 KST 에서 오차 누적 없음)', () => {
    expect(diffCalendarDaysInAppZone('2026-08-29T00:00:00.000Z', '2026-07-30T00:00:00.000Z')).toBe(
      30
    );
  });

  it('두 번째 인자를 생략하면 현재 시각 기준', () => {
    vi.useFakeTimers();
    vi.setSystemTime(MORNING_KST);
    expect(diffCalendarDaysInAppZone('2026-07-31T05:00:00.000Z')).toBe(1);
  });
});

describe('APP_TIME_ZONE', () => {
  it('Asia/Seoul 로 고정되어 있다', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Seoul');
  });
});
