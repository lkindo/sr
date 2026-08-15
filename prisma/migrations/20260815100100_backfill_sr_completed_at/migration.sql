-- 재오픈 7일 창을 fail-closed 로 바꾸면서 생기는 부작용을 먼저 막는다.
--
-- 상태 머신은 이제 기산점(completed_at / confirmed_at)이 없으면 재오픈을 **거부**한다.
-- 예전에는 이 검사를 통째로 건너뛰어(fail-open) 몇 년 지난 SR 도 재오픈됐다.
-- 그런데 completed_at 기록이 도입되기 전에 완료된 SR 은 이 값이 NULL 이라, 백필하지 않으면
-- 정상적으로 최근 완료된 건까지 "종결 시각을 확인할 수 없다" 로 막혀 버린다.
--
-- 대체값 우선순위: actual_completion_date(실제 완료일로 입력된 값) → updated_at(최후 수단).
-- 둘 다 없을 수는 없다(updated_at 은 NOT NULL). 정확한 복원이 아니라 **보수적 근사**이며,
-- 근사값이 과거일수록 창이 닫히는 쪽으로 작동하므로 fail-closed 원칙과 방향이 같다.
UPDATE "srs"
SET "completed_at" = COALESCE("actual_completion_date", "updated_at")
WHERE "status" IN ('COMPLETED', 'CONFIRMED')
  AND "completed_at" IS NULL;

-- 확인완료 건의 기산점도 채운다. CONFIRMED 는 confirmed_at 을 먼저 보므로 이 값이 없으면
-- completed_at 으로 폴백하는데, 폴백에 의존하기보다 실제 값을 채워 두는 편이 명확하다.
UPDATE "srs"
SET "confirmed_at" = COALESCE("actual_completion_date", "updated_at")
WHERE "status" = 'CONFIRMED'
  AND "confirmed_at" IS NULL;
