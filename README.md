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

## 문서

- [PRD](./docs/SR_Management_System_PRD.md): 비즈니스 요구사항
- [TRD](./docs/TRD.md): 기술 명세
- [LLD](./docs/LLD.md): 구현 상세
- [DB](./docs/DB.md): 데이터베이스 설계
- [WBS](./docs/planning/wbs_optimized.md): 작업 분해 구조

## 라이선스

Private
