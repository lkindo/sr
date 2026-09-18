-- SR 이력(활동·상태 이력)이 SR 물리 삭제와 함께 조용히 사라지지 않게 한다(2026-09-18 소유자 결정 D12).
--
-- 헌법 db-rules §2·§3 은 SRActivity·SRStatusHistory 를 "지워지지 않는 이력"으로 규정한다. 그런데 두 테이블의
-- sr_id FK 가 ON DELETE CASCADE 라, DB 에서 SR 한 건을 직접 지우면(개인정보 삭제 요청을 받은 수작업, 앞으로
-- 만들 보존 기간 정리 배치의 실수 등) 이력이 경고 없이 함께 사라졌다. 앱은 SR 을 논리 삭제(deleted_at)만 하므로
-- 앱 동작은 바뀌지 않는다.
--
-- RESTRICT 는 이력을 "영구 보존"하는 장치가 아니라 "SR 을 지울 때 이력이 몰래 함께 사라지는 것"을 막는 장치다.
-- 이력까지 지워야 한다면 이력을 먼저 명시적으로 지워야 한다. 댓글·첨부는 헌법이 이력으로 이름을 들지 않았고
-- 앱이 첨부를 개별로 지우기도 하므로 CASCADE 로 둔다.
--
-- 기존 행은 모두 이미 같은 FK 를 만족한다(삭제 동작만 바뀐다). 제약을 다시 만들며 검증하는 동안 두 테이블 쓰기가
-- 잠시 막힌다.

ALTER TABLE "sr_activities" DROP CONSTRAINT "sr_activities_sr_id_fkey";
ALTER TABLE "sr_activities" ADD CONSTRAINT "sr_activities_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sr_status_history" DROP CONSTRAINT "sr_status_history_sr_id_fkey";
ALTER TABLE "sr_status_history" ADD CONSTRAINT "sr_status_history_sr_id_fkey" FOREIGN KEY ("sr_id") REFERENCES "srs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
