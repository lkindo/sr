/**
 * 여러 번 올 수 있는 쿼리 필터(`?status=COMPLETED&status=CONFIRMED`)의 값을 모두 읽고, 허용 목록(enum)에
 * 없는 값은 버린다.
 *
 * SR 목록(/srs)은 예전에 첫 값만 읽어서 대시보드 카드("완료" = 완료+확인완료, "긴급" = 긴급+높음)의
 * 숫자와 눌러서 간 목록이 맞지 않았다. 또 enum 에 없는 값을 그대로 where 에 넣어 Prisma 오류(500)가 났다.
 */
export function getEnumParams<T extends string>(
  param: string | string[] | undefined,
  allowed: readonly T[]
): T[] {
  const values = Array.isArray(param) ? param : param ? [param] : [];
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}
