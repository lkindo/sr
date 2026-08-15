-- 비밀번호 변경 시 기존 JWT 세션을 무효화하기 위한 서버 측 세대 번호.
ALTER TABLE "users"
ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
