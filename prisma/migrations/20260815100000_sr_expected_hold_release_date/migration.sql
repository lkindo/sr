-- 헌법 §2 는 보류(ON_HOLD) 전이에 "보류 사유와 예상 해제일" 두 가지를 요구하지만
-- 사유만 강제되고 예상 해제일은 저장할 곳조차 없었다. 절반만 지켜지던 조문을 닫는다.
--
-- 기존 보류 SR 은 값이 없으므로 NULL 로 남는다(백필하지 않는다) — 임의의 날짜를 지어내면
-- 지키지 못할 약속이 이력에 남는다. 다음 보류 전이부터 필수가 된다.
ALTER TABLE "srs"
ADD COLUMN "expected_hold_release_date" TIMESTAMPTZ;
