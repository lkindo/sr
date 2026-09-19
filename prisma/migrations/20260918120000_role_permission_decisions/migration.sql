-- 소유자 정책 결정(2026-09-18)에 따른 역할 권한 회수 (데이터 마이그레이션).
--
-- ── 무엇을 바꾸는가 ──────────────────────────────────────────────────────
-- D1. ENGINEER 의 SR:INTAKE 회수 — 접수·담당자 배정은 운영 관리자(ADMIN·MANAGER)의 공용 큐 업무다
--     (헌법 §1.1·§4, PRD 배정 ❌). 코드는 policies.canIntakeSR / canAssignSR 로 같은 규칙을 강제한다.
-- D2. CLIENT_ADMIN 의 SR:STATUS_CHANGE 회수 — 고객사 관리자는 확인(SR:CONFIRM)·재오픈만 한다.
--     거절·진행·보류·완료를 고객이 누를 수 있으면 SLA 준수율이 벤더 성과 지표로서 의미를 잃는다.
-- D5. USER:ASSIGN_ROLE 권한 삭제 — 역할 부여는 ADMIN 전용이다. 이 권한은 코드 어디에서도 검사하지
--     않아(역할 부여 라우트는 ROLE:ASSIGN 만 본다) 켜도 끄도 아무 효과가 없는 권한이었다.
--
-- ── 왜 시드가 아니라 마이그레이션인가 ───────────────────────────────────
-- prisma/seed.ts 는 운영자 편집을 보존하려고 이미 배정이 있는 역할을 건너뛰고, 운영 배포는 시드를
-- 다시 돌리지 않는다(deploy.yml 7단계). seed.ts 만 고치면 신규 DB 에만 반영된다.
--
-- ⚠️ RBAC 화면에서 운영자가 일부러 이 권한을 준 커스텀 편집도 함께 회수된다. 역할 이름으로 대상을
--    고르므로 커스텀 역할(다른 이름)에 준 SR:INTAKE·SR:STATUS_CHANGE 는 건드리지 않는다.
--
-- 멱등하다 — 두 번 실행해도 지울 행이 없을 뿐이다. 역할·권한이 없는 DB(시드 전)에서는 0행이다.

-- D1
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."name" = 'ENGINEER'
  AND p."resource" = 'SR'
  AND p."action" = 'INTAKE';

-- D2
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."name" = 'CLIENT_ADMIN'
  AND p."resource" = 'SR'
  AND p."action" = 'STATUS_CHANGE';

-- D5 — 배정을 먼저 지우고 권한 행을 지운다(FK).
DELETE FROM "role_permissions" rp
USING "permissions" p
WHERE rp."permission_id" = p."id"
  AND p."resource" = 'USER'
  AND p."action" = 'ASSIGN_ROLE';

DELETE FROM "permissions"
WHERE "resource" = 'USER'
  AND "action" = 'ASSIGN_ROLE';
