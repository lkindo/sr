-- SR 목록의 기본 정렬(created_at DESC)을 지원하는 인덱스 (감사 4.2)
--
-- 기존 8개 인덱스는 필터는 공급해도 **정렬은 공급하지 못했다.**
-- 고객사 사용자의 where 는 `client_id IN (...)` 인데 srs_client_id_status_idx 로는
-- created_at 정렬이 안 되어, Postgres 가 매칭 행 전체를 물질화해 정렬한 뒤에야
-- OFFSET/LIMIT 을 적용했다. 목록 첫 페이지를 여는 것만으로 그 고객사의 전체 SR 을 훑는다.
--
-- CONCURRENTLY 를 쓰지 않은 이유:
--   Prisma Migrate 는 각 마이그레이션을 트랜잭션으로 감싸는데,
--   CREATE INDEX CONCURRENTLY 는 트랜잭션 안에서 실행할 수 없다.
--   또한 이 마이그레이션은 컨테이너 부팅 시(docker-entrypoint.sh) 실행되고,
--   그 시점에는 새 앱이 아직 요청을 받지 않으므로 ACCESS EXCLUSIVE 락이
--   서비스 트래픽을 막지 않는다. 테이블이 커져 부팅 지연이 문제가 되면
--   그때 수동 CONCURRENTLY 로 전환한다.

-- CreateIndex
CREATE INDEX "srs_created_at_idx" ON "srs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "srs_client_id_created_at_idx" ON "srs"("client_id", "created_at" DESC);

-- CreateIndex
-- 담당자별 목록/큐 화면도 같은 정렬을 쓴다.
CREATE INDEX "srs_assignee_id_created_at_idx" ON "srs"("assignee_id", "created_at" DESC);
