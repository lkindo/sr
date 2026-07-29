-- Mattermost 연동 잔여물 제거 (schema.prisma 와의 드리프트 해소)
--
-- 배경: 마이그레이션을 적용한 DB 에는 `NotificationType.MATTERMOST` 와
-- `client_handlers.mattermost_id` 가 존재하지만 schema.prisma 에는 없다.
-- CI 가 마이그레이션을 검증하지 않아 그동안 드러나지 않았고,
-- `prisma migrate diff --exit-code` 드리프트 체크를 CI 에 추가하면서 처음 잡혔다.
--
-- 이 기능은 구현된 적이 없다. src/ 전역에 Mattermost 참조가 없고
-- (docs/SR_Management_System_PRD.md 에 계획으로만 기술), 적용 전 확인 결과
-- 운영/스테이징 양쪽 모두 client_handlers 0행, mattermost_id 값 0건,
-- type = 'MATTERMOST' 알림 0건이었다. 따라서 데이터 유실 없이 제거한다.

-- AlterEnum
-- PostgreSQL 은 enum 값을 직접 제거할 수 없어 타입을 재생성한다.
-- 만약 MATTERMOST 를 쓰는 행이 남아 있으면 아래 USING 캐스트가
-- "invalid input value for enum" 으로 실패한다 — 조용히 데이터를 잃지 않도록 의도된 안전장치다.
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('EMAIL', 'IN_APP', 'PUSH');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "client_handlers" DROP COLUMN "mattermost_id";
