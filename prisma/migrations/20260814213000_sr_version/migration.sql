-- Detect concurrent writes even when an SR remains in the same status.
ALTER TABLE "srs"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
