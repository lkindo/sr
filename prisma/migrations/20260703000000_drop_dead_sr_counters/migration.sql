-- 사용되지 않는 카운터 컬럼 제거.
-- attachment_count / comment_count 스칼라는 어디서도 읽히지 않으며(조회는 항상 _count 로 계산),
-- 비트랜잭션 갱신으로 드리프트만 유발하던 죽은 컬럼이라 삭제한다.
ALTER TABLE "srs" DROP COLUMN IF EXISTS "attachment_count";
ALTER TABLE "srs" DROP COLUMN IF EXISTS "comment_count";
