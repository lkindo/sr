# Supabase PostgreSQL 설정 완료

## ✅ 완료된 작업

1. **Prisma 스키마 변경**: SQLite → PostgreSQL
2. **Supabase 연결 테스트**: 성공
3. **데이터베이스 스키마 동기화**: 완료

---

## ⚠️ Prisma Client 재생성 필요

현재 **Prisma Client**가 **SQLite** 스키마로 생성되어 있어, **PostgreSQL**로 재생성이 필요합니다.

### 해결 방법

#### 1단계: 개발 서버 종료

실행 중인 개발 서버가 있다면 종료합니다:

- PowerShell에서 `Ctrl+C` 또는 터미널 종료
- VSCode 터미널에서 실행 중인 `pnpm dev` 종료

#### 2단계: Prisma Client 폴더 수동 삭제

**파일 탐색기**에서 다음 폴더를 삭제합니다:

```
C:\Users\sanle\OneDrive\문서\GitHub\sr\src\generated\prisma
```

또는 PowerShell에서:

```powershell
Remove-Item -Path "src\generated\prisma" -Recurse -Force
```

#### 3단계: Prisma Client 재생성

```bash
npx prisma generate
```

#### 4단계: Seed 데이터 생성

```bash
npm run db:seed
```

---

## 📊 현재 Supabase 데이터베이스 상태

- **연결 상태**: ✅ 성공
- **호스트**: aws-1-ap-northeast-2.pooler.supabase.com
- **포트**: 5432
- **데이터베이스**: postgres
- **스키마 동기화**: ✅ 완료

### 생성된 테이블 (17개)

1. users
2. accounts
3. sessions
4. verification_tokens
5. roles
6. permissions
7. user_roles
8. role_permissions
9. clients
10. user_clients
11. service_categories
12. client_handlers
13. srs
14. sr_activities
15. sr_comments
16. sr_attachments
17. sr_status_history
18. notifications

---

## 🚀 다음 단계

### 1. Prisma Client 재생성 후 Seed 실행

```bash
# Prisma Client 생성
npx prisma generate

# Seed 데이터 (역할, 권한) 생성
npm run db:seed
```

**Seed 데이터**:

- 역할 5개: ADMIN, MANAGER, ENGINEER, CLIENT_ADMIN, CLIENT_USER
- 권한 32개: SR, CLIENT, USER, ROLE, COMMENT, ATTACHMENT, NOTIFICATION, DASHBOARD 관련

### 2. 개발 서버 실행

```bash
pnpm dev
```

### 3. 첫 사용자 등록

브라우저에서 [http://localhost:3001/register](http://localhost:3001/register)로 이동하여 계정 생성

---

## 🔍 데이터베이스 확인

### Prisma Studio로 확인

```bash
npx prisma studio
```

브라우저가 자동으로 열리고 데이터베이스 내용을 GUI로 확인할 수 있습니다.

### Supabase Dashboard로 확인

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택 (jafobjjmeisydllmukmu)
3. Table Editor에서 테이블 확인

---

## 🛠️ 문제 해결

### "EPERM: operation not permitted" 오류

**원인**: 다른 프로세스가 Prisma Client 파일을 사용 중

**해결**:

1. 모든 개발 서버 종료
2. VSCode 재시작
3. `src\generated\prisma` 폴더 수동 삭제
4. `npx prisma generate` 재실행

### 연결 오류

**문제**: `Can't reach database server`

**확인 사항**:

1. `.env` 파일의 `DATABASE_URL`과 `DIRECT_URL` 확인
2. Supabase 프로젝트가 활성화되어 있는지 확인
3. 비밀번호가 정확한지 확인 (현재: sr1234)

---

## 📝 환경 변수 (.env)

```env
# Supabase PostgreSQL
DATABASE_URL="postgresql://postgres.jafobjjmeisydllmukmu:sr1234@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.jafobjjmeisydllmukmu:sr1234@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"

# NextAuth
NEXTAUTH_SECRET="temporary-secret-key-change-in-production"
NEXTAUTH_URL="http://localhost:3001"

# 앱 URL
NEXT_PUBLIC_APP_URL="http://localhost:3001"

# 이메일 (선택적)
RESEND_API_KEY=""
EMAIL_FROM="SR Management <noreply@sr-system.com>"
```

---

## ✅ 설정 완료 후 확인

다음 항목을 확인하여 설정이 제대로 되었는지 검증합니다:

- [ ] `npx prisma generate` 성공
- [ ] `npm run db:seed` 성공
- [ ] `pnpm dev` 실행
- [ ] 회원가입 성공
- [ ] 로그인 성공
- [ ] 대시보드 접근 가능

---

**설정일**: 2025-11-08  
**데이터베이스**: Supabase PostgreSQL  
**Prisma 버전**: 6.19.0
