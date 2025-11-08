# SR 관리 시스템 설정 가이드

## 📋 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [프로젝트 설정](#프로젝트-설정)
3. [데이터베이스 설정](#데이터베이스-설정)
4. [개발 서버 실행](#개발-서버-실행)
5. [배포 준비](#배포-준비)
6. [문제 해결](#문제-해결)

---

## 시스템 요구사항

- **Node.js**: 18.x 이상
- **pnpm**: 8.x 이상 (또는 npm, yarn)
- **데이터베이스**: PostgreSQL 15+ 또는 SQLite (개발용)

---

## 프로젝트 설정

### 1. 저장소 클론 및 의존성 설치

```bash
# 저장소 클론
git clone <repository-url>
cd sr

# 의존성 설치
pnpm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다:

#### 개발 환경 (SQLite)

```env
# 데이터베이스 (개발용 SQLite)
DATABASE_URL="file:./prisma/dev.db"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="development-secret-key-change-in-production-min-32-chars"

# 앱 URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 환경
NODE_ENV="development"

# 이메일 (Resend) - 선택적
RESEND_API_KEY=""
EMAIL_FROM="SR Management <noreply@localhost>"
```

#### 프로덕션 환경 (PostgreSQL / Supabase)

```env
# 데이터베이스 (Supabase PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database"
DIRECT_URL="postgresql://user:password@host:5432/database"

# NextAuth.js
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="your-production-secret-key-min-32-characters-long"

# 앱 URL
NEXT_PUBLIC_APP_URL="https://yourdomain.com"

# 환경
NODE_ENV="production"

# 이메일 (Resend)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="SR Management <noreply@yourdomain.com>"
```

---

## 데이터베이스 설정

### SQLite (개발용)

1. **Prisma 스키마 확인**

`prisma/schema.prisma`에서 데이터소스가 SQLite로 설정되어 있는지 확인:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

2. **마이그레이션 실행**

```bash
npx prisma db push
```

3. **Seed 데이터 생성**

```bash
npm run db:seed
```

### PostgreSQL / Supabase (프로덕션)

1. **Prisma 스키마 확인**

`prisma/schema.prisma`에서 데이터소스가 PostgreSQL로 설정되어 있는지 확인:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

2. **마이그레이션 실행**

```bash
# 개발 환경
npx prisma migrate dev --name init

# 프로덕션 환경
npx prisma migrate deploy
```

3. **Seed 데이터 생성**

```bash
npm run db:seed
```

---

## 개발 서버 실행

### 1. Prisma Client 생성

```bash
npx prisma generate
```

### 2. 개발 서버 시작

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

### 3. 테스트 계정 생성

회원가입 페이지([http://localhost:3000/register](http://localhost:3000/register))에서 첫 번째 계정을 생성합니다.

---

## 배포 준비

### Vercel 배포

1. **Vercel 프로젝트 생성**

```bash
vercel
```

2. **환경 변수 설정**

Vercel 대시보드에서 다음 환경 변수를 설정합니다:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `RESEND_API_KEY` (선택적)
- `EMAIL_FROM` (선택적)

3. **프로덕션 배포**

```bash
vercel --prod
```

---

## 문제 해결

### 데이터베이스 연결 오류

**문제**: `Can't reach database server`

**해결책**:
1. DATABASE_URL이 정확한지 확인
2. 데이터베이스 서버가 실행 중인지 확인
3. 방화벽 설정 확인

### Prisma Client 생성 오류

**문제**: `EPERM: operation not permitted`

**해결책**:
1. 개발 서버 종료
2. `src/generated/prisma` 폴더 삭제
3. `npx prisma generate` 재실행

### 포트 충돌

**문제**: `Port 3000 is already in use`

**해결책**:
```bash
# 포트 변경
PORT=3001 pnpm dev
```

### 마이그레이션 충돌

**문제**: `Drift detected: Your database schema is not in sync`

**해결책**:
```bash
# 개발 환경 - 데이터베이스 초기화
npx prisma migrate reset --force

# 프로덕션 환경 - 수동으로 마이그레이션 관리
npx prisma migrate resolve --applied <migration-name>
```

---

## 추가 정보

### 주요 명령어

```bash
# 개발 서버 실행
pnpm dev

# 프로덕션 빌드
pnpm build

# 프로덕션 서버 실행
pnpm start

# 린트 검사
pnpm lint

# 타입 체크
pnpm type-check

# Prisma Studio (DB GUI)
npx prisma studio

# 마이그레이션 생성
npx prisma migrate dev --name <migration-name>

# Seed 데이터 생성
npm run db:seed
```

### 디렉토리 구조

```
sr/
├── prisma/           # Prisma 스키마 및 마이그레이션
├── public/           # 정적 파일
├── src/
│   ├── app/         # Next.js App Router
│   ├── components/  # React 컴포넌트
│   ├── lib/         # 유틸리티 및 서비스
│   ├── types/       # TypeScript 타입
│   └── utils/       # 헬퍼 함수
├── docs/            # 프로젝트 문서
└── uploads/         # 업로드된 파일 (개발용)
```

### 문서

- [PRD](./docs/SR_Management_System_PRD.md): 비즈니스 요구사항
- [TRD](./docs/TRD.md): 기술 명세
- [LLD](./docs/LLD.md): 구현 상세
- [DB](./docs/DB.md): 데이터베이스 설계
- [WBS](./docs/planning/wbs_optimized.md): 작업 분해 구조

---

## 지원

문제가 발생하거나 질문이 있으시면 이슈를 등록해주세요.


