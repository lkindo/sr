-- DropIndex
DROP INDEX IF EXISTS "sr_activities_sr_id_created_at_idx";
DROP INDEX IF EXISTS "sr_comments_sr_id_created_at_idx";
DROP INDEX IF EXISTS "sr_comments_sr_id_is_internal_created_at_idx";

-- CreateIndex
CREATE INDEX "sr_activities_sr_id_created_at_idx" ON "sr_activities"("sr_id", "created_at" DESC);
CREATE INDEX "sr_comments_sr_id_created_at_idx" ON "sr_comments"("sr_id", "created_at" DESC);
CREATE INDEX "sr_comments_sr_id_is_internal_created_at_idx" ON "sr_comments"("sr_id", "is_internal", "created_at" DESC);
