# SR Management System

Service Request(SR) 관리 시스템 - 고객 요청을 효율적으로 접수, 처리, 추적하는 엔터프라이즈급 웹 애플리케이션

---

## 📋 주요 기능

- **SR 요청 관리**: 고객 서비스 요청 생성, 조회, 수정, 삭제 및 이력 추적
- **상태 워크플로우**: 요청됨 → 접수 → 진행중 → 완료 → 확인완료. 진행 중 보류(ON_HOLD) 전이가
  가능하고, 신청·접수·보류 단계에서 거절(REJECTED)할 수 있습니다. ('취소' 상태는 없습니다.)
- **SLA & 우선순위**: 긴급도에 따른 우선순위(CRITICAL~LOW) 관리 및 SLA 마감일 추적
- **사용자 역할**:
  - **운영팀**: ADMIN (전체 권한), MANAGER (관리), ENGINEER (실무)
  - **고객사**: CLIENT_ADMIN (고객사 관리), CLIENT_USER (승인된 고객사 범위의 요청·조회)
- **모바일 최적화 (Mobile-First)**:
  - **통합 디자인 시스템**: 모든 모바일 카드에 일관된 디자인 토큰(2열 그리드 정보 배치, p-3.5 패딩) 적용
  - **콤팩트 필터**: 모바일 화면 활용도를 높이기 위한 탭/칩 스타일 필터 시스템
- **PWA & 성능**:
  - **오프라인 지원**: 서비스 워커를 통한 리소스 캐싱 및 오프라인 모드 지원
  - **속도 최적화**: `navigationPreload` 활성화 및 미들웨어 리다이렉트 서버화로 렌더링 지연 최소화
- **보안**: 역할 기반 권한 제어(RBAC), 환경 변수 기반 Rate Limiting

---

## 🏗️ 아키텍처 및 배포 전략

이 프로젝트는 **컨테이너 기반 자체 호스팅(self-hosted)** 을 전제로 설계되었습니다. 매니지드 클라우드 서비스(Vercel Blob / Vercel Postgres / Redis 등)에 의존하지 않습니다.

### 1. Docker 배포 (개발/운영 공통)

- **환경 격리**: `.env.docker`를 통해 로컬 환경과 완전히 분리된 설정 사용
- **최적화**: 멀티 스테이지 빌드(Standalone Output)로 이미지 크기 최소화
- **DB 포함**: `postgres:16-alpine` 컨테이너와 함께 `docker-compose`로 실행
- **운영 구성**: `docker-compose.prod.yml` 기준의 자체 서버(Docker Compose + nginx) 배포

### 2. 외부 서비스 의존성 (실제 구현)

- **첨부 파일 저장소**: 로컬 파일시스템. `STORAGE_DIR`(기본값 `<프로젝트 루트>/var/uploads`, 웹루트 바깥)에 직접 기록하며, 다운로드는 인증 라우트를 통해서만 제공됩니다. (`src/lib/storage.ts`)
- **캐시**: `next/cache`의 `unstable_cache` 기반. 별도의 Redis 인스턴스를 사용하지 않습니다. (`src/lib/cache.ts`)
- **Rate Limiting**: 애플리케이션 인메모리 구현(`MemoryRateLimiter`). (`src/lib/rate-limiter.ts`)
- **데이터베이스**: Prisma `provider = "postgresql"` + `DATABASE_URL`. 실제 인스턴스는 Compose의 PostgreSQL 컨테이너입니다.
- Vercel 관련 패키지 중 실제로 사용하는 것은 `@vercel/functions`의 `waitUntil` 하나뿐입니다.

---

## 🛠️ 기술 스택

- **Framework**: Next.js (App Router, Server Actions)
- **Runtime**: Node.js 22.x (`package.json`의 `engines`, Dockerfile, CI 워크플로 모두 22)
- **UI Library**: React (Server Components)
- **Styling**: Tailwind CSS + Shadcn/ui (Radix UI)
- **Database**: PostgreSQL (컨테이너 이미지 `postgres:16-alpine`)
- **ORM**: Prisma
- **Email**: Nodemailer (SMTP)
- **Auth**: NextAuth.js (v5 beta)
- **Validation**: Zod (서버 사이드 검증)
- **Testing**: Vitest, Playwright, Stryker
- **Container**: Docker / Compose V2
- **Package Manager**: pnpm

> 의존성 버전은 `package.json`이 단일 진실(single source of truth)입니다. 정확한 버전은 `package.json`과 `pnpm-lock.yaml`을 확인하세요. (Node 버전만 위와 같이 `engines`와 일치시켜 명시합니다.)

---

## 📁 프로젝트 구조

```
src/
├── actions/           # Server Actions (보안 로직 포함)
├── app/
│   ├── (auth)/        # 인증 라우트 group
│   ├── (dashboard)/   # 대시보드 레이아웃 group
│   └── api/           # Route Handlers (자사 프런트엔드 전용 REST/SSE, 외부 공개 API 아님)
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

# 환경 변수 설정 (로컬 개발은 .env 를 사용한다)
cp .env.example .env

# 데이터베이스 설정
pnpm prisma migrate dev
pnpm db:seed

# 개발 서버 실행
pnpm dev
# http://localhost:3000 접속 (환경변수: .env 사용)
```

> `pnpm db:seed`는 역할·권한 기준 데이터는 만들지만 개발 계정은 기본 생성하지 않습니다.
> 따라서 별도 설정이 없으면 로그인할 계정은 아직 없습니다. 최초 관리자 생성은
> [BOOTSTRAP](./docs/BOOTSTRAP.md)을 따르세요.

### 2. Docker 환경 (Production-like)

`docker-compose.yml`은 `env_file: .env.docker`를 요구하지만, 이 파일은 `.gitignore`(`.env.docker*`)로 제외되어 저장소에 포함되지 않습니다.
따라서 clone 직후에는 **`.env.docker`를 직접 만들어야** 컨테이너가 실행됩니다. 필요한 키는 `.env.example`을 참고하고, 시크릿 취급 절차는 [SECRET_ROTATION](./docs/SECRET_ROTATION.md)을 따르세요.

```bash
# 1. 도커 전용 환경 변수 파일 생성 (예시를 복사한 뒤 값 채우기)
cp .env.example .env.docker

# 2. 컨테이너 빌드 및 실행
docker-compose up --build

# 3. 실행 확인
# http://localhost:3001 접속 (컨테이너 3000 포트를 호스트 3001 로 매핑)
```

---

## ⚙️ 환경 변수 및 Rate Limiting

`.env.docker` 또는 `.env` 파일에서 시스템의 보안 정책을 유연하게 조정할 수 있습니다.
아래 "코드 기본값"은 환경 변수가 없을 때 `src/lib/rate-limiter.ts`가 적용하는 값이며, `.env.example` / `.env`가 각각 다른 값으로 덮어쓸 수 있습니다.

| 변수명                                | 설명                                | 코드 기본값 |
| :------------------------------------ | :---------------------------------- | :---------- |
| `RATE_LIMIT_MIDDLEWARE_WINDOW_MS`     | 미들웨어 제한 시간(ms)              | 60000 (1분) |
| `RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS`  | 미들웨어 윈도당(=분당) 최대 요청 수 | 100         |
| `RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS` | 파일 업로드 제한                    | 20 (시간당) |

> 현재 limiter 상태는 앱 프로세스 메모리에 있습니다. 운영 Compose의 앱 복제본 1개에서는
> 정확하지만, 수평 확장 전에 Redis/PostgreSQL 기반 공유 limiter로 교체해야 합니다. 그렇지
> 않으면 실효 한도가 복제본 수만큼 늘어납니다.

---

## 🔧 데이터베이스 유지보수

시스템 운영 중 발생하는 데이터 불일치를 해결하기 위한 유틸리티 스크립트입니다.

### 시스템 운영팀 고객사 할당 정리

운영팀(Admin/Manager) 계정이 실수로 특정 고객사에 매핑된 경우 이를 정리합니다.

```bash
# 1. 대상 확인 (Dry Run)
pnpm cleanup:system-team-clients:dry-run

# 2. 실제 삭제
pnpm cleanup:system-team-clients
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

---

## 📖 문서

### 제품 · 설계

- [SR_Management_System_PRD.md](./docs/SR_Management_System_PRD.md): 제품 요구사항 정의서(v1.4). 초기판이 기술했던 미채택 스택(Vercel/Upstash/Resend/Inngest 등)을 실제 구현 기준으로 정정했습니다.
- [TRD.md](./docs/TRD.md): 기술 요구사항 문서(v1.5). 현재 스택의 단일 기준 문서로, 자체 서버(Oracle Cloud VM) + Docker Compose + nginx + PostgreSQL 16 구성을 실측 기반으로 기술합니다.
- [LLD.md](./docs/LLD.md): 상세 설계 문서(v1.3). Next.js 16 + PostgreSQL 16 컨테이너 + 자체 서버 기준이며, 초안이 전제했던 Vercel/Upstash/Blob 스택 미채택을 정정 배너로 명시합니다.
- [DESIGN.md](./docs/DESIGN.md): 프런트엔드 디자인 토큰 명세. 다크 캔버스 기반 색상·타이포 팔레트를 정의한 디자인 시스템 자료입니다.

### 데이터베이스

- [schema.prisma](./prisma/schema.prisma): 데이터베이스 구조의 기계 검증 원본입니다.
- [DB.md](./docs/DB.md): 데이터베이스 설계 문서(v1.5). `prisma/schema.prisma`와 migrations가 원본이고 본 문서는 사람이 읽는 설명 계층임을 명시합니다.

### 운영 · 보안

- [BOOTSTRAP.md](./docs/BOOTSTRAP.md): 깨끗한 DB 로 처음 띄울 때의 기준 데이터 시딩과 최초 관리자 계정 생성 절차. 로컬·Docker 양쪽을 다루고 시드 로그로 진단하는 표를 포함합니다.
- [SECRET_ROTATION.md](./docs/SECRET_ROTATION.md): `NEXTAUTH_SECRET`/`AUTH_SECRET` 등 유출 시크릿의 수동 로테이션 런북. git 이력 재작성과 GitHub Secrets 재등록 절차를 포함합니다.
- [SERVER_RUNBOOK_2026-08-01.md](./docs/SERVER_RUNBOOK_2026-08-01.md): 프로덕션 호스트에서 한 번 실행하는 서버 측 잔여 작업 런북. 각 블록이 멱등하고 단계마다 확인 명령을 제공합니다.
- [backup-and-restore.md](./docs/backup-and-restore.md): 프로덕션 DB(`pg_dump -Fc`)와 첨부파일(`/app/var/uploads` tar) 백업·복구 절차 및 보존기간(기본 14일) 정책입니다.

### 감사

- [PROJECT_AUDIT_2026-07-29.md](./docs/archive/PROJECT_AUDIT_2026-07-29.md): 10개 영역 교차 검증 감사 보고서. 게이트 실행 기반 재평가로 82/100(B), 배포 가능(Go) 판정입니다.
- [specs/2026-06-17-rules-and-harness-design.md](./docs/superpowers/specs/2026-06-17-rules-and-harness-design.md): 프로젝트 헌법과 통합 검증 하네스 스크립트 구축 설계 명세서입니다.

### 사용자 매뉴얼

- [system_manual.md](./docs/system_manual.md): 화면별 기능·UI 구성요소·RBAC·SLA/상태 전이 제약을 정리한 사용자 및 운영 매뉴얼입니다. **이 `.md` 가 정본입니다.** 같은 이름의 [.html](./docs/system_manual.html) / [.pptx](./docs/system_manual.pptx) 는 과거 배포용 산출물이며 내용이 동일하지 않습니다 — 기능·권한의 근거로 사용하지 마십시오.
