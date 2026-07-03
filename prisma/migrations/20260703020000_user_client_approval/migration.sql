-- 사용자-고객사 소속에 승인 상태 도입 (셀프 회원가입 크로스테넌트 접근 차단)

-- CreateEnum
CREATE TYPE "UserClientStatus" AS ENUM ('PENDING', 'APPROVED');

-- AlterTable
ALTER TABLE "user_clients"
  ADD COLUMN "status" "UserClientStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approved_at" TIMESTAMPTZ;

-- Backfill: 기존 소속은 모두 승인된 것으로 간주하여 현재 사용자 잠금을 방지한다.
UPDATE "user_clients" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL;

-- CreateIndex
CREATE INDEX "user_clients_status_idx" ON "user_clients"("status");
