-- 서비스 카테고리 이름 중복을 DB 수준에서 막는다 (감사 4.2)
--
-- 기존에는 `findFirst` 로 확인한 뒤 `create` 하는 TOCTOU 였다. 더블 클릭이나 재시도로
-- 두 요청이 확인 단계를 동시에 통과하면 같은 이름 카테고리가 둘 생긴다.
-- 그러면 SLA 시간이 다른 항목 두 개가 드롭다운에 나타나고, SR 이 갈라져
-- 카테고리별 리포팅이 오염된다.
--
-- **부분 인덱스 두 개인 이유:** client_id 가 nullable 이라 단순 복합 UNIQUE 로는
-- 전역 카테고리(client_id IS NULL)를 제약하지 못한다. Postgres 에서 NULL 은 서로
-- 같지 않다고 보므로 (NULL, '일반 요청') 행이 몇 개든 전부 허용된다.
--
-- 인덱스 생성 전에 기존 중복을 정리한다. 남아 있으면 인덱스 생성 자체가 실패해
-- 마이그레이션이 부팅을 막는다. 가장 오래된 행을 남기고 나머지를 병합한다 —
-- SR 이 붙어 있을 수 있으므로 삭제가 아니라 참조를 옮긴 뒤 삭제한다.

-- 1) 중복 그룹에서 유지할 대표 행(가장 먼저 만들어진 것)을 고르고,
--    나머지에 붙은 SR 을 대표 행으로 옮긴다.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY client_id, category_name ORDER BY created_at, id
         ) AS keep_id
  FROM service_categories
)
UPDATE srs
SET service_category_id = ranked.keep_id
FROM ranked
WHERE srs.service_category_id = ranked.id
  AND ranked.id <> ranked.keep_id;

-- 2) 참조가 사라진 중복 행 제거
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY client_id, category_name ORDER BY created_at, id
         ) AS keep_id
  FROM service_categories
)
DELETE FROM service_categories
WHERE id IN (SELECT id FROM ranked WHERE id <> keep_id);

-- CreateIndex: 고객사 전용 카테고리
CREATE UNIQUE INDEX "service_categories_client_id_category_name_key"
  ON "service_categories" ("client_id", "category_name")
  WHERE "client_id" IS NOT NULL;

-- CreateIndex: 전역 카테고리 (client_id IS NULL)
CREATE UNIQUE INDEX "service_categories_global_category_name_key"
  ON "service_categories" ("category_name")
  WHERE "client_id" IS NULL;
