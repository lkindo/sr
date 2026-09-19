import { describe, expect, it } from 'vitest';

import { getEnumParams } from '../search-params';

/** SR 목록 필터 — 같은 키의 여러 값을 모두 읽고, 허용 목록에 없는 값은 버린다. */
describe('getEnumParams', () => {
  const STATUSES = ['REQUESTED', 'COMPLETED', 'CONFIRMED'] as const;

  it('여러 값을 모두 읽는다(대시보드 카드 링크 — 완료+확인완료)', () => {
    expect(getEnumParams(['COMPLETED', 'CONFIRMED'], STATUSES)).toEqual(['COMPLETED', 'CONFIRMED']);
  });

  it('값이 하나면 하나, 없으면 빈 목록이다', () => {
    expect(getEnumParams('REQUESTED', STATUSES)).toEqual(['REQUESTED']);
    expect(getEnumParams(undefined, STATUSES)).toEqual([]);
  });

  it("허용 목록에 없는 값('all', 오타, 주입 시도)은 버린다 — where 에 넣으면 Prisma 오류(500)였다", () => {
    expect(getEnumParams(['all', 'DONE', "COMPLETED' OR 1=1", 'CONFIRMED'], STATUSES)).toEqual([
      'CONFIRMED',
    ]);
  });
});
