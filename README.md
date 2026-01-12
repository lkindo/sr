# SR Management System

Service Request 관리 시스템

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase PostgreSQL
- **ORM**: Prisma
- **Authentication**: NextAuth.js v5
- **Deployment**: Vercel

## 개발 환경 설정

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 필요한 값을 입력합니다.

```bash
cp .env.example .env
```

### 3. 데이터베이스 설정

```bash
# Prisma 마이그레이션
pnpm prisma migrate dev

# Prisma Studio 실행 (선택사항)
pnpm prisma studio
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

## 프로젝트 구조

```
sr-management/
├── docs/               # 프로젝트 문서
│   ├── PRD.md
│   ├── TRD.md
│   ├── LLD.md
│   ├── DB.md
│   └── planning/
│       └── wbs_optimized.md
├── prisma/            # Prisma 스키마 및 마이그레이션
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/          # Next.js App Router
│   │   ├── (auth)/   # 인증 관련 페이지
│   │   ├── (dashboard)/ # 대시보드 페이지
│   │   └── api/      # API Routes
│   ├── components/   # React 컴포넌트
│   ├── lib/         # 유틸리티, 서비스
│   ├── types/       # TypeScript 타입 정의
│   └── utils/       # 헬퍼 함수
└── public/          # 정적 파일
```

## 스크립트

- `pnpm dev`: 개발 서버 실행 (Turbopack)
- `pnpm build`: 프로덕션 빌드
- `pnpm start`: 프로덕션 서버 실행
- `pnpm lint`: ESLint 검사
- `pnpm type-check`: TypeScript 타입 체크

## 개발 가이드라인

### 코드 품질
- **Strict Typing**: 프로젝트는 `any` 타입 사용을 지양합니다. `strict` 모드가 활성화되어 있습니다.
- **Commit Check**: 커밋 전 `pnpm type-check`와 `pnpm lint`를 통과해야 합니다.
- **Server Components**: Next.js 15 Server Components 활용을 권장합니다.

### 테스트
이 프로젝트는 두 가지 레벨의 테스트를 운영합니다.

#### 1. 단위 테스트 (Unit Tests)
Vitest를 사용하여 서비스 로직 및 유틸리티를 검증합니다.
```bash
pnpm test          # 테스트 실행
pnpm test:ui       # UI 모드로 실행
pnpm test:coverage # 커버리지 확인
```

#### 2. E2E 테스트 (Playwright)
실제 브라우저 환경에서 사용자 시나리오를 검증합니다.
```bash
pnpm test:e2e      # 전체 E2E 테스트
pnpm test:e2e:ui   # UI 모드로 실행 (디버깅 용이)
```
- **주요 시나리오**: 로그인, SR 접수/처리, 관리자 기능 등

## 문서

- [PRD](./docs/SR_Management_System_PRD.md): 비즈니스 요구사항
- [TRD](./docs/TRD.md): 기술 명세
- [LLD](./docs/LLD.md): 구현 상세
- [DB](./docs/DB.md): 데이터베이스 설계
- [WBS](./docs/planning/wbs_optimized.md): 작업 분해 구조

## 라이선스

Private
