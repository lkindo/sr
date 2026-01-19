# Supabase 데이터베이스 연결 가이드

이 가이드는 SR 관리 시스템을 Supabase PostgreSQL 데이터베이스에 연결하는 방법을 설명합니다.

## 📋 목차

1. [Supabase 프로젝트 생성](#1-supabase-프로젝트-생성)
2. [Connection String 확보](#2-connection-string-확보)
3. [환경 변수 설정](#3-환경-변수-설정)
4. [데이터베이스 마이그레이션](#4-데이터베이스-마이그레이션)
5. [초기 데이터 생성](#5-초기-데이터-생성)
6. [연결 테스트](#6-연결-테스트)
7. [문제 해결](#7-문제-해결)

---

## 1. Supabase 프로젝트 생성

### 1.1 Supabase 계정 생성

1. [https://supabase.com](https://supabase.com) 접속
2. **"Start your project"** 또는 **"Sign in"** 클릭
3. **GitHub 계정**으로 로그인 (권장) 또는 이메일로 가입

### 1.2 새 프로젝트 생성

1. Dashboard에서 **"New project"** 버튼 클릭
2. Organization 선택 (없으면 자동 생성됨)
3. 프로젝트 정보 입력:

   | 항목                  | 값                       | 설명                           |
   | --------------------- | ------------------------ | ------------------------------ |
   | **Name**              | `sr-management`          | 프로젝트 이름 (원하는 대로)    |
   | **Database Password** | sr1234                   | **⚠️ 반드시 저장!**            |
   | **Region**            | `Northeast Asia (Seoul)` | 한국에 가장 가까운 지역        |
   | **Pricing Plan**      | `Free`                   | 무료 플랜 (500MB DB, 1GB 전송) |

4. **"Create new project"** 클릭
5. ⏳ 프로젝트 생성 대기 (약 2-3분)

---

## 2. Connection String 확보

### 2.1 Database Settings 이동

1. 프로젝트 생성 완료 후, 좌측 메뉴에서 **⚙️ Project Settings** 클릭
2. 좌측 메뉴에서 **"Database"** 클릭

### 2.2 Connection Pooling URL 복사

**Connection Pooling**은 Prisma와 함께 사용할 때 성능이 더 좋습니다.

1. **"Connection string"** 섹션 찾기
2. **"Connection pooling"** 토글을 **ON**으로 설정
3. **Mode** 드롭다운에서 **"Transaction"** 선택
4. **URI** 복사 (아래와 같은 형식):

```
postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

⚠️ **중요**: `[YOUR-PASSWORD]`는 실제 비밀번호로 자동 교체됩니다.

### 2.3 Direct Connection URL 복사

마이그레이션 실행 시 필요합니다.

1. 같은 페이지에서 **"Connection pooling"** 토글을 **OFF**로 설정
2. **"Display connection string as"** 드롭다운에서 **"URI"** 선택
3. **URI** 복사 (아래와 같은 형식):

```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
```

---

## 3. 환경 변수 설정

### 3.1 .env 파일 업데이트

프로젝트 루트의 `.env` 파일을 열고 다음과 같이 수정:

```bash
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"

# NextAuth
NEXTAUTH_SECRET="temporary-secret-key-change-in-production"
NEXTAUTH_URL="http://localhost:3001"

# Resend (이메일 발송 서비스)
RESEND_API_KEY=""
EMAIL_FROM="SR Management <noreply@sr-system.com>"
NEXT_PUBLIC_APP_URL="http://localhost:3001"
```

### 3.2 환경 변수 설명

| 변수              | 설명                                        | 필수      |
| ----------------- | ------------------------------------------- | --------- |
| `DATABASE_URL`    | Prisma 클라이언트가 사용하는 연결 (Pooling) | ✅        |
| `DIRECT_URL`      | 마이그레이션 실행 시 사용하는 직접 연결     | ✅        |
| `NEXTAUTH_SECRET` | NextAuth 암호화 키                          | ✅        |
| `NEXTAUTH_URL`    | 앱 URL                                      | ✅        |
| `RESEND_API_KEY`  | 이메일 발송 API 키                          | ❌ (선택) |

---

## 4. 데이터베이스 스키마 생성

### 🎯 방법 1: Supabase SQL Editor 사용 (권장)

Connection Pooler를 사용할 때는 Prisma CLI 마이그레이션이 작동하지 않으므로 SQL Editor를 사용합니다.

#### 4.1 SQL Editor 열기

1. Supabase Dashboard에서 좌측 메뉴 **"SQL Editor"** 클릭
2. **"New query"** 버튼 클릭

#### 4.2 스키마 생성 SQL 실행

1. 프로젝트의 `supabase-init.sql` 파일 내용을 복사
2. SQL Editor에 붙여넣기
3. **"Run"** 버튼 클릭 또는 `Ctrl + Enter`

#### 4.3 스키마 생성 확인

1. 좌측 메뉴 **"Table Editor"** 클릭
2. 다음 테이블들이 생성되었는지 확인:
   - `users`
   - `accounts`
   - `sessions`
   - `verification_tokens`
   - `roles`
   - `user_roles`
   - `permissions`
   - `role_permissions`
   - `clients`
   - `user_clients`
   - `service_categories`
   - `client_handlers`
   - `srs`
   - `sr_activities`
   - `sr_comments`
   - `sr_attachments`
   - `notifications`
   - `sr_status_history`

#### 4.4 Enum 타입 확인

1. SQL Editor에서 다음 쿼리 실행:

```sql
SELECT typname FROM pg_type WHERE typtype = 'e';
```

2. 다음 Enum 타입들이 생성되었는지 확인:
   - `SRStatus`
   - `SRPriority`
   - `SRActivityType`
   - `NotificationType`
   - `NotificationStatus`

### ⚙️ 방법 2: Prisma CLI 사용 (Direct Connection 필요)

Direct Connection URL이 있을 때만 사용 가능합니다.

```bash
# Prisma Client 재생성
npx prisma generate

# 마이그레이션 실행
npx prisma db push
```

**⚠️ 주의**: Connection Pooler URL을 사용하면 다음 오류가 발생합니다:

```
Error: P1001: Can't reach database server
```

---

## 5. 초기 데이터 생성

### 🎯 방법 1: Supabase SQL Editor 사용 (권장)

#### 5.1 SQL Editor에서 Seed 데이터 실행

1. Supabase Dashboard에서 좌측 메뉴 **"SQL Editor"** 클릭
2. **"New query"** 버튼 클릭
3. 프로젝트의 `supabase-seed.sql` 파일 내용을 복사
4. SQL Editor에 붙여넣기
5. **"Run"** 버튼 클릭 또는 `Ctrl + Enter`

#### 5.2 Seed 데이터 확인

생성되는 데이터:

- **31개 권한** (SR, CLIENT, USER, ROLE, COMMENT, ATTACHMENT)
- **5개 기본 역할**:
  - `ADMIN` - 시스템 관리자 (모든 권한)
  - `MANAGER` - 매니저 (SR 관리 및 사용자 관리)
  - `ENGINEER` - 엔지니어 (SR 처리)
  - `CLIENT_ADMIN` - 고객사 관리자 (자사 SR 관리)
  - `CLIENT_USER` - 고객사 사용자 (SR 생성 및 조회)

Supabase Table Editor에서 확인:

1. `roles` 테이블 → 5개 행 확인
2. `permissions` 테이블 → 31개 행 확인
3. `role_permissions` 테이블 → 매핑 데이터 확인

### ⚙️ 방법 2: Prisma Seed Script 사용

Node.js 환경에서 직접 실행:

```bash
pnpm db:seed
```

또는

```bash
npx tsx prisma/seed.ts
```

**⚠️ 주의**: Connection Pooler를 사용 중이면 실행 시 오류가 발생할 수 있습니다. SQL Editor 사용을 권장합니다.

---

## 6. 연결 테스트

### 6.1 Health Check API로 데이터베이스 연결 확인

1. 개발 서버 실행:

```bash
pnpm dev
```

2. Health check endpoint 호출:

```bash
curl http://localhost:3000/api/health
```

3. 성공 응답 예시:

```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "result": [{ "connected": 1 }],
    "serverTime": [{ "server_time": "2025-11-08T06:14:21.206Z" }]
  },
  "timestamp": "2025-11-08T06:14:22.963Z"
}
```

### 6.2 Prisma Studio로 데이터 확인 (선택)

```bash
npx prisma studio
```

브라우저가 자동으로 열리고 Prisma Studio가 실행됩니다.

- URL: http://localhost:5555
- 모든 테이블 데이터를 GUI로 확인 가능

**⚠️ 주의**: Connection Pooler 사용 시 Prisma Studio가 작동하지 않을 수 있습니다.

### 6.3 애플리케이션에서 데이터베이스 확인

1. 개발 서버 접속: http://localhost:3000
2. 회원가입 페이지에서 새 계정 생성 (관리자 계정 권한은 직접 SQL로 부여)
3. 로그인 후 Dashboard 접근 확인

### 6.4 관리자 권한 부여 (필요 시)

생성한 계정에 관리자 권한을 부여하려면:

1. Supabase SQL Editor에서 실행:

```sql
-- 사용자 ID 확인
SELECT id, email, name FROM users;

-- 관리자 역할 부여 (사용자 ID를 실제 값으로 교체)
INSERT INTO user_roles (id, user_id, role_id)
VALUES (gen_random_uuid(), 'YOUR_USER_ID', 'role_admin')
ON CONFLICT (user_id, role_id) DO NOTHING;
```

2. 로그아웃 후 다시 로그인하여 권한 확인

---

## 7. 문제 해결

### 문제 1: "Environment variable not found: DATABASE_URL"

**원인**: `.env` 파일이 제대로 로드되지 않음

**해결**:

```bash
# .env 파일이 프로젝트 루트에 있는지 확인
ls .env

# dev 서버 재시작
pnpm dev
```

### 문제 2: "Can't reach database server"

**원인**: Connection String이 잘못되었거나 네트워크 문제

**해결**:

1. `.env` 파일의 `DATABASE_URL` 확인
2. 비밀번호에 특수문자가 있다면 URL 인코딩 필요:
   ```
   @ → %40
   # → %23
   $ → %24
   & → %26
   = → %3D
   ```
3. Supabase 프로젝트가 정상적으로 실행 중인지 확인

### 문제 3: "Error creating database: P3009"

**원인**: 마이그레이션 실행 권한 문제

**해결**:

- `DIRECT_URL` 사용:
  ```bash
  # .env 파일에 DIRECT_URL이 있는지 확인
  # 없으면 추가 후 다시 시도
  npx prisma migrate deploy
  ```

### 문제 4: Seed 스크립트 실행 오류

**원인**: 중복된 데이터 또는 외래 키 오류

**해결**:

```bash
# 기존 데이터 삭제 (주의: 모든 데이터 삭제!)
npx prisma migrate reset

# Seed 재실행
pnpm db:seed
```

### 문제 5: Prisma Client 타입 오류

**원인**: Prisma Client가 제대로 생성되지 않음

**해결**:

```bash
# Prisma Client 재생성
npx prisma generate

# 타입스크립트 서버 재시작 (VSCode)
# Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

---

## 📊 Supabase 무료 플랜 제한

| 항목              | 제한     |
| ----------------- | -------- |
| 데이터베이스 크기 | 500 MB   |
| 데이터 전송       | 1 GB/월  |
| 인증 사용자       | 50,000명 |
| 스토리지          | 1 GB     |
| 파일 업로드 크기  | 50 MB    |
| API 요청          | 무제한   |

⚠️ 제한 초과 시 업그레이드 필요 (Pro: $25/월)

---

## 🚀 다음 단계

Supabase 연결 완료 후:

1. ✅ 첫 사용자 계정 생성
2. ✅ 고객사 등록
3. ✅ SR 생성 테스트
4. ✅ 이메일 알림 설정 (Resend API)
5. ✅ Vercel 배포 (Production)

---

## 📚 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/database/supabase)
- [Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate)
