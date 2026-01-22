# SR Management System

Service Request(SR) 관리 시스템 - 고객 요청을 효율적으로 접수, 처리, 추적하는 엔터프라이즈급 웹 애플리케이션

![SR System Overview](docs/images/overview.png) _(이미지 경로 예시)_

---

## 📋 주요 기능

- **SR 요청 관리**: 고객 서비스 요청 생성, 조회, 수정, 삭제 및 이력 추적
- **상태 워크플로우**: 요청됨 → 접수 → 진행중 → 완료/취소/반려의 체계적인 상태 관리
- **SLA & 우선순위**: 긴급도에 따른 우선순위(CRITICAL~LOW) 관리 및 SLA 마감일 추적
- **사용자 역할**:
  - **운영팀**: ADMIN (전체 권한), MANAGER (관리), ENGINEER (실무)
  - **고객사**: CLIENT_ADMIN (고객사 관리), CLIENT_USER (요청 전용)
- **모바일 최적화 (Mobile-First)**:
  - **통합 디자인 시스템**: 모든 모바일 카드에 일관된 디자인 토큰(2열 그리드 정보 배치, p-3.5 패딩) 적용
  - **콤팩트 필터**: 모바일 화면 활용도를 높이기 위한 탭/칩 스타일 필터 시스템
- **PWA & 성능**:
  - **오프라인 지원**: 서비스 워커를 통한 리소스 캐싱 및 오프라인 모드 지원
  - **속도 최적화**: `navigationPreload` 활성화 및 미들웨어 리다이렉트 서버화로 렌더링 지연 최소화
- **보안**: 역할 기반 권한 제어(RBAC), 환경 변수 기반 Rate Limiting

---

## 🏗️ 아키텍처 및 배포 전략

이 프로젝트는 **하이브리드 배포 환경**을 지원하도록 설계되었습니다.

### 1. Docker 배포 (권장 - 온프레미스/AWS)

- **환경 격리**: `.env.docker`를 통해 로컬 환경과 완전히 분리된 설정 사용
- **최적화**: 멀티 스테이지 빌드(Standalone Output)로 이미지 크기 최소화
- **DB 포함**: PostgreSQL 컨테이너와 함께 `docker-compose`로 즉시 실행 가능

### 2. Vercel 배포 (Cloud)

- Edge Function 및 Serverless 환경 호환
- Vercel Blob / Postgres / Redis 통합 지원

---

## 🛠️ 기술 스택 (Latest)

| 분류           | 기술               | 버전          | 비고                       |
| -------------- | ------------------ | ------------- | -------------------------- |
| **Framework**  | Next.js            | **16.0.7**    | App Router, Server Actions |
| **Runtime**    | Node.js            | 24.x          |                            |
| **UI Library** | React              | **19.2.1**    | Server Components          |
| **Styling**    | Tailwind CSS       | 3.4.1         | Shadcn/ui (Radix UI)       |
| **Database**   | PostgreSQL         | 15+           |                            |
| **ORM**        | Prisma             | **6.19.0**    | Typed SQL Support          |
| **Email**      | Nodemailer         | 7.0.11        | SMTP Service               |
| **Auth**       | NextAuth.js        | 5.0.0-beta.30 |                            |
| **Validation** | Zod                | 4.1.12        | Server-side Validation     |
| **Testing**    | Vitest, Playwright | Latest        | Unit & E2E Testing         |
| **Container**  | Docker             | Compose V2    | Production Ready           |

---

## 📁 프로젝트 구조

```
src/
├── actions/           # Server Actions (보안 로직 포함)
├── app/
│   ├── (auth)/        # 인증 라우트 group
│   ├── (dashboard)/   # 대시보드 레이아웃 group
│   └── api/           # REST API Endpoints (External Integrations)
├── components/        # React Components
│   ├── ui/            # Shadcn UI (Atomic)
│   ├── srs/           # SR 관련 비즈니스 컴포넌트
│   └── ...
├── hooks/             # Custom React Hooks
├── lib/               # Shared Utilities
│   ├── env-validation.ts # 환경 변수 검증 모듈
│   ├── rate-limiter.ts   # Rate Limiting 로직 (Middleware/API)
│   ├── pagination.ts     # 페이지네이션 표준화
│   └── ...
└── services/          # Business Logic Layer (Prisma 의존성 격리)
    ├── sr.service.ts
    ├── user.service.ts
    └── ...
```

---

## 🚀 시작하기

### 1. 로컬 개발 환경 (Localhost)

```bash
# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.local

# 데이터베이스 설정
pnpm prisma migrate dev
pnpm db:seed

# 개발 서버 실행
pnpm dev
# http://localhost:3000 접속 (환경변수: .env 사용)
```

### 2. Docker 환경 (Production-like)

별도의 설정 변경 없이 바로 실행 가능합니다. (도커 전용 `.env.docker` 자동 로드)

```bash
# 컨테이너 빌드 및 실행
docker-compose up --build

# 실행 확인
# http://localhost:3001 접속 (환경변수: .env.docker 자동 사용)
```

---

## ⚙️ 환경 변수 및 Rate Limiting

`.env.docker` 또는 `.env` 파일에서 시스템의 보안 정책을 유연하게 조정할 수 있습니다.

| 변수명                                | 설명                   | 기본값      |
| :------------------------------------ | :--------------------- | :---------- |
| `RATE_LIMIT_MIDDLEWARE_WINDOW_MS`     | 미들웨어 제한 시간(ms) | 60000 (1분) |
| `RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS`  | 시간당 최대 요청 수    | 20          |
| `RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS` | 파일 업로드 제한       | 20 (시간당) |

---

## 🔧 데이터베이스 유지보수

시스템 운영 중 발생하는 데이터 불일치를 해결하기 위한 유틸리티 스크립트입니다.

### 시스템 운영팀 고객사 할당 정리

운영팀(Admin/Manager) 계정이 실수로 특정 고객사에 매핑된 경우 이를 정리합니다.

```bash
# 1. 대상 확인 (Dry Run)
npm run cleanup:system-team-clients:dry-run

# 2. 실제 삭제
npm run cleanup:system-team-clients
```

---

## 🧪 테스트

```bash
pnpm test              # 단위 테스트 (Vitest)
pnpm test:ui           # 단위 테스트 UI 모드
pnpm test:coverage     # 커버리지 리포트 확인
```

### E2E 테스트 (Playwright)

```bash
pnpm test:e2e          # 전체 E2E 테스트 (Headless)
pnpm test:e2e:ui       # UI 모드 (디버깅)
pnpm test:e2e:debug    # 디버깅 모드
```

### 뮤테이션 테스트 (Stryker)

코드의 견고성을 검증하기 위해 결함 주입 테스트를 수행합니다.

```bash
pnpm test:mutation
```

### UI 컴포넌트 테스트 (Storybook)

```bash
pnpm storybook         # 스토리북 실행 (6006 포트)
```

```

---

## 📖 문서

- [PRD](./docs/SR_Management_System_PRD.md): 요구사항 정의서
- [DB Schema](./prisma/schema.prisma): 데이터베이스 구조
- [Changes & Logs](./docs/CHANGELOG.md): 변경 이력
```
