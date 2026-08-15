-- SR 을 물리 삭제에서 soft delete 로 전환한다(db-rules §2).
--
-- 물리 삭제는 sr_activities / sr_comments / sr_attachments / sr_status_history 를
-- onDelete: Cascade 로 함께 지운다. 즉 "감사 및 이력 보존" 원칙이 삭제 한 번으로 무력화된다.
-- 2026-08-09 부터 CLIENT_ADMIN 도 이 경로에 도달할 수 있게 되어 우선순위가 올라갔다.
ALTER TABLE "srs"
ADD COLUMN "deleted_at" TIMESTAMPTZ;

-- 모든 조회가 `deleted_at IS NULL` 로 나가므로 살아 있는 행만 담는 부분 인덱스를 둔다.
-- 전체 인덱스보다 작고, 삭제된 행이 늘어나도 크기가 커지지 않는다.
CREATE INDEX "srs_deleted_at_idx" ON "srs" ("deleted_at") WHERE "deleted_at" IS NULL;
