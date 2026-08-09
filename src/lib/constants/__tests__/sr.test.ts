import { describe, expect, it } from 'vitest';

import {
  priorityLabels,
  statusBadgeVariants,
  statusLabelOf,
  statusLabels,
} from '@/lib/constants/sr';

/**
 * SR 상태 라벨 정본의 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 * 이 맵은 오랫동안 `Record<string, string>` 이었다. 그래서 상태가 추가되거나 키를
 * 잘못 적어도 컴파일이 통과했고, 화면에는 `undefined` 가 렌더됐다. 아이러니하게도
 * 사본들(my-requests, e2e/21, SRActivities)은 전부 enum 으로 타입이 걸려 있었고
 * **정본만 무방비**였다.
 *
 * 이제 `Record<SRStatus, string>` 이라 키 누락은 컴파일이 잡는다. 여기서 잡는 것은
 * 타입이 못 잡는 두 가지다 — 값이 비어 있는 경우와, 배지 variant 맵이 라벨 맵과
 * 키 집합이 어긋나는 경우.
 */

/** prisma/schema.prisma 의 SRStatus. 값이 바뀌면 여기서 먼저 깨진다. */
const SR_STATUSES = [
  'REQUESTED',
  'INTAKE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CONFIRMED',
  'REJECTED',
] as const;

describe('SR 상태 라벨 정본', () => {
  it('7개 상태를 모두 덮는다', () => {
    expect(Object.keys(statusLabels).sort()).toEqual([...SR_STATUSES].sort());
  });

  it('빈 라벨이 없다', () => {
    for (const [status, label] of Object.entries(statusLabels)) {
      expect(label.trim(), `${status} 의 라벨이 비어 있습니다.`).not.toBe('');
    }
  });

  it('배지 variant 맵이 라벨 맵과 같은 키를 덮는다', () => {
    // 한쪽만 상태를 추가하면 배지 색이 undefined 가 되어 기본값으로 조용히 떨어진다.
    expect(Object.keys(statusBadgeVariants).sort()).toEqual(Object.keys(statusLabels).sort());
  });

  it('ON_HOLD 는 보류다', () => {
    // 2026-08-09 확정. 정본만 '대기' 이고 사본 3곳(my-requests, email.service,
    // UserReassignDialog)은 이미 '보류' 여서, 같은 상태가 화면에 따라 두 이름으로
    // 보였다 — 목록에서 '보류' 를 보고 상세로 들어가면 '대기' 가 떴다.
    expect(statusLabels.ON_HOLD).toBe('보류');
  });

  it('상태 라벨과 우선순위 라벨은 겹치지 않는다', () => {
    // 겹치면 같은 화면의 두 배지를 텍스트로 구분할 수 없어진다
    // (e2e/17 의 statusBadge 헬퍼가 이 성질에 기대고 있다).
    const overlap = Object.values(statusLabels).filter((label) =>
      Object.values(priorityLabels).includes(label)
    );
    expect(overlap, `상태 라벨이 우선순위 라벨과 겹칩니다: ${overlap.join(', ')}`).toEqual([]);
  });

  describe('statusLabelOf', () => {
    it('알려진 상태는 라벨로 옮긴다', () => {
      expect(statusLabelOf('ON_HOLD')).toBe('보류');
      expect(statusLabelOf('REQUESTED')).toBe('요청됨');
    });

    it('모르는 값은 원문을 돌려준다 — 화면이 비지 않게', () => {
      // 서버 응답은 직렬화를 거쳐 string 이므로 스키마가 앞서 나가면 여기로 온다.
      // undefined 를 렌더해 아무것도 안 뜨는 것보다 원문이 낫다.
      expect(statusLabelOf('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    });
  });
});
