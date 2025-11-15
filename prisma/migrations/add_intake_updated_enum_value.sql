-- SRActivityType enum에 INTAKE_UPDATED 값 추가
-- 작성일: 2025-01-13
-- 목적: 접수 정보 수정 이력을 추적하기 위한 Activity 타입 추가

-- PostgreSQL에서 enum에 값을 추가하는 것은 트랜잭션 내에서 실행할 수 없습니다.
-- 이미 해당 enum 타입을 사용하는 테이블이 있어도 안전하게 추가할 수 있습니다.

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'INTAKE_UPDATED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SRActivityType')
    ) THEN
        ALTER TYPE "SRActivityType" ADD VALUE 'INTAKE_UPDATED';
    END IF;
END $$;
