-- SR 요청/접수 프로세스 분리를 위한 필드 추가
-- 작성일: 2025-01-12
-- 목적: 요청자와 접수자 역할 분리

-- 1. 요청자 입력 필드 추가
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "requested_priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "requested_completion_date" TIMESTAMP(3);

-- 2. 접수자 분석 필드 추가
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "intake_by_id" TEXT;
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "actual_priority" TEXT;
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "intake_notes" TEXT;
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "estimated_hours" DOUBLE PRECISION;
ALTER TABLE "srs" ADD COLUMN IF NOT EXISTS "estimated_completion_date" TIMESTAMP(3);

-- 3. 외래 키 제약 조건 추가
ALTER TABLE "srs" ADD CONSTRAINT "srs_intake_by_id_fkey"
  FOREIGN KEY ("intake_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS "srs_intake_by_id_idx" ON "srs"("intake_by_id");

-- 5. 기존 데이터 마이그레이션 (priority를 requested_priority로 복사)
UPDATE "srs" SET "requested_priority" = "priority" WHERE "requested_priority" = 'MEDIUM';

-- 완료
COMMENT ON COLUMN "srs"."requested_priority" IS '요청자가 희망하는 우선순위';
COMMENT ON COLUMN "srs"."requested_completion_date" IS '요청자가 희망하는 완료일';
COMMENT ON COLUMN "srs"."intake_by_id" IS '접수 처리자 ID';
COMMENT ON COLUMN "srs"."actual_priority" IS '접수자가 결정한 실제 우선순위';
COMMENT ON COLUMN "srs"."intake_notes" IS '접수 시 메모/분석 내용';
COMMENT ON COLUMN "srs"."estimated_hours" IS '예상 작업 시간';
COMMENT ON COLUMN "srs"."estimated_completion_date" IS '접수자가 설정한 예상 완료일';
