-- 알림 아웃박스에 재시도 상태를 추가한다(감사 4.2).
--
-- `notifications` 테이블은 status/sentAt/failReason 으로 이미 아웃박스 형태였지만
-- 저장소 어디에서도 쓰이지 않았고, 재시도를 표현할 수단도 없었다.
--   attempts        : 시도 횟수. 상한을 넘으면 dead-letter 로 남긴다.
--   next_attempt_at : 지수 백오프. PENDING 이어도 이 시각 전에는 집지 않는다.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ;

-- 디스패처의 claim 쿼리를 위한 인덱스.
CREATE INDEX IF NOT EXISTS "notifications_status_next_attempt_at_idx"
  ON "notifications" ("status", "next_attempt_at");
