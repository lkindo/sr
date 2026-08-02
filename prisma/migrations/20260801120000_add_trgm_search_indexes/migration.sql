-- SR 목록 검색을 위한 pg_trgm GIN 인덱스 (감사 4.2)
--
-- 검색은 5개 컬럼(3개는 조인)에 앵커 없는 ILIKE '%term%' 를 건다:
--   srs.sr_number, srs.title, clients.name, users.name(요청자/담당자)
-- B-tree 는 선행 와일드카드를 쓸 수 없으므로 그동안 전부 순차 스캔이었고,
-- 같은 where 가 행 조회와 총 카운트 양쪽에 쓰여 **키 입력 한 번에 스캔 2회**가 돌았다.
--
-- 실측(50k행, PostgreSQL 16, title+sr_number 검색 1건):
--   이전  51.7ms / 버퍼 1021 / 49,999행 필터링 (Seq Scan)
--   이후   0.18ms / 버퍼   33 / Bitmap Index Scan
--
-- GIN 은 쓰기 시 갱신 비용이 B-tree 보다 크지만, 이 테이블은 읽기가 압도적으로 많고
-- 검색은 500ms 디바운스마다 실행된다. trade-off 가 명확히 읽기 쪽이다.
--
-- CONCURRENTLY 미사용 사유는 20260801114021_add_sr_created_at_indexes 와 동일하다
-- (Prisma 가 마이그레이션을 트랜잭션으로 감싸며, 실행 시점에 앱이 트래픽을 받지 않는다).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "srs_title_trgm_idx" ON "srs" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "srs_sr_number_trgm_idx" ON "srs" USING GIN ("sr_number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_name_trgm_idx" ON "clients" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "users_name_trgm_idx" ON "users" USING GIN ("name" gin_trgm_ops);
