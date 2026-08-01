-- 중복 인덱스 3개 제거 (감사 4.2).
--
-- 셋 다 다른 인덱스가 이미 제공하는 것을 중복으로 유지하면서 쓰기 비용만 더하고 있었다.
--   users_email_idx        : email 은 @unique 이므로 users_email_key 가 같은 일을 한다
--   clients_code_idx       : code 는 @unique 이므로 clients_code_key 가 같은 일을 한다
--   notifications_recipient_idx : [recipient, created_at] 의 접두사라 단독 인덱스가 불필요
--
-- CONCURRENTLY 는 트랜잭션 안에서 실행할 수 없고 Prisma 마이그레이션은 트랜잭션으로
-- 감싸지므로 쓰지 않는다. DROP INDEX 는 짧은 ACCESS EXCLUSIVE 락만 잡고 즉시 끝난다.
DROP INDEX IF EXISTS "users_email_idx";
DROP INDEX IF EXISTS "clients_code_idx";
DROP INDEX IF EXISTS "notifications_recipient_idx";
