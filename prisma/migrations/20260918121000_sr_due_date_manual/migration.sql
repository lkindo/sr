-- 마감일 수동 지정 표식 (헌법 §3, 소유자 결정 2026-09-18 D8).
--
-- 수동으로 지정한 마감일은 이후 우선순위·카테고리 변경의 자동 재산출이 덮어쓰지 않아야 한다.
-- 예전에는 "이번 요청에 dueDate 가 실려 왔는가" 로만 판정해 다음 변경 때 덮어써졌다 — 상태로 남겨야
-- 판정할 수 있다.
ALTER TABLE "srs" ADD COLUMN "due_date_manual" BOOLEAN NOT NULL DEFAULT false;

-- 기존 수동 조정의 백필. 수동 조정은 2026-08-15 부터 SR_DUE_DATE 감사 로그를 남겼다.
-- SR 마다 **가장 최근** 조정 기록을 보고, 그 값이 지금 마감일과 같을 때만 표식을 세운다.
-- 그 뒤 자동 재산출이 이미 덮어썼다면(이 마이그레이션이 고치는 결함) 지금 값은 자동 산출값이므로
-- 표식을 세우지 않는다. 마감일을 비운 기록(after = null)도 세우지 않는다.
UPDATE "srs" s
SET "due_date_manual" = true
FROM (
  SELECT DISTINCT ON ("target_id") "target_id", "changes"
  FROM "audit_logs"
  WHERE "target_entity" = 'SR_DUE_DATE'
    AND "target_id" IS NOT NULL
  ORDER BY "target_id", "created_at" DESC
) latest
WHERE s."id" = latest."target_id"
  AND latest."changes" ->> 'after' IS NOT NULL
  AND s."due_date" = (latest."changes" ->> 'after')::timestamptz;
