-- DropIndex
DROP INDEX "users_email_idx";

-- DropIndex
DROP INDEX "srs_sr_number_idx";

-- CreateIndex
CREATE INDEX "srs_created_at_idx" ON "srs"("created_at");

-- DropIndex
DROP INDEX "sr_attachments_sr_id_idx";

-- CreateIndex
CREATE INDEX "sr_attachments_sr_id_created_at_idx" ON "sr_attachments"("sr_id", "created_at");
