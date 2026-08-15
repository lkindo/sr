/**
 * 애플리케이션 표준 타임존.
 *
 * 컨테이너는 UTC 로 뜨고 사용자는 KST(UTC+9) 브라우저를 쓴다. 날짜를 앰비언트 로컬
 * 타임존(`getFullYear()` / `setHours(0,0,0,0)` / `toISOString()`)으로 계산하면
 * 서버 렌더와 클라이언트 하이드레이션이 **매일 9시간 창 동안 서로 다른 날짜**를 만든다.
 * (예: 2026-07-30 08:00 KST = 2026-07-29 23:00 UTC → SSR '07. 29.', 하이드레이션 '07. 30.')
 *
 * 그래서 날짜 경계가 의미를 갖는 계산은 전부 이 모듈을 거친다.
 * `TZ=Asia/Seoul` 환경변수도 함께 설정하지만, 그것만으로는 다른 타임존 브라우저에서
 * 여전히 어긋나므로 포맷·경계 계산 자체를 타임존 명시적으로 만든다.
 */
export const APP_TIME_ZONE = 'Asia/Seoul';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 모듈 스코프에 한 번만 만든다.
 *
 * `toLocaleDateString()` 은 호출마다 Intl.DateTimeFormat 을 새로 초기화해서 느리다
 * (SR 목록처럼 행마다 렌더되는 곳에서 체감된다). 포맷터를 재사용하면 그 비용이 사라진다.
 */
const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDate(value: string | Date | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * KST 기준 달력 날짜를 `YYYY-MM-DD` 로 반환한다.
 *
 * `toISOString().slice(0, 10)` 과 달리 UTC 가 아니라 KST 달력 날짜다.
 */
export function formatISODateInAppZone(value: string | Date | number = new Date()): string {
  // 'en-CA' 로케일의 short date 가 곧 YYYY-MM-DD 다.
  return isoDateFormatter.format(toDate(value));
}

/**
 * KST 기준 달력 날짜 부품.
 */
export function getAppZoneDateParts(value: string | Date | number = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = formatISODateInAppZone(value).split('-').map(Number);
  return { year: year as number, month: month as number, day: day as number };
}

/**
 * KST 달력 날짜를 "순수 달력일"의 UTC 자정 타임스탬프로 환산한다.
 *
 * 두 시각의 **일수 차이**를 구할 때 쓴다. 양쪽 모두 정확한 UTC 자정이므로
 * 차이가 항상 86400000 의 배수가 되어 DST·오프셋 오차가 끼어들 여지가 없다.
 */
function appZoneCalendarDayUTC(value: string | Date | number = new Date()): number {
  return Date.parse(`${formatISODateInAppZone(value)}T00:00:00Z`);
}

/**
 * KST 달력 기준으로 `to` 가 `from` 보다 며칠 뒤인지 반환한다(같은 날이면 0).
 */
export function diffCalendarDaysInAppZone(
  to: string | Date | number,
  from: string | Date | number = new Date()
): number {
  return Math.round((appZoneCalendarDayUTC(to) - appZoneCalendarDayUTC(from)) / MS_PER_DAY);
}

/**
 * KST 기준 `YYYY. MM. DD.` (SR 목록 등 고정폭 표기용).
 */
export function formatAppZoneDate(value: string | Date | number): string {
  const { year, month, day } = getAppZoneDateParts(value);
  return `${year}. ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}.`;
}

/**
 * KST 기준 `YY. M. D.` (짧은 표기용).
 */
export function formatAppZoneShortDate(value: string | Date | number): string {
  const { year, month, day } = getAppZoneDateParts(value);
  return `${String(year).slice(2)}. ${month}. ${day}.`;
}

/**
 * KST 기준 그 날의 자정(00:00 KST)을 가리키는 순간을 돌려준다.
 *
 * `d.setHours(0,0,0,0)` 은 **앰비언트 로컬 타임존**의 자정이다. UTC 로 뜨는 컨테이너에서는
 * UTC 자정(=09:00 KST)이 되어, "오늘 마감" 범위 질의가 매일 9시간씩 어긋났다.
 */
export function startOfAppZoneDay(value: string | Date | number = new Date()): Date {
  // KST 달력 날짜를 뽑아 그 날 00:00 KST 를 UTC 순간으로 되돌린다(+09:00 오프셋 명시).
  return new Date(`${formatISODateInAppZone(value)}T00:00:00+09:00`);
}

/**
 * KST 기준 `HH:mm`.
 *
 * 마감이 24시간 안으로 들어온 SR 에 "오늘/내일 마감" 대신 정확한 시각을 붙이기 위한 것이다.
 * 12시간짜리 SLA 에서는 "오늘 마감" 이 아침 9시인지 밤 11시인지가 전부 다른 이야기다.
 */
export function formatAppZoneTime(value: string | Date | number): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * SR 번호 채번용 `YYYYMMDD` (KST 달력 기준).
 *
 * `toISOString()` 기반이면 09:00 KST 에 날짜가 롤오버해서, 하루의 앞 9시간에 만든 SR 이
 * 전날 번호를 받는다.
 */
export function appZoneDateStamp(value: string | Date | number = new Date()): string {
  return formatISODateInAppZone(value).replace(/-/g, '');
}
