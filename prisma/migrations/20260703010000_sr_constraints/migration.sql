-- srNumber: 무제한 TEXT → VARCHAR(30). 다른 문자열 컬럼과 일관되며,
-- unique btree 인덱스의 행 크기 한계 위험을 없앤다(생성 값은 ~16자).
ALTER TABLE "srs" ALTER COLUMN "sr_number" TYPE VARCHAR(30);

-- satisfaction_rating: 1..5 범위를 DB CHECK 로도 강제(그동안 Zod 에만 존재).
-- Zod 를 우회하는 경로로 들어온 값이 대시보드 지표를 왜곡하는 것을 방지.
ALTER TABLE "srs"
  ADD CONSTRAINT "srs_satisfaction_rating_range"
  CHECK ("satisfaction_rating" IS NULL OR ("satisfaction_rating" BETWEEN 1 AND 5));
