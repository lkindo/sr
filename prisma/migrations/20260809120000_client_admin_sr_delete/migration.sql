-- CLIENT_ADMIN 에게 SR:DELETE 를 부여한다 (데이터 마이그레이션).
--
-- ── 왜 시드가 아니라 마이그레이션인가 ───────────────────────────────────
-- prisma/seed.ts 의 assignPermissions 는 운영자 편집을 보존하려고 **이미 배정이 있는
-- 역할은 건너뛴다.** 예외는 "이번 실행에서 처음 생긴 권한" 뿐인데, SR:DELETE 는
-- 카탈로그에 이미 있으므로(MANAGER 가 보유) 그 예외에 해당하지 않는다.
-- 즉 seed.ts 의 목록만 고치면 신규 DB 에만 반영되고 기존 DB 는 그대로다.
-- SEED_FORCE_ROLE_PERMISSIONS=true 는 해당 역할의 운영자 편집을 통째로 날리므로
-- 이 한 건을 위해 쓸 수 없다. 그래서 배포 경로(prisma migrate deploy)에 싣는다.
--
-- ── 권한이 테넌트를 넓히지 않는다 ───────────────────────────────────────
-- policies.canDeleteSR 은 외부 사용자에게
--   `hasPermissionFlag(SR:DELETE) && user.clientIds.includes(sr.clientId)`
-- 를 요구한다(감사 4.1 에서 강화). 따라서 이 부여로 CLIENT_ADMIN 이 지울 수 있게 되는
-- 것은 **자사 SR 뿐**이고, 타 테넌트 SR 은 그대로 403 이다.
--
-- 멱등하다 — (role_id, permission_id) 유니크 제약에 ON CONFLICT DO NOTHING.
-- 역할이나 권한이 아직 없는 DB(시드 전)에서는 SELECT 가 0행이라 아무 일도 하지 않는다.

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT
  -- cuid 는 애플리케이션에서만 만들 수 있으므로, 충돌하지 않는 결정적 문자열을 쓴다.
  -- VarChar(30) 상한에 맞춘다.
  'mig20260809clientadmindel',
  r."id",
  p."id",
  NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'CLIENT_ADMIN'
  AND p."resource" = 'SR'
  AND p."action" = 'DELETE'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
