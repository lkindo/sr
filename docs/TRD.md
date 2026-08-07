# SR(Service Request) 관리 시스템 TRD

**문서 종류:** TRD (Technical Requirements Document)
**문서 버전:** 1.4
**작성일:** 2025-11-06
**최종 수정일:** 2026-07-30
**작성자:** Development Team
**검수자:** [검수자 정보]

> **⚠️ 이 문서는 2026-07-30 에 실제 구현 기준으로 정정되었다.**
> 1.3 까지의 TRD 는 Vercel + Upstash Redis + Vercel Blob + Resend + Inngest +
> Sentry/Axiom 을 전제로 작성되어 있었다. **그중 어느 것도 채택되지 않았다.**
> 실제 구성은 자체 서버(Oracle Cloud VM) + Docker Compose + nginx + PostgreSQL 16 컨테이너다.
> 미채택 스택의 선택 경위는 설계 의사결정 기록으로서 남겨 두되, 모두 **"초기 설계안 / 미채택"**
> 으로 표기했다. 표기가 없는 서술은 저장소·배포 파일에서 실측한 사실이다.

---

## 📚 문서 간 참조 가이드

| 문서                                      | 역할              | 주요 내용                                       |
| ----------------------------------------- | ----------------- | ----------------------------------------------- |
| **[PRD.md](SR_Management_System_PRD.md)** | 비즈니스 요구사항 | 기능 정의, 사용자 역할, SR 프로세스             |
| **[DB.md](DB.md)**                        | 데이터베이스 설계 | Prisma 스키마, ERD, 테이블 명세                 |
| **[TRD.md](TRD.md)**                      | 기술 명세         | **아키텍처, 기술 스택 선택 이유, 배포 전략** ⭐ |
| **[LLD.md](LLD.md)**                      | 구현 상세         | 코드, 컴포넌트, API 구현, 테스트 코드           |

**권장 읽는 순서**: PRD → DB → TRD → LLD

---

## 문서 개정 이력

| 버전 | 작성자           | 변경 사항                                                                                                                                                                                                                    | 작성일     | 검수자   |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1.0  | Development Team | TRD 초안 작성                                                                                                                                                                                                                | 2025-11-06 | [검수자] |
| 1.1  | Development Team | SR 상태 ENUM 통합, 명명 규칙 정리, Prisma 스키마 업데이트                                                                                                                                                                    | 2025-11-06 | [검수자] |
| 1.2  | Development Team | 문서 간 참조 가이드 추가, 중복 제거 최적화                                                                                                                                                                                   | 2025-11-07 | [검수자] |
| 1.3  | Development Team | TRD 본연의 역할에 집중하도록 구현 코드 제거, LLD 참조 체계 구축                                                                                                                                                              | 2025-11-07 | [검수자] |
| 1.4  | Development Team | 미채택 스택(Vercel Blob / Upstash Redis / Vercel / Resend / Inngest / Sentry / Axiom) 서술을 실측 구현으로 정정. 기술 스택 표·아키텍처 도식·배포·모니터링 절 전면 교체, 선택 이유 표는 "초기 설계안 / 미채택" 으로 표기 유지 | 2026-07-30 | [검수자] |
| 1.5  | Development Team | 초기 설계안의 외부 관리형 데이터베이스 서비스 서술 제거 (미채택 확정, 자체 PostgreSQL 사용)                                                                                                                                  | 2026-08-06 | [검수자] |

---

## 목차

1. [문서 개요](#문서-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [기술 스택 및 선택 이유](#기술-스택-및-선택-이유)
4. [데이터베이스 설계](#데이터베이스-설계)
5. [API 아키텍처 및 설계 원칙](#api-아키텍처-및-설계-원칙)
6. [인증 및 보안 전략](#인증-및-보안-전략)
7. [파일 스토리지 전략](#파일-스토리지-전략)
8. [알림 시스템 전략](#알림-시스템-전략)
9. [백그라운드 작업 전략](#백그라운드-작업-전략)
10. [프론트엔드 아키텍처 전략](#프론트엔드-아키텍처-전략)
11. [성능 최적화 전략](#성능-최적화-전략)
12. [테스팅 전략](#테스팅-전략)
13. [배포 전략](#배포-전략)
14. [모니터링 및 로깅 전략](#모니터링-및-로깅-전략)
15. [성능 요구사항 및 벤치마크](#성능-요구사항-및-벤치마크)

---

## 문서 개요

### 문서 목적

본 문서는 SR 관리 시스템의 **기술적 구현 요구사항**을 정의합니다. 개발팀이 시스템을 구현하는 데 필요한 **아키텍처 결정**, **기술 스택 선택 이유**, **개발 가이드라인**을 제공합니다.

**TRD의 역할**: "무엇을, 왜 선택했는가"에 집중

- 기술 스택 선택 이유 및 대안 비교
- 아키텍처 원칙 및 패턴
- 성능/보안/확장성 요구사항
- 배포 및 모니터링 전략 개요

**구현 상세는 LLD.md 참조**: 구체적인 코드, 컴포넌트 구현, API 엔드포인트, 테스트 코드 등은 [LLD.md](LLD.md) 문서를 참조하십시오.

### 기술 스택 요약

> **정정(2026-07-30)**: 1.3 까지 이 표는 Database=외부 관리형 PostgreSQL 서비스, Storage=Vercel Blob,
> Cache=Upstash Redis, Deployment=Vercel, Email=Resend + React Email, Background Jobs=Inngest,
> Monitoring=Sentry + Axiom, Next.js=14.x 로 기술하고 있었다. **여덟 항목 모두 채택되지 않았다.**
> 아래는 `package.json` · `docker-compose.prod.yml` · `Dockerfile` · `nginx/nginx.conf` ·
> `.github/workflows/` 에서 실측한 값이다. 표에 없는 것은 시스템에 없다.

| 분류                | 기술                                                                           | 버전 (2026-07-30 실측)                          |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **Frontend**        | Next.js (App Router)                                                           | 16.1.6                                          |
|                     | React / React DOM                                                              | 19.2.4                                          |
|                     | TypeScript                                                                     | 5.x                                             |
|                     | Tailwind CSS                                                                   | 3.4                                             |
|                     | Shadcn/ui (Radix UI 프리미티브 기반, 소스 복사 방식)                           | 패키지 버전 없음 (`src/components/ui/`)         |
|                     | Recharts (대시보드 차트)                                                       | 3.7.0                                           |
| **Backend**         | Next.js Server Actions / Route Handlers                                        | 16.1.6                                          |
|                     | Node.js 런타임                                                                 | 22.x (`package.json` engines, `node:22` 이미지) |
|                     | pnpm (패키지 매니저)                                                           | 10                                              |
| **Database**        | PostgreSQL — `postgres:16-alpine` 컨테이너(앱과 같은 호스트)                   | 16                                              |
|                     | Prisma ORM (`prisma` + `@prisma/client`)                                       | 6.19                                            |
|                     | 커넥션 풀러                                                                    | **없음** (PgBouncer·관리형 Pooler 미사용)       |
| **Storage**         | 서버 디스크 — `STORAGE_DIR=/app/var/uploads`, Docker named volume `sr_uploads` | —                                               |
|                     | 오브젝트 스토리지 / CDN                                                        | **없음**                                        |
| **Cache**           | Next.js `unstable_cache` (프로세스 내 메모리, `src/lib/cache.ts`)              | Next.js 내장                                    |
|                     | 외부 캐시 서버 (Redis 등)                                                      | **없음**                                        |
| **Background Jobs** | `backgroundTask` (`src/lib/wait-until.ts`) — 응답 후 fire-and-forget           | 영속 큐 **없음**                                |
|                     | 정기 작업                                                                      | GitHub Actions 스케줄(백업·품질 점검)만         |
| **Authentication**  | NextAuth / Auth.js — JWT 세션 전략 (`src/auth.config.ts`)                      | 5.0.0-beta.32                                   |
|                     | bcryptjs (work factor 12, `src/lib/constants.ts:115`)                          | 3.0                                             |
| **Validation**      | Zod                                                                            | 4.3                                             |
|                     | react-hook-form (+ `@hookform/resolvers`)                                      | 7.71                                            |
| **Server State**    | `@tanstack/react-query`                                                        | 5.90                                            |
| **Email**           | nodemailer (SMTP, `src/services/email.service.ts`)                             | 7.0                                             |
| **Web Push**        | web-push (VAPID, `src/services/push.service.ts`)                               | 3.6                                             |
| **Realtime**        | 자체 SSE 엔드포인트 `GET /api/realtime` + Node `EventEmitter`                  | —                                               |
| **Reverse Proxy**   | nginx — `nginx:alpine` 컨테이너 (TLS 종료, 80→443 리다이렉트)                  | alpine                                          |
| **Deployment**      | 자체 서버(Oracle Cloud VM) + Docker Compose (`/home/opc/sr`)                   | —                                               |
|                     | 이미지 레지스트리 — GHCR `ghcr.io/lkindo/sr` (`:latest` / `:dev`)              | —                                               |
|                     | CI/CD — GitHub Actions (`CI/CD Pipeline` → `workflow_run` 배포)                | —                                               |
|                     | TLS — Let's Encrypt (certbot, 갱신 자동화 없음)                                | —                                               |
| **Logging**         | pino → stdout → Docker `json-file` 드라이버 (3 × 10MB 로테이션)                | 10.3                                            |
|                     | 호스트 밖 로그 전송                                                            | **없음**                                        |
| **Monitoring**      | uptime-kuma 컨테이너 (서버에서 구동 중, 저장소의 compose 파일에는 없음)        | 미확인                                          |
|                     | 에러 추적 서비스                                                               | **없음** — Sentry 미사용 결정(2026-07-30)       |
| **Testing**         | vitest (유닛) / Playwright (e2e) / Stryker (뮤테이션)                          | 4.0 / 1.58 / 9.5.1                              |

---

## 시스템 아키텍처

### 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Browser   │  │   Mobile    │  │   Tablet    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (Let's Encrypt / certbot)
                         ↓
┌─────────────────────────────────────────────────────────┐
│        nginx:alpine  —  컨테이너 `sr-nginx`              │
│  - TLS 종료, 80 → 443 강제 리다이렉트                    │
│  - gzip, client_max_body_size 50m                       │
│  - X-Real-IP / X-Forwarded-* 설정                        │
│    (rate limit 의 신뢰 IP 근거 — src/lib/rate-limiter.ts)│
│  ※ CDN·Edge Middleware·이미지 최적화 계층은 없음         │
└────────────────────────┬────────────────────────────────┘
                         │ proxy_pass http://app:3000
                         │ (Docker bridge network `sr-net`)
                         ↓
┌─────────────────────────────────────────────────────────┐
│   Next.js 16 Application — 컨테이너 `sr-app`             │
│   (output: 'standalone', `node server.js`, 상시 구동)    │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Server Components                      │  │
│  │  - SSR (Server-Side Rendering)                   │  │
│  │  - Data Fetching                                 │  │
│  │  - Initial HTML Generation                       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Client Components                      │  │
│  │  - Interactivity                                 │  │
│  │  - React Query (Server State)                    │  │
│  │  - UI 상태: 지역 useState + Provider 컴포넌트     │  │
│  │    (전역 상태 라이브러리 미사용)                  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Server Actions                         │  │
│  │  - API Logic                                     │  │
│  │  - Data Mutations                                │  │
│  │  - Server-side Business Logic                    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Route Handlers                         │  │
│  │  - REST API Endpoints (/api/*)                   │  │
│  │  - SSE 스트림 (/api/realtime)                    │  │
│  │  ※ 외부 Webhook 수신 엔드포인트는 없음            │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │        NextAuth Middleware (src/proxy.ts)         │  │
│  │  - Authentication (JWT)                          │  │
│  │  - Authorization                                 │  │
│  │  - 인메모리 Rate Limit (프로세스 로컬)            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼────────────────┐
         ↓               ↓                ↓
┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ PostgreSQL 16   │ │ 서버 디스크   │ │  외부 서비스      │
│ 컨테이너 `sr-db`│ │ (첨부파일)    │ │                  │
│ postgres:16-    │ │              │ │ - SMTP           │
│   alpine        │ │ named volume │ │   (nodemailer)   │
│                 │ │ `sr_uploads` │ │ - Web Push       │
│ named volume    │ │ /app/var/    │ │   (VAPID)        │
│ `sr_db_data`    │ │   uploads    │ │                  │
│                 │ │              │ │ 그 외 외부 의존  │
│ 호스트 포트      │ │ 인증 라우트   │ │ 서비스 없음      │
│ 미공개          │ │ 로만 스트리밍 │ │                  │
│ 풀러 없음        │ │ (웹루트 밖)   │ │                  │
└─────────────────┘ └──────────────┘ └──────────────────┘

캐시 / 큐: 외부 컴포넌트 없음. Next.js `unstable_cache`(프로세스 메모리)와
           `backgroundTask`(응답 후 실행)만 존재하며, 프로세스 재시작 시 모두 소실된다.
```

### 레이어드 아키텍처

```
┌─────────────────────────────────────────┐
│      Presentation Layer                 │
│  - React Components                     │
│  - UI Components (Shadcn/ui + Radix)    │
│  - Forms (React Hook Form + Zod)        │
│  - Tables (src/components/ui/table.tsx) │
│    ※ TanStack Table 미사용              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Application Layer                  │
│  - Server Actions                       │
│  - Route Handlers                       │
│  - Business Logic                       │
│  - Validation (Zod)                     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Service Layer                      │
│  - SR Service                           │
│  - User Service                         │
│  - Client Service                       │
│  - Notification Service                 │
│  - Permission Service                   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Data Access Layer                  │
│  - Prisma Client                        │
│  - Repository Pattern                   │
│  - Query Optimization                   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│      Infrastructure Layer               │
│  - PostgreSQL 16 컨테이너 (sr-db)       │
│  - 서버 디스크 볼륨 (sr_uploads)        │
│  - nginx 리버스 프록시 (sr-nginx)       │
│  ※ 외부 캐시/큐/오브젝트 스토리지 없음  │
└─────────────────────────────────────────┘
```

### 아키텍처 원칙

1. **Server-First Architecture**
   - React Server Components를 우선적으로 사용
   - 클라이언트 사이드 JavaScript 최소화
   - 초기 로딩 성능 최적화

2. **Progressive Enhancement**
   - 기본 기능은 JavaScript 없이 동작 (Server Actions)
   - 클라이언트 컴포넌트는 상호작용이 필요한 부분만

3. **Layered Architecture**
   - 각 레이어는 명확한 책임 분리
   - 하위 레이어만 의존 (상위 레이어 의존 금지)

4. **API-First Design**
   - 내부 API와 외부 API 분리
   - Server Actions는 내부 API로 사용
   - Route Handlers는 클라이언트 컴포넌트가 호출하는 REST API 및 SSE 스트림용
     (외부 Webhook 수신 엔드포인트는 현재 없다 — `src/app/api/` 에 `webhooks/` 없음)

5. **Security by Default**
   - 모든 API는 기본적으로 인증 필요
   - 권한 기반 접근 제어 (RBAC)
   - Input Validation (Zod)

---

## 기술 스택 및 선택 이유

### 1. Next.js (App Router)

**버전**: **16.1.6** (`package.json`), React 19.2.4, Node 22.x

> **정정**: 1.3 까지 이 절은 "14.x (최신 stable)" 로 기술되어 있었다. 실제 의존성은 16.1.6 이다.

**선택 이유**:

- **React Server Components**: 초기 로딩 성능 최적화 (JavaScript 번들 크기 감소)
- **Server Actions**: API 라우트 없이 데이터 뮤테이션 가능, 타입 안정성 향상
- **Streaming & Suspense**: 점진적 UI 렌더링으로 TTFB(Time To First Byte) 개선
- **`output: 'standalone'`**: 빌드 산출물을 단일 `server.js` 로 묶어 Docker 이미지가 작아지고,
  자체 서버에서 `node server.js` 로 상시 구동된다 (`next.config.ts:48`, `Dockerfile` Stage 3)
- **TypeScript Native**: 타입 안정성 및 개발자 경험(DX) 향상

**대안 기술 비교**:

| 기술                     | 장점                                              | 단점                                | 선택 여부             |
| ------------------------ | ------------------------------------------------- | ----------------------------------- | --------------------- |
| **Next.js (App Router)** | RSC, Server Actions, standalone 출력 → 컨테이너화 | Learning Curve                      | ✅ 선택 (현재 16.1.6) |
| Next.js Pages Router     | 안정적, 익숙함                                    | RSC 미지원, 구식 패턴               | ❌                    |
| Remix                    | Server-first, Form Actions                        | 생태계 작음                         | ❌                    |
| SvelteKit                | 빠른 성능, 작은 번들                              | React 생태계 활용 불가              | ❌                    |
| Vite + React             | 빠른 HMR                                          | SSR 설정 복잡, 프레임워크 기능 부족 | ❌                    |

> **초기 설계안 이력**: 원래 이 표는 Next.js 의 장점으로 "Vercel 통합" 을, Remix 의 단점으로
> "Vercel 통합 부족" 을 들고 있었다. **Vercel 은 채택되지 않았으므로** 그 항목은 현재 결정의
> 근거가 아니며 위 표에서 제외했다. 자동 이미지 최적화 역시 CDN 이 없는 자체 서버 구성에서는
> 초기 설계안이 전제한 형태로 동작하지 않는다.

**주요 기능 활용**:

- **Server Components**: 데이터 페칭 및 초기 렌더링
- **Client Components**: 상호작용 (form, modal, SSE 기반 실시간 갱신)
- **Server Actions**: 폼 제출, 데이터 뮤테이션 (`bodySizeLimit: '2mb'`, `next.config.ts:43`)
- **Route Handlers**: REST API (`/api/*`), SSE (`/api/realtime`), 헬스체크 (`/api/health`)
- **Middleware**: 인증·권한·인메모리 Rate Limit (`src/proxy.ts`)

> **구현 상세**: 구체적인 코드 예제, 설정 파일은 [LLD.md](LLD.md) 참조

---

### 2. TypeScript

**버전**: 5.x

**선택 이유**:

- **타입 안정성**: 컴파일 타임 에러 감지
- **자동완성 및 리팩토링**: IDE 지원 향상
- **API 계약 명확화**: 프론트엔드-백엔드 인터페이스 명확
- **대규모 프로젝트 유지보수성**: 코드베이스 확장 시 안정성

**TypeScript 설정 원칙**:

- **strict mode**: 모든 strict 옵션 활성화
- **path alias**: `@/*` → `./src/*` (절대 경로 import)
- **incremental compilation**: 빌드 성능 최적화
- **skipLibCheck**: 외부 라이브러리 타입 체크 스킵 (빌드 속도 향상)

**타입 정의 전략**:

- Prisma 스키마에서 자동 생성된 타입 활용
- API 응답/요청은 Zod 스키마로 정의 후 TypeScript 타입 추론
- 공통 타입은 `src/types/` 아래 도메인별 파일로 관리
  (`session.ts`, `sr.types.ts`, `user.ts`, `settings.ts`, `next-auth.d.ts`)
  — 배럴 파일 `src/types/index.ts` 는 존재하지 않는다

> **구현 상세**: tsconfig.json, 타입 정의 예제는 [LLD.md](LLD.md) 참조

---

### 3. Prisma ORM

**버전**: **6.19** (`prisma` + `@prisma/client`. 런타임 컨테이너에도 마이그레이션용
`prisma@6.19.0` 이 전역 설치되어 있다 — `Dockerfile:59`)

**선택 이유**:

- **타입 안전성**: TypeScript와 완벽한 통합
- **스키마 우선**: 단일 스키마 파일로 DB 구조 관리
- **마이그레이션**: 자동 마이그레이션 생성 및 버전 관리
- **쿼리 최적화**: N+1 문제 해결 (include, select)
- **Prisma Studio**: GUI 기반 데이터 관리 도구

**대안 기술 비교**:

| 기술                    | 장점                             | 단점                                  | 선택 여부 |
| ----------------------- | -------------------------------- | ------------------------------------- | --------- |
| **Prisma**              | 타입 안전, 마이그레이션, DX 우수 | 복잡한 쿼리 제약                      | ✅ 선택   |
| Drizzle ORM             | 빠른 성능, SQL-like              | 생태계 작음, 미성숙                   | ❌        |
| TypeORM                 | 다양한 DB 지원                   | 타입 안정성 부족, 복잡함              | ❌        |
| Sequelize               | 성숙한 생태계                    | TypeScript 지원 약함                  | ❌        |
| Raw SQL (node-postgres) | 최고 성능, 유연성                | 타입 안정성 없음, 보일러플레이트 많음 | ❌        |

**Prisma 설정 원칙**:

- **Connection Pooling**: **없다.** PgBouncer 등 외부 풀러를 두지 않고 Prisma Client 의 내장 풀이
  같은 호스트의 PostgreSQL 컨테이너에 직접 접속한다. 앱이 상시 구동 Node 프로세스(컨테이너 1개)
  이므로 서버리스형 커넥션 폭증 문제가 발생하지 않는다.
- **두 개의 연결 문자열**: `schema.prisma` 는 `url = env("DATABASE_URL")` 과
  `directUrl = env("DIRECT_URL")` 을 모두 선언하고 `src/lib/env-validation.ts` 가 둘 다 필수로
  검증한다. 다만 풀러가 없으므로 **두 값은 같은 인스턴스를 가리킨다**
  (CI 는 두 변수에 동일한 문자열을 넣는다 — `.github/workflows/ci-cd.yml:95-96`).
  운영 값은 서버의 `.env.docker` 에만 있어 저장소에서 확인할 수 없다.
- **로깅**: 개발 환경에서만 쿼리 로그 활성화 (`src/lib/prisma.ts:14`),
  개발 환경 느린 쿼리 경고 임계값 `PRISMA_SLOW_MS`(기본 200ms)
- **Singleton 패턴**: HMR로 인한 다중 인스턴스 방지 (`globalThis.prismaGlobal`)
- **`$transaction` 래핑**: 트랜잭션 컨텍스트에 도메인/실시간 이벤트를 모아 **커밋 이후에**
  디스패치한다 (`src/lib/prisma.ts:33-58`)

**마이그레이션 전략**:

- **개발 환경**: `prisma migrate dev` (자동 마이그레이션 생성)
- **Production**: 컨테이너 시작 시 `docker-entrypoint.sh` 가 `prisma migrate deploy` 를 실행한다
  (실패 시 `0_init` 베이스라인 후 재시도). 배포 워크플로가 별도로 실행하지 않는다.
- **CI 검증**: 모든 push/PR 에서 빈 PostgreSQL 16 컨테이너에 `migrate deploy` → `migrate diff`
  드리프트 검사 → `db:seed` 까지 실제로 수행한다 (`.github/workflows/ci-cd.yml:122-147`)
- **Seed 데이터**: 초기 권한·역할 생성. 개발/테스트 픽스처는 `SEED_DEV_FIXTURES=true` 일 때만
  생성되며, 배포 파이프라인은 시딩을 수행하지 않는다(운영 계정 초기화 사고 방지).

> **구현 상세**: Prisma Client 설정, 마이그레이션 스크립트, Seed 파일은 [LLD.md](LLD.md) 참조

---

### 4. PostgreSQL 16 (자체 호스트 컨테이너)

**버전**: **PostgreSQL 16** — `postgres:16-alpine` 이미지, 컨테이너 `sr-db`,
앱과 **같은 호스트**에서 Docker bridge 네트워크(`sr-net`)로만 접근한다.

> **정정(2026-07-30)**: 1.3 까지 이 절은 초기 설계안의 외부 관리형 데이터베이스 서비스
> ("PostgreSQL 15, 관리형") 를 **"✅ 선택"** 으로 표기하고 있었다. **그 외부 관리형 스택은
> 채택되지 않았다.** 관리형 서비스가 아니며, 그 스택이 함께 제공하던
> Storage / Auth / Realtime / Pooler / RLS 중 어느 것도 사용하지 않는다.
> 아래 내용은 `docker-compose.prod.yml:49-81` 실측 기준이다.

**실제 구성**:

- **이미지/버전**: `postgres:16-alpine`
- **영속화**: named volume `sr_db_data` → `/var/lib/postgresql/data`
  (배포 시 `down`/`up --force-recreate` 를 하더라도 데이터는 보존된다)
- **네트워크**: 호스트 포트를 **공개하지 않는다.** 관리 접근은 SSH 터널 또는 `docker exec`.
- **자격증명**: compose 가 배포 호스트의 env 파일에서 보간하며 값이 비면 `:?` 문법으로 즉시
  실패한다. 저장소에는 자격증명이 없다 (`docs/SECRET_ROTATION.md`).
- **헬스체크**: `pg_isready` (interval 10s / retries 5). 앱 컨테이너는
  `depends_on: condition: service_healthy` 로 기동 순서를 보장받는다.
- **백업**: GitHub Actions `backup.yml` 이 매일 KST 03:00 에 서버에서 `scripts/backup.sh`
  (pg_dump + uploads)를 실행하고 보존기간(기본 14일)을 관리한다. **오프호스트 복제는 아직 없다.**

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                                   | 장점                                               | 단점                                         | 선택 여부               |
| -------------------------------------- | -------------------------------------------------- | -------------------------------------------- | ----------------------- |
| **자체 호스트 PostgreSQL 16 컨테이너** | 비용 없음, 앱과 동일 호스트라 지연 최소, 전면 통제 | 백업·패치·확장을 직접 책임, 단일 호스트 SPOF | ✅ 선택 (실제 채택)     |
| Neon PostgreSQL                        | Serverless, Auto-scaling                           | Storage 별도, 초기 지원                      | ❌ 초기 설계안 / 미채택 |
| PlanetScale (MySQL)                    | Auto-scaling, Branching                            | PostgreSQL 아님, 복잡한 기능 제약            | ❌                      |
| AWS RDS                                | 안정적, 다양한 옵션                                | 설정 복잡, 비용 높음                         | ❌                      |
| Railway PostgreSQL                     | 간단, 저렴                                         | Connection Pool 수동 설정                    | ❌                      |

**Connection Pooling 전략**:

- **외부 풀러 없음.** PgBouncer / Prisma Data Proxy 를 사용하지 않는다.
- Prisma Client 내장 풀이 `DATABASE_URL` 로 직접 접속한다. 앱은 상시 구동 프로세스 1개이므로
  서버리스처럼 `connection_limit=1` 로 제한할 이유가 없다.
- `DIRECT_URL` 은 `schema.prisma` 가 요구해 유지하지만, 풀러가 없으므로 `DATABASE_URL` 과 같은
  인스턴스를 가리킨다.

**보안 설정**:

- **Row Level Security (RLS)**: 사용 안 함 (애플리케이션 레벨에서 권한 관리 —
  `src/lib/policies.ts`, `src/lib/permission-helpers.ts`)
- **네트워크 격리**: DB 포트를 호스트에 바인딩하지 않아 외부에서 직접 접속할 수 없다.
  앱↔DB 트래픽은 Docker 내부 브리지에 머문다(호스트를 벗어나지 않는다).
- **TLS 강제 여부**: 컨테이너 간 내부 통신이며 `sslmode` 를 강제하는 설정은 저장소에 없다.
  운영 접속 문자열은 서버 `.env.docker` 에만 있어 **미확인**.

> **구현 상세**: 환경 변수 설정과 시크릿 배치 절차는 [docs/SECRET_ROTATION.md](SECRET_ROTATION.md),
> Prisma Client 설정은 [LLD.md](LLD.md) 참조

---

### 5. 서버 디스크 저장 (Docker named volume)

**구현**: `src/lib/storage.ts` — Node `fs` 로 직접 읽고 쓴다.

> **정정(2026-07-30)**: 1.3 까지 이 절은 Vercel Blob 을 **"✅ 선택"** 으로 표기하고
> `put` / `head` / `del` API 와 자동 공개 URL, 전역 CDN 을 전제로 서술하고 있었다.
> **Vercel Blob 은 채택되지 않았다.** 오브젝트 스토리지도 CDN 도 없다.
> `src/lib/storage.ts` 의 `listAttachmentBlobs` 등 함수명에 남은 "Blob" 은 초기 구현의
> 잔재이며(현재는 빈 배열을 돌려주는 스텁), 실제 저장 매체는 서버 디스크다.

**실제 구성**:

- **저장 위치**: `STORAGE_DIR` (컨테이너 기준 `/app/var/uploads`).
  Docker named volume `sr_uploads` 가 이 경로에 마운트되어 재배포 시에도 파일이 남는다.
- **웹루트 밖 저장**: `public/` 밖에 두어 정적 서빙으로 인한 무인증 접근을 차단한다.
- **경로 구조**: `attachments/{srId}/{timestamp}-{sanitizedName}` (DB 에는 이 상대 경로를 저장)
- **파일명 정화**: `path.basename` → 공백 치환 → `[^a-zA-Z0-9._-]` 제거,
  최종 경로가 `STORAGE_DIR` 내부인지 containment 검사 (경로 탐색 차단)
- **접근 권한**: **공개 URL 없음.** 다운로드는 인증·인가를 거치는
  `GET /api/attachments/[id]/download` 로만 제공된다.
- **레거시 폴백**: 과거 `public/uploads` 에 올라간 파일은 다운로드 조회 시에만 폴백 탐색한다.
- **크기 상한**: MIME 타입별로 다르다 (`src/lib/file-validator.ts`) — 이미지 5~10MB,
  오피스 문서 20MB, 프레젠테이션 50MB, 압축 파일 50MB. nginx `client_max_body_size` 는 50m,
  Server Action 본문 상한은 2MB(`next.config.ts:43`)이므로 대용량은 Route Handler 경유가 필요하다.

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                            | 장점                                               | 단점                                                             | 선택 여부                   |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| **서버 디스크 + Docker volume** | 비용 없음, 인증 라우트로 완전 통제, 외부 의존 없음 | 호스트 디스크 용량·장애에 종속, CDN 없음, 수평 확장 시 공유 불가 | ✅ 선택 (실제 채택)         |
| Vercel Blob                     | 간단, CDN, 자동 공개 URL                           | 비용, Vercel 종속                                                | ❌ 초기 설계안 / **미채택** |
| AWS S3                          | 강력, 다양한 기능                                  | 설정 복잡, 비용 관리                                             | ❌                          |
| Cloudinary                      | 이미지 변환 강력                                   | 비용 높음, 오버킬                                                | ❌                          |

> **구현 상세**: 파일 업로드/다운로드 코드는 `src/lib/storage.ts`,
> 검증 로직은 `src/lib/file-validator.ts`, 설계 설명은 [LLD.md](LLD.md) 참조

---

### 6. 캐싱 전략

**현재 구현**: Next.js `unstable_cache` (프로세스 내 메모리). **Redis 는 존재하지 않는다.**

> **초기 설계안 이력**: 초기 설계는 Upstash Redis 를 캐시·세션·분산 Rate Limit 백엔드로
> 계획했으나 **채택되지 않았다.** 현재 시스템에 Redis 프로세스나 클라이언트 의존성은 없다.

**현재 캐싱 구현**:

- **캐시 백엔드**: Next.js `unstable_cache` (`src/lib/cache.ts`) — 사용자 목록·고객사 목록
- **TTL**: 5분 (`revalidate: 300`)
- **무효화**: `revalidatePath()`, `revalidateTag()`
- **Rate Limiting**: `MemoryRateLimiter` (`src/lib/rate-limiter.ts`) — 프로세스 내 `Map` 기반
  토큰 버킷. 환경 변수(`RATE_LIMIT_*_WINDOW_MS`, `RATE_LIMIT_*_MAX_REQUESTS`)로 조정하고,
  랜덤 샘플링 축출 + 10,000개 상한 FIFO 방출로 메모리 누수를 막는다.
- **한계(명시)**: 캐시·Rate Limit 상태는 **프로세스 로컬**이다. 컨테이너 재시작 시 초기화되며,
  앱 컨테이너를 2개 이상으로 늘리면 카운터가 인스턴스마다 따로 집계된다.
  현재 운영은 앱 컨테이너 1개이므로 실동작에는 문제가 없다.

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술              | 장점                       | 단점                             | 선택 여부                   |
| ----------------- | -------------------------- | -------------------------------- | --------------------------- |
| **Next.js Cache** | 내장, 설정 간편, 무료      | 분산 환경 미지원, 재시작 시 소실 | ✅ 선택 (실제 채택)         |
| Upstash Redis     | Serverless, REST API, 저렴 | 추가 의존성, 비용, 외부 의존     | ❌ 초기 설계안 / **미채택** |
| Redis Cloud       | 강력, 다양한 기능          | 비용 높음, 설정 복잡             | ❌                          |
| Vercel KV         | Vercel 통합                | Upstash 기반, 중복               | ❌                          |

**향후 캐시 서버 도입 조건** (도입 시에도 자체 호스팅 컨테이너가 기본 방향이다):

- 앱 컨테이너를 2개 이상으로 늘려 분산 배포할 때
- 분산 Rate Limiting 이 필요할 때
- 프로세스 간 Pub/Sub 이 필요할 때 (현재 SSE 는 단일 프로세스 `EventEmitter` 기반이므로
  다중 인스턴스가 되면 이벤트가 같은 인스턴스에 붙은 클라이언트에만 전달된다)

> **구현 상세**: 캐시 유틸리티 코드는 `src/lib/cache.ts`, [LLD.md](LLD.md) 참조

---

### 7. NextAuth.js v5 (Auth.js)

**버전**: **5.0.0-beta.32** (`next-auth`. 정식 릴리스 전 beta 버전을 사용 중임을 명시한다)

**선택 이유**:

- **Next.js 통합**: App Router 네이티브 지원
- **다양한 Provider**: Credentials, OAuth (Google, GitHub 등)
- **세션 관리**: JWT 또는 Database Session
- **타입 안전**: TypeScript 지원
- **미들웨어 통합**: 페이지 보호, 리다이렉트

**인증 전략**:

- **Credentials Provider**: 이메일/비밀번호 (bcryptjs)
- **JWT 세션**: `session.strategy: 'jwt'` (`src/auth.config.ts:6`). 서버 측 세션 레코드가 없다.
- **세션 저장소**: 없음. Redis 블랙리스트도 구현되어 있지 않다
  (초기 설계안이 "선택적" 으로 적어 둔 Redis 세션 저장소는 채택되지 않았다).

**대안 기술 비교**:

| 기술               | 장점                          | 단점                   | 선택 여부 |
| ------------------ | ----------------------------- | ---------------------- | --------- |
| **NextAuth.js v5** | Next.js 통합, 다양한 Provider | 복잡한 설정 (v5)       | ✅ 선택   |
| Clerk              | 간단, UI 제공                 | 비용 높음, Lock-in     | ❌        |
| Auth0              | 엔터프라이즈급, 강력          | 비용 매우 높음         | ❌        |
| Custom Auth        | 완전한 제어                   | 보안 리스크, 개발 시간 | ❌        |

**보안 설정**:

- **Password Hashing**: bcryptjs, **work factor 12** (`SECURITY.BCRYPT_WORK_FACTOR`,
  `src/lib/constants.ts:115`) — 1.3 의 "saltRounds: 10" 은 실제 값과 달랐다.
- **JWT Secret**: `NEXTAUTH_SECRET` / `AUTH_SECRET`. `src/lib/env-validation.ts` 가 32자 이상,
  플레이스홀더 패턴 아님을 검증하고 위반 시 `src/instrumentation.ts` 가 부팅을 중단시킨다.
- **Session Token**: Auth.js 기본 쿠키 정책(HttpOnly, HTTPS 에서 Secure, SameSite=Lax)
- **세션 만료**: `session.maxAge` 를 **명시적으로 설정하지 않았다** → Auth.js 기본값이 적용된다.
  1.3 의 "만료 시간: 7일" 은 코드에 근거가 없다. 유휴 만료는 별도로
  `IdleTimeoutProvider`(클라이언트)가 담당한다.
- **CSRF Protection**: NextAuth 기본 제공
- **프록시 신뢰**: nginx 뒤에서 동작하므로 `AUTH_TRUST_HOST` / 앱 URL 설정이 필요하다
  (`src/lib/app-url.ts`)

> **구현 상세**: NextAuth 설정, Callback 코드는 [LLD.md](LLD.md),
> 시크릿 로테이션 절차는 [docs/SECRET_ROTATION.md](SECRET_ROTATION.md) 참조

---

### 8. nodemailer (SMTP) + web-push (VAPID)

**버전**: nodemailer **7.0**, web-push **3.6**

> **정정(2026-07-30)**: 1.3 까지 이 절은 Resend + React Email 을 **"✅ 선택"** 으로 표기하고
> 발송 실패 재시도를 Inngest 에 위임한다고 서술했다. **Resend·React Email·Inngest 모두
> 채택되지 않았다.** 실제 이메일 발송은 `nodemailer` 로 외부 SMTP 서버에 직접 붙는다.

**이메일 (`src/services/email.service.ts`)**:

- **전송 방식**: `nodemailer.createTransport({ pool: true, ... })` — SMTP 커넥션 풀
- **설정 값**: `EMAIL_SERVER_HOST` / `EMAIL_SERVER_PORT`(기본 587) / `EMAIL_SERVER_USER` /
  `EMAIL_SERVER_PASSWORD` / `EMAIL_FROM`
- **TLS 검증**: 프로덕션에서 `rejectUnauthorized: true` (MITM 자격증명 탈취 방지),
  로컬 개발에서만 완화
- **타임아웃**: connection 10s / greeting 10s / socket 15s
- **자격증명 미설정 시**: 경고 로그만 남기고 발송을 건너뛴다(예외를 던지지 않는다)
- **템플릿**: 서비스 내부의 HTML 문자열 메서드(`sendSRCreated`, `sendSRStatusChanged`,
  `sendSRAssigned` 등). JSX 기반 React Email 은 사용하지 않는다.
- **발송 실패 처리**: 로그 기록뿐이다. **재시도·outbox·Dead Letter Queue 는 구현되어 있지 않다.**

**웹 푸시 (`src/services/push.service.ts`)**:

- `web-push` + VAPID 키쌍(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`)
- 구독 정보는 `push_subscriptions` 테이블, 사용자별 On/Off 는 `notification_preferences`
- 만료 응답(410/404) 시 구독을 자동 정리

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                   | 장점                                                  | 단점                                          | 선택 여부                   |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------- | --------------------------- |
| **nodemailer + SMTP**  | 외부 SaaS 의존 없음, 기존 SMTP 자산 재사용, 비용 없음 | 전달률·바운스 관리를 직접 책임, 재시도 미구현 | ✅ 선택 (실제 채택)         |
| Resend (+ React Email) | 간단, JSX 템플릿                                      | 외부 의존, 비용                               | ❌ 초기 설계안 / **미채택** |
| SendGrid               | 강력, 다양한 기능                                     | 복잡한 API, 비용 높음                         | ❌                          |
| AWS SES                | 저렴, 확장 가능                                       | 설정 복잡, 전달률 관리 필요                   | ❌                          |
| Postmark               | 높은 전달률                                           | 비용 높음                                     | ❌                          |

> **구현 상세**: 발송 코드는 `src/services/email.service.ts` / `src/services/push.service.ts`,
> 트리거 배선은 `src/services/listeners/sr-notification.listener.ts` 참조

---

### 9. 백그라운드 작업 — `backgroundTask` (프로세스 내 실행)

**구현**: `src/lib/wait-until.ts`

> **정정(2026-07-30)**: 1.3 까지 이 절은 Inngest 를 **"✅ 선택"** 으로 표기하고 일일 리포트,
> 만료 알림, 파일 정리 Cron, 이메일 재시도, Dead Letter Queue 를 규정했다.
> **Inngest 는 채택되지 않았고, 열거된 다섯 작업 중 어느 것도 구현되어 있지 않다.**
> 영속 큐·스케줄러·재시도 기반이 시스템에 존재하지 않는다.

**실제 동작**:

- `backgroundTask(promise, label)` 이 프로미스를 받아 성공/실패를 로깅하고, 응답 반환 이후에
  같은 Node 프로세스에서 계속 실행되도록 한다.
- `@vercel/functions` 의 `waitUntil` 을 시도하지만, 상시 구동 Node 서버에서는 호출이 실패하고
  일반 fire-and-forget 으로 완료된다(의도된 폴백).
- **한계(반드시 인지할 것)**: 큐가 아니다. 컨테이너가 종료·재시작되면 진행 중인 작업은 **유실**되고
  재시도되지 않는다. 알림 발송이 이 경로를 쓴다.

**현재 존재하는 정기 작업**: 앱 내부에는 없다. GitHub Actions 스케줄만 있다.

| 작업                    | 위치                                     | 주기                           |
| ----------------------- | ---------------------------------------- | ------------------------------ |
| DB + uploads 백업       | `.github/workflows/backup.yml`           | 매일 UTC 18:00(KST 03:00)      |
| 의존성·복잡도·성능 점검 | `.github/workflows/scheduled-checks.yml` | 매일 UTC 00:00                 |
| 대시보드 캐시 워밍      | `.github/workflows/prewarm.yml`          | 수동 실행(`workflow_dispatch`) |

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                               | 장점                           | 단점                                             | 선택 여부                   |
| ---------------------------------- | ------------------------------ | ------------------------------------------------ | --------------------------- |
| **`backgroundTask` (프로세스 내)** | 의존성 0, 즉시 실행, 비용 없음 | 영속성·재시도·스케줄링 전부 없음, 재시작 시 유실 | ✅ 선택 (실제 채택)         |
| Inngest                            | Type-safe, 재시도, Cron        | 외부 의존, 비용                                  | ❌ 초기 설계안 / **미채택** |
| Vercel Cron                        | Vercel 통합                    | Vercel 미사용이므로 해당 없음                    | ❌ 초기 설계안 / 미채택     |
| BullMQ                             | 강력, 성숙, 자체 호스팅 가능   | Redis 필요                                       | ❌ 향후 후보                |
| Trigger.dev                        | 강력, 다양한 통합              | 비용 높음                                        | ❌                          |

> **향후 방향**: 영속 큐가 필요해지면(알림 재시도, 만료 알림 스케줄) 자체 호스팅 가능한
> 방향 — DB 기반 outbox 테이블 + 폴링, 또는 Redis 컨테이너 + BullMQ — 을 검토한다.
> 외부 SaaS 큐는 현재 인프라 방침(호스트 밖으로 데이터를 보내지 않음)과 맞지 않는다.

---

### 10. 자체 서버 + Docker Compose + nginx

**구성**: Oracle Cloud VM (`/home/opc/sr`) 에서 Docker Compose 로 3개 컨테이너를 운영한다 —
`sr-nginx`(리버스 프록시) / `sr-app`(Next.js standalone) / `sr-db`(PostgreSQL 16).

> **정정(2026-07-30)**: 1.3 까지 이 절은 Vercel 을 **"✅ 선택"** 으로 표기하고 Edge Network,
> Zero-Config, PR별 Preview Deployment, Vercel Dashboard 환경 변수 관리를 규정했다.
> **Vercel 은 채택되지 않았다.** Serverless/Edge 실행 모델도, 전역 CDN 도, PR 단위 Preview
> 환경도 없다. 아래는 `.github/workflows/deploy.yml`, `docker-compose.prod.yml`,
> `nginx/nginx.conf` 실측 기준이다.

**실제 배포 구성**:

- **이미지 빌드/배포**: GitHub Actions 가 이미지를 빌드해 GHCR(`ghcr.io/lkindo/sr`)에 push 하고,
  SSH 로 서버에서 `docker compose pull` → `down` → `up -d --force-recreate` 를 실행한다.
- **태그 규약**: `main` → `:latest` (운영, `docker-compose.prod.yml`),
  `dev` → `:dev` (스테이징, `docker-compose.test.yml`, compose 프로젝트 `sr-test`)
- **환경 변수**: 저장소에 없다. 배포 시 GitHub Secrets(base64)에서 서버의 `.env.docker` 와
  compose 보간용 `.env.prod` / `.env.staging` 으로 기록되며 `chmod 600` 이 적용된다.
  시크릿이 비어 있으면 **컨테이너를 건드리지 않고** 중단한다.
- **TLS**: 최초 기동 시 자체 서명 인증서를 생성하고, 이후 `scripts/setup-letsencrypt.sh` 로
  Let's Encrypt 인증서를 발급한다. **갱신 자동화는 아직 없다.**
- **도메인**: 운영 `lkindo.kr` / `www.lkindo.kr` / `sr.lkindo.kr`, 스테이징 `test.lkindo.kr`
  (`nginx/nginx.conf` 의 `server_name`)
- **메모리 제약**: 앱 컨테이너는 `NODE_OPTIONS=--max-old-space-size=450` 으로 구동된다
  (VM 사양에 맞춘 제약).

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                                   | 장점                                                         | 단점                                                      | 선택 여부                   |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------- |
| **자체 서버 + Docker Compose + nginx** | 비용 통제, 데이터가 호스트를 벗어나지 않음, 런타임 제약 없음 | 단일 호스트 SPOF, 무중단 배포 아님, OS·TLS·백업 직접 운영 | ✅ 선택 (실제 채택)         |
| Vercel                                 | Next.js 최적화, 간단, 자동 SSL, Preview 배포                 | 비용, 함수 실행시간 제약, 외부 종속                       | ❌ 초기 설계안 / **미채택** |
| Netlify                                | 간단, 다양한 프레임워크                                      | Next.js 통합 약함                                         | ❌                          |
| AWS (Amplify, ECS)                     | 완전한 제어, 저렴 (대규모)                                   | 설정 복잡, 관리 부담                                      | ❌                          |
| Railway                                | 간단, 저렴                                                   | Next.js 최적화 부족                                       | ❌                          |
| Cloudflare Pages                       | 빠름, 저렴                                                   | Next.js 제약 (일부 기능)                                  | ❌                          |

> **구현 상세**: 배포 절차는 `.github/workflows/deploy.yml`,
> 시크릿 배치는 [docs/SECRET_ROTATION.md](SECRET_ROTATION.md) 참조

---

### 11. 관측성 — pino stdout + uptime-kuma

**구성**: pino **10.3** → stdout → Docker `json-file` 드라이버 (3 × 10MB 로테이션).
서버에서 `uptime-kuma` 컨테이너가 구동 중이다.

> **정정(2026-07-30)**: 1.3 까지 이 절은 Sentry(에러)와 Axiom(로그)을 각각 **"✅ 선택"** 으로
> 표기하고 자동 소스맵·Slack 알림·로그 쿼리 대시보드를 규정했다.
> **Sentry 도 Axiom 도 채택되지 않았다.** 나아가 **Sentry 는 소유자가 2026-07-30 에 사용하지
> 않기로 결정했다** — 향후 도입 후보에서도 제외된다. Axiom 역시 미채택이며,
> 도입 검토 시 자체 호스팅 가능한 방향을 우선한다.

**실제 상태**:

- **로그**: `src/lib/logger.ts` 가 프로덕션에서 pino 로 JSON 을 stdout 에 쓴다.
  Docker `json-file` 드라이버가 컨테이너별로 3 × 10MB 로 로테이션한다.
  **호스트 밖으로 전송되지 않는다** — 중앙 집계·검색·보존 정책이 없다.
  프로덕션 로그 레벨은 `error` / `warn` 만 출력된다(`shouldLog`).
- **가용성 감시**: 서버에서 `uptime-kuma` 컨테이너가 4주 이상 구동 중임을 SSH 로 확인했다.
  단, 이 컨테이너는 **저장소의 어떤 compose 파일에도 정의되어 있지 않다** — 서버에서 수동
  관리되며 정적 분석으로는 보이지 않는다. 어떤 대상을 감시하고 어떤 알림 채널을 쓰는지는
  저장소 기준으로 **미확인**이다.
- **에러 추적**: 없다. 예외는 로그로만 남는다.
- **APM / 트레이싱 / 메트릭**: 없다 (OpenTelemetry, Prometheus 모두 미도입).
- **헬스체크 엔드포인트**: `GET /api/health` 가 `SELECT 1` 로 DB 연결을 확인하고 실패 시 503 을
  반환한다. Dockerfile `HEALTHCHECK` 와 compose 의 `app` 서비스 `healthcheck:` 는 없다
  (DB 서비스에는 `pg_isready` 헬스체크가 있다).

**대안 기술 비교** (초기 설계안의 의사결정 기록 — 실제 채택 결과를 반영해 정정):

| 기술                          | 장점                                                 | 단점                              | 선택 여부                                       |
| ----------------------------- | ---------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| **pino → stdout → json-file** | 의존성 0, 비용 없음, 데이터가 호스트를 벗어나지 않음 | 중앙 집계·검색·장기 보존 없음     | ✅ 선택 (실제 채택 — 로그)                      |
| **uptime-kuma** (자체 호스팅) | 무료, 자체 호스팅, 알림 채널 다양                    | 저장소 밖에서 수동 관리(IaC 부재) | ✅ 선택 (실제 구동 중 — 가용성)                 |
| Sentry                        | 강력한 에러 추적                                     | 외부 전송, 비용                   | ❌ **소유자 결정(2026-07-30): 사용하지 않는다** |
| Axiom                         | 로그 집계, 저렴                                      | 외부 전송, 에러 추적 약함         | ❌ 초기 설계안 / **미채택**                     |
| Datadog                       | 통합 솔루션, 강력                                    | 비용 매우 높음                    | ❌                                              |
| LogRocket                     | Session Replay 강력                                  | 비용 높음                         | ❌                                              |
| Vercel Analytics              | Vercel 통합                                          | Vercel 미사용이므로 해당 없음     | ❌ 초기 설계안 / 미채택                         |

> **남아 있는 공백**: 에러 추적 부재는 여전히 유효한 문제다. 다만 해법은 자체 호스팅 방향이어야
> 한다(소유자 결정). 실무적으로 우선순위가 높은 것은 (a) `/api/health` 를 이미 구동 중인
> uptime-kuma 감시 대상에 등록, (b) uptime-kuma 정의를 저장소 compose 로 끌어와 IaC 화,
> (c) pino 의 SIGTERM 플러시 핸들러 추가(현재 `sync: false` 라 종료 시 버퍼가 유실될 수 있다).
> 자세한 근거는 [docs/archive/PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md) 3.30 참조.

---

### 12. Shadcn/ui + Tailwind CSS

**버전**: Latest

**선택 이유**:

- **Shadcn/ui**: Copy-paste 방식, 완전한 제어, 커스터마이징 용이
- **Tailwind CSS**: Utility-first, 빠른 스타일링, 일관성
- **Radix UI**: Accessibility, Unstyled components
- **타입 안전**: TypeScript 지원

**UI 컴포넌트 전략**:

- **재사용 컴포넌트**: Button, Input, Select, Dialog 등
- **복합 컴포넌트**: DataTable, Form, Card 등
- **테마**: CSS Variables 기반, 다크모드 지원

**대안 기술 비교**:

| 기술              | 장점                      | 단점                    | 선택 여부 |
| ----------------- | ------------------------- | ----------------------- | --------- |
| **Shadcn/ui**     | 완전한 제어, 커스터마이징 | 수동 업데이트           | ✅ 선택   |
| MUI (Material-UI) | 성숙, 다양한 컴포넌트     | 무거움, Material 디자인 | ❌        |
| Ant Design        | 엔터프라이즈급, 다양      | 무거움, 중국풍 디자인   | ❌        |
| Chakra UI         | 접근성, 간단              | 커스터마이징 제약       | ❌        |
| Headless UI       | 경량, 접근성              | 스타일링 수동           | ❌        |

> **구현 상세**: 컴포넌트 코드, 스타일 설정은 [LLD.md](LLD.md) 참조

---

## 데이터베이스 설계

**전체 데이터베이스 설계는 [DB.md](DB.md) 문서를 참조하십시오.**

### 데이터베이스 설계 원칙

1. **정규화**: 3NF까지 정규화 (중복 최소화)
2. **명명 규칙**: PascalCase (Prisma 권장)
3. **관계**: 외래키 명시, Cascade 규칙 정의
4. **인덱스**: 자주 조회되는 컬럼에 인덱스 생성
5. **Soft Delete**: `deletedAt` 컬럼으로 논리 삭제

> **구현 상세**: 전체 Prisma 스키마, ERD, 테이블 명세는 [DB.md](DB.md) 참조

---

## API 아키텍처 및 설계 원칙

### API 아키텍처 전략

TRD의 역할에 맞게 구체적인 구현 코드는 제거하고 전략적인 내용만 남깁니다.

```
┌─────────────────────────────────────────┐
│         Client Components               │
└────────────┬──────────────┬─────────────┘
             │              │
             │              │
      Server Actions    Route Handlers
             │              │
             ↓              ↓
┌─────────────────────────────────────────┐
│         Service Layer                   │
│  - SR Service                           │
│  - User Service                         │
│  - Notification Service                 │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│         Data Access Layer               │
│  - Prisma Client                        │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│   PostgreSQL 16 (sr-db 컨테이너)        │
└─────────────────────────────────────────┘
```

### Server Actions vs Route Handlers 전략

| 비교                        | Server Actions                                    | Route Handlers                   |
| --------------------------- | ------------------------------------------------- | -------------------------------- |
| **용도**                    | 내부 API (폼 제출, 뮤테이션)                      | 클라이언트 REST 호출, SSE 스트림 |
| **타입 안전성**             | ✅ 완벽한 타입 추론                               | ❌ 수동 타입 정의 필요           |
| **Progressive Enhancement** | ✅ JavaScript 없이 동작                           | ❌ JavaScript 필요               |
| **인증**                    | auth() 함수 사용                                  | auth() 함수 사용                 |
| **재사용성**                | Server Component, Client Component 모두 호출 가능 | Client에서만 호출                |
| **캐싱**                    | Next.js 자동 캐싱                                 | 수동 캐싱 필요                   |
| **선택 기준**               | **폼 제출, 데이터 뮤테이션 (우선 사용)**          | **REST API, SSE, 헬스체크**      |

**선택 이유**:

- **Server Actions 우선**: 타입 안전성, Progressive Enhancement
- **Route Handlers**: React Query 가 호출하는 조회 API(`/api/srs` 등), SSE(`/api/realtime`),
  푸시 구독(`/api/push`), 첨부파일 다운로드(`/api/attachments/[id]/download`),
  헬스체크(`/api/health`)
  — **외부 Webhook 수신 엔드포인트는 없다** (Inngest·Resend 를 채택하지 않았으므로 수신할 것이 없다)

### API 설계 원칙

1. **RESTful 원칙**
   - GET: 조회
   - POST: 생성
   - PUT/PATCH: 수정
   - DELETE: 삭제

2. **응답 형식 표준화**
   - 성공 응답: `{ success: true, data: { ... } }`
   - 에러 응답: `{ success: false, error: { code, message, details } }`

3. **에러 코드 체계**
   - `VALIDATION_ERROR`: 입력 검증 실패
   - `UNAUTHORIZED`: 인증 실패
   - `FORBIDDEN`: 권한 없음
   - `NOT_FOUND`: 리소스 없음
   - `CONFLICT`: 중복 데이터
   - `INTERNAL_ERROR`: 서버 에러

4. **Validation (Zod)**
   - 모든 입력은 Zod 스키마로 검증
   - 클라이언트와 서버 모두 검증 (중복 검증)

5. **인증 및 권한**
   - 모든 API는 기본적으로 인증 필요
   - RBAC (Role-Based Access Control)
   - Permission Check: `hasPermission(user, 'sr:read')`

6. **Rate Limiting** (`src/lib/rate-limiter.ts` — **프로세스 내 메모리**, Redis 미사용)
   - 미들웨어(`src/proxy.ts`)가 `/api/*` 및 Server Action POST 에 IP 기준으로 적용
   - 신뢰 IP 해석: nginx 가 설정하는 `X-Real-IP` 우선, 없으면 `X-Forwarded-For` 의 **마지막** 항목
     (클라이언트가 위조 가능한 첫 항목은 사용하지 않는다)
   - 기본 프리셋(모두 환경 변수로 조정 가능):
     STRICT 5회/분 · STANDARD 100회/분 · RELAXED 300회/분 · FILE_UPLOAD 20회/시간 ·
     MIDDLEWARE 100회/분
   - 사용자 기준 제한은 구현되어 있지 않다 (1.3 의 "User 기반 500 requests/minute" 은 근거 없음)

7. **캐싱 전략**
   - Next.js Cache: `unstable_cache()` 활용 (TTL 300초)
   - Revalidation: `revalidateTag()` / `revalidatePath()`
   - 외부 캐시 서버 없음

> **구현 상세**: Server Actions 및 Route Handlers 구현, Validation 스키마는 [LLD.md](LLD.md) 참조

---

## 인증 및 보안 전략

### 인증 전략

**NextAuth.js v5 선택 이유**:

- Next.js App Router 네이티브 지원
- JWT 및 Database Session 모두 지원
- Credentials, OAuth 등 다양한 Provider
- Middleware 통합으로 페이지 보호 간편

### 인증 흐름 전략

```
┌─────────────┐     1. 로그인 요청      ┌─────────────┐
│   Client    │ ───────────────────────→ │  NextAuth   │
└─────────────┘                           └─────────────┘
                                               │
                                               │ 2. 사용자 검증
                                               ↓
                                          ┌─────────────┐
                                          │  Database   │
                                          └─────────────┘
                                               │
                                               │ 3. JWT 생성
                                               ↓
┌─────────────┐     4. JWT 반환         ┌─────────────┐
│   Client    │ ←─────────────────────── │  NextAuth   │
└─────────────┘                           └─────────────┘
       │
       │ 5. 인증 필요 요청 (JWT 포함)
       ↓
┌─────────────┐     6. JWT 검증         ┌─────────────┐
│  Middleware │ ───────────────────────→ │  NextAuth   │
└─────────────┘                           └─────────────┘
       │
       │ 7. 페이지 접근 허용
       ↓
┌─────────────┐
│    Page     │
└─────────────┘
```

### JWT vs Database Session 선택

**JWT Session 선택 이유**:

- **Stateless**: 서버에 세션 저장 불필요
- **빠름**: 요청마다 세션 DB 조회 없음
- **Edge 미들웨어 호환**: `src/proxy.ts` 는 `src/auth.config.ts`(Edge-safe 설정)만 사용해
  bcryptjs·Prisma 를 미들웨어 번들에서 배제한다

**Database Session 대비 — 감수하는 위험**:

- 로그아웃·권한 회수·역할 변경이 **즉시 반영되지 않는다** (토큰 만료까지 유효)
- 서명키가 유출되면 임의의 사용자 ID·역할·테넌트를 담은 쿠키를 만들 수 있다
  ([docs/SECRET_ROTATION.md](SECRET_ROTATION.md) 0절)
- **완화책 미구현**: 토큰 블랙리스트가 없다. 초기 설계안은 Redis 블랙리스트를 적었으나
  Redis 자체가 채택되지 않았다. 블랙리스트를 도입한다면 DB 테이블 방식이 현재 인프라에 맞는다.

### 보안 설정 전략

1. **비밀번호 해싱**
   - bcryptjs 사용, **work factor 12** (`SECURITY.BCRYPT_WORK_FACTOR`)
   - 평문 비밀번호 저장 금지

2. **JWT 보안**
   - Secret: `NEXTAUTH_SECRET` / `AUTH_SECRET` (32자 이상 강제, 미달 시 부팅 실패)
   - 환경별로 서로 다른 값을 사용한다 (스테이징 쿠키가 운영에서 통하지 않도록)
   - HttpOnly Cookie: XSS 방지
   - Secure Flag: HTTPS 전용
   - SameSite=Lax: CSRF 방지
   - 만료 시간: `session.maxAge` **미설정** → Auth.js 기본값 적용 (문서에서 특정 일수를 단정하지
     않는다). 유휴 만료는 `IdleTimeoutProvider` 가 클라이언트 측에서 처리한다.

3. **HTTPS**
   - Production 환경 필수
   - nginx 가 TLS 를 종료하고 80 → 443 으로 강제 리다이렉트한다 (`nginx/nginx.conf`)
   - 인증서: Let's Encrypt (`scripts/setup-letsencrypt.sh`). 최초 기동 시에는 자체 서명
     인증서로 시작한다. **자동 갱신은 아직 구성되어 있지 않다.**
   - `ssl_protocols TLSv1.2 TLSv1.3`

4. **CSRF Protection**
   - NextAuth 기본 제공
   - SameSite Cookie

5. **XSS Prevention**
   - React 자동 이스케이프
   - DOMPurify (HTML 콘텐츠 sanitize)

6. **SQL Injection Prevention**
   - Prisma ORM (Parameterized Query)

7. **권한 관리 (RBAC)**
   - Role-Based Access Control
   - 각 API는 권한 체크 필수
   - Permission: `module:action` (예: `sr:create`)

> **구현 상세**: NextAuth 설정, Callback, Middleware 코드는 [LLD.md](LLD.md) 참조

---

## 파일 스토리지 전략

### 서버 디스크 저장 선택 이유

> **정정(2026-07-30)**: 이 절 전체가 Vercel Blob 의 공개 URL·CDN·`put`/`head`/`del` API 를
> 전제로 작성되어 있었다. **Vercel Blob 은 채택되지 않았다.** 아래는 `src/lib/storage.ts` 와
> `src/lib/file-validator.ts` 실측 기준으로 다시 쓴 내용이다.

- **외부 의존 없음**: 오브젝트 스토리지 계정·토큰·비용이 필요하지 않다
- **완전한 접근 통제**: 공개 URL 이 존재하지 않으므로, 인증·인가를 통과한 요청만 파일을 받는다
  (다중 테넌트에서 URL 유출로 인한 교차 테넌트 노출 경로가 원천적으로 없다)
- **웹루트 밖 저장**: `public/` 이 아닌 `STORAGE_DIR` 에 두어 정적 서빙으로 새어 나가지 않는다
- **감수하는 단점**: CDN 이 없어 지리적 지연을 줄일 수 없고, 호스트 디스크 용량·장애에 종속되며,
  앱 컨테이너를 여러 개로 늘리면 볼륨 공유 설계가 필요하다

### 파일 경로 구조

| 경로 패턴 (STORAGE_DIR 기준)            | 용도          | 접근 방법                                        | 최대 크기      |
| --------------------------------------- | ------------- | ------------------------------------------------ | -------------- |
| `attachments/{srId}/{timestamp}-{name}` | SR 첨부파일   | `GET /api/attachments/[id]/download` (인증 필요) | MIME 별 (아래) |
| `uploads/*` (레거시, `public/` 하위)    | 과거 업로드분 | 동일 라우트의 폴백 조회 경로                     | —              |

프로필 이미지 전용 저장 경로(`avatars/*`)는 구현되어 있지 않다.

### 파일 업로드 전략

1. **파일명 규칙**
   - `attachments/{srId}/{timestamp}-{sanitizedName}`
   - `path.basename` → 공백을 `-` 로 → `[^a-zA-Z0-9._-]` 를 `_` 로 치환
   - `srId` 도 `path.basename` 처리하고, 최종 경로가 `STORAGE_DIR` 내부인지 검사한다(경로 탐색 차단)

2. **파일 타입 제한** (`src/lib/file-validator.ts`)
   - 확장자만 믿지 않는다. `file-type` 으로 파일 앞 4100 바이트의 매직 넘버를 읽어 실제 MIME 을
     판정하고, 확장자와 불일치하면 거부한다(`MIME_MISMATCH`)
   - 허용: JPEG, PNG, GIF, WebP / PDF, DOC(X), XLS(X), PPT(X) / TXT, CSV / ZIP, RAR, 7Z
   - 금지 확장자: `.exe .bat .cmd .com .pif .scr .vbs .js .jar .msi .app .deb .rpm .dmg .pkg .sh .bash .ps1`

3. **파일 크기 제한** (MIME 타입별)

   | 종류                 | 상한 |
   | -------------------- | ---- |
   | GIF, TXT             | 5MB  |
   | JPEG, PNG, WebP, CSV | 10MB |
   | PDF, DOC(X), XLS(X)  | 20MB |
   | PPT(X)               | 50MB |
   | ZIP, RAR, 7Z         | 50MB |

   경로상의 다른 상한도 함께 고려해야 한다: nginx `client_max_body_size 50m`,
   Server Action 본문 `bodySizeLimit: '2mb'`.

4. **권한**
   - 공개 URL 없음. 다운로드는 인증 라우트만 제공
   - 업로드는 서버에서만 수행 (클라이언트 직접 업로드 토큰 없음)

5. **파일 관리** (`src/lib/storage.ts`)
   - 업로드: `uploadAttachmentBlob(srId, file)` → `fs.promises.writeFile`
   - 삭제: `deleteAttachmentBlob(pathname)` → `fs.promises.unlink`
   - 경로 해석: `resolveAttachmentFilePath()` (신규 경로 → 레거시 경로 폴백, containment 검사)
   - `listAttachmentBlobs()` 는 **미구현 스텁**이다 (빈 배열 반환 + 경고 로그)

6. **파일 삭제**
   - SR 삭제 시 첨부 레코드는 DB Cascade 로 정리된다
   - **디스크의 고아 파일을 정리하는 정기 작업은 없다.** 초기 설계안의 "30일 후 Cron 삭제" 는
     구현되지 않았다(스케줄러 자체가 없다). 디스크 사용량은 수동 점검 대상이다.

> **구현 상세**: `src/lib/storage.ts`, `src/lib/file-validator.ts`, [LLD.md](LLD.md) 참조

---

## 알림 시스템 전략

### 알림 채널 전략

> **정정(2026-07-30)**: 이 절은 Resend/React Email/Inngest 및 SMS 채널을 전제로 작성되어
> 있었다. 실제 채널은 아래 표와 같다. `NotificationType` ENUM 은 `EMAIL` / `IN_APP` / `PUSH`
> 3종이며 **SMS 는 스키마에도 코드에도 없다.** 매터모스트 잔여물은 마이그레이션
> `20260730000000_drop_mattermost` 에서 제거되었다.
>
> **추가 정정(2026-08-02)**: `NotificationType` 에 `IN_APP` 값이 있지만 **이 값을 쓰는 코드는
> 한 줄도 없다.** 알림 벨·인박스 UI 도, `/api/notifications` 라우트도, `realtime-events.ts:26`
> 의 `NOTIFICATION_RECEIVED` 를 발행하거나 수신하는 코드도 없다. ENUM 에 값이 남아 있는 것이
> 기능이 있다는 뜻으로 읽혀 왔다 — 인앱 알림은 **구현하지 않기로 했다**(소유자 결정 2026-08-02).

| 채널            | 구현                                                  | 발송 조건                           |
| --------------- | ----------------------------------------------------- | ----------------------------------- |
| **이메일**      | nodemailer (SMTP)                                     | 사용자별 `notification_preferences` |
| **웹 푸시**     | web-push (VAPID)                                      | 브라우저 구독자                     |
| **실시간 갱신** | 자체 SSE `GET /api/realtime` (Node `EventEmitter`)    | 접속 중인 인증 사용자               |
| ~~인앱 알림~~   | **미구현** (알림 벨·인박스·`/api/notifications` 없음) | —                                   |
| ~~SMS~~         | **미구현** (ENUM·코드 모두 없음)                      | —                                   |

### 알림 트리거 (실측)

도메인 이벤트는 `prisma.$transaction` 래퍼가 **커밋 이후에** 디스패치하고
(`src/lib/prisma.ts:33-58`), `src/services/listeners/sr-notification.listener.ts` 가 수신한다.

| 도메인 이벤트       | 알림 대상 | 채널             | 기본 이메일 발송 여부                 |
| ------------------- | --------- | ---------------- | ------------------------------------- |
| `sr:created`        | 관리자    | 웹 푸시 + 이메일 | 기본 ON (`emailSRCreated`)            |
| `sr:status_changed` | 요청자    | 웹 푸시 + 이메일 | 기본 **OFF** (`emailSRStatusChanged`) |
| `sr:assigned`       | 담당자    | 웹 푸시 + 이메일 | 기본 ON (`emailSRAssigned`)           |

SSE 이벤트는 별도 채널이다: `sr:updated` / `sr:created` / `sr:deleted` / `sr:commented`.
각 SSE 연결은 `canReadSR()` 로 이벤트를 **연결별 필터링**하여 타 테넌트·미배정 SR 이벤트가
새어 나가지 않게 하고, 이벤트를 유발한 당사자에게는 에코하지 않는다.

**초기 설계안에 있었으나 구현되지 않은 트리거** (제거하지 않고 미구현으로 명시):
예상 완료일 임박(D-1/D-3), 만료 초과 알림, Critical SR 관리자 즉시 알림, 댓글 알림 이메일.
모두 스케줄러 또는 추가 리스너가 필요하며 현재 어느 것도 존재하지 않는다.

### 알림 발송 전략 (현재 상태)

1. **실행 경로**: 도메인 이벤트 → 리스너 → `backgroundTask` 로 응답 후 발송
2. **사용자 설정**: `notification_preferences` 로 유형별 이메일 On/Off, `push_subscriptions` 로
   푸시 구독 관리
3. **배치 발송 / 중복 방지 창**: **미구현** (초기 설계안의 "5분 간격 배치", "5분 내 중복 방지" 는
   구현되지 않았다)
4. **재시도**: **미구현.** 발송 실패는 로그로만 남는다. 큐도 outbox 도 Dead Letter Queue 도 없다.
5. **발송 이력**: `Notification` 테이블과 `NotificationStatus`(PENDING/SENT/FAILED) ENUM 은
   스키마에 존재한다. 다만 위 리스너 경로는 이 테이블에 레코드를 쓰지 않으므로,
   **발송 이력이 자동으로 축적되지는 않는다** — 개선 대상이다.

### 이메일 템플릿

- 서비스 내부의 HTML 문자열 메서드로 작성한다 (`src/services/email.service.ts`).
  **React Email(JSX 템플릿)은 채택되지 않았다.**
- 구현된 종류: SR 생성, 상태 변경, 할당
- 다국어: 한국어만

> **구현 상세**: `src/services/email.service.ts`, `src/services/push.service.ts`,
> `src/services/listeners/sr-notification.listener.ts`, [LLD.md](LLD.md) 참조

---

## 백그라운드 작업 전략

> **⚠️ 이 절은 전면 정정되었다(2026-07-30).**
> 1.3 은 Inngest 기반 Cron 작업 5종(일일 리포트, 만료 알림, 파일 정리, 이메일 재시도,
> 데이터 동기화)과 3회 재시도 · Dead Letter Queue · Sentry 에러 보고를 규정했다.
> **Inngest 는 채택되지 않았고, 열거된 작업과 재시도 기반 중 구현된 것은 하나도 없다.**
> 아래가 실제 상태다.

### `backgroundTask` 선택 이유 (실제 채택)

- **의존성 0**: 외부 SaaS·Redis·별도 워커 프로세스가 필요하지 않다
- **상시 구동 서버라 성립**: 컨테이너가 항상 살아 있으므로 응답 후에도 프로미스가 완주한다
  (서버리스에서 함수가 동결되어 fire-and-forget 이 유실되는 문제가 없다)
- **감수하는 단점**: 영속성·재시도·스케줄링·백프레셔가 전부 없다

### 실제 백그라운드 실행 경로

| 작업               | 트리거                         | 실행 방식                                 | 재시도    |
| ------------------ | ------------------------------ | ----------------------------------------- | --------- |
| 이메일 발송        | 도메인 이벤트(`sr:created` 등) | `backgroundTask` (응답 후, 같은 프로세스) | **없음**  |
| 웹 푸시 발송       | 동일                           | `backgroundTask`                          | **없음**  |
| 실시간 이벤트 발행 | 트랜잭션 커밋 후               | `EventEmitter` → SSE 스트림               | 해당 없음 |

앱 내부에 스케줄러(Cron)는 없다. 정기 작업은 GitHub Actions 에만 존재한다:

| 워크플로               | 스케줄                         | 내용                                       |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| `backup.yml`           | `0 18 * * *` (UTC) = KST 03:00 | 서버에서 pg_dump + uploads 백업, 보존 14일 |
| `scheduled-checks.yml` | `0 0 * * *` (UTC)              | 의존성 점검, 번들 분석, 성능 벤치마크      |
| `prewarm.yml`          | 수동(`workflow_dispatch`)      | 대시보드 캐시 워밍                         |

### 재시도 전략 (현재 없음)

1. **자동 재시도**: 없다. 실패는 `logger.error` 로만 남는다.
2. **에러 핸들링**: 로그 출력뿐이다. 외부 에러 추적기로 보고하지 않는다
   (Sentry 미사용 결정 — 「관측성」 절 참조).
3. **Dead Letter Queue**: 없다.

> **개선 방향(미구현)**: 알림 신뢰성이 필요하면 DB 기반 outbox 테이블(`Notification` 을
> PENDING → SENT/FAILED 로 실제 전이시키는 방식) + 폴링 워커가 현재 인프라에 가장 잘 맞는다.
> 외부 큐 SaaS 는 호스트 밖으로 데이터를 보내지 않는 현 방침과 충돌한다.

---

## 프론트엔드 아키텍처 전략

### React Server Components 전략

**Server Components 우선 사용**:

- 데이터 페칭
- 초기 렌더링
- SEO 최적화

**Client Components 사용 조건**:

- 상호작용 (onClick, onChange 등)
- useState, useEffect 등 React Hooks
- 브라우저 API (window, document, Notification/Service Worker)
- 실시간 업데이트 (SSE — `EventSource`, `src/hooks/use-realtime-status.ts`.
  WebSocket 은 사용하지 않는다)

**패턴**:

```
Server Component (Page)
  ├── Server Component (Header)
  ├── Client Component (Interactive Form)
  └── Server Component (Footer)
```

### 상태 관리 전략

| 상태 종류        | 관리 방법                                        | 용도                   |
| ---------------- | ------------------------------------------------ | ---------------------- |
| **Server State** | React Query (`@tanstack/react-query` 5.90)       | API 데이터, 캐싱       |
| **UI State**     | 지역 `useState` + Provider 컴포넌트 / `useToast` | 모달, 사이드바, 토스트 |
| **Form State**   | React Hook Form (+ Zod resolver)                 | 폼 입력, 검증          |
| **URL State**    | Next.js Router (searchParams)                    | 필터, 페이지네이션     |

> **정정**: 1.3 은 UI State 를 **Zustand** 로 기술했으나 **Zustand 는 설치되어 있지 않다**
> (`package.json` 에 없고 소스에서 import 하는 곳도 없다). 전역 상태 라이브러리 없이
> 지역 상태와 Provider 컴포넌트(`src/components/providers/`: `ClientLayout`,
> `RealtimeProvider`, `IdleTimeoutProvider`, `PWARegistration`)로 처리한다.
> 표 형태 데이터도 TanStack Table 이 아니라 Shadcn/ui `table.tsx` 프리미티브를 직접 조합한다.

**선택 이유**:

- **React Query**: 캐싱, 자동 재페칭, 무한 스크롤(`src/hooks/use-sr-infinite.ts`)
- **전역 상태 라이브러리 미도입**: 서버 상태는 React Query 가, 폼 상태는 React Hook Form 이,
  목록 필터는 URL 이 이미 담당하므로 남는 전역 UI 상태가 라이브러리를 정당화할 만큼 없었다
- **React Hook Form**: 성능 우수, Zod 통합 (`@hookform/resolvers`)

### 라우팅 전략

**파일 기반 라우팅** (Next.js App Router):

```
app/
├── (auth)/                    # 인증 관련 페이지 (레이아웃 분리)
│   ├── login/
│   └── register/
├── (dashboard)/               # 인증 필요 페이지
│   ├── sr/
│   │   ├── page.tsx          # SR 목록
│   │   ├── [id]/page.tsx     # SR 상세
│   │   └── new/page.tsx      # SR 생성
│   ├── clients/
│   └── settings/
└── api/                       # Route Handlers (REST API, SSE, 헬스체크)
    ├── auth/
    ├── srs/
    ├── attachments/
    ├── push/
    ├── realtime/              # SSE 스트림
    └── health/
```

**동적 라우팅**:

- `[id]`: SR 상세 페이지
- `[...slug]`: Catch-all 라우팅 (선택 사항)

**Parallel Routes** (선택 사항):

- 모달 구현: `@modal` 폴더

**Intercepting Routes** (선택 사항):

- 모달 인터셉트: `(.)sr/[id]`

> **구현 상세**: 컴포넌트 코드, 상태 관리 코드는 [LLD.md](LLD.md) 참조

---

## 성능 최적화 전략

### 성능 요구사항

> **⚠️ 목표 수치는 초기 설계안의 값이며 실측 근거가 없다.** 임의로 고쳐 쓰지 않고 그대로 남긴다.
> 다만 **측정 도구는 실제와 달랐다** — Vercel Analytics 와 Axiom 은 채택되지 않았으므로,
> 현재 이 표의 절반은 **측정 수단이 없는 상태**다. 아래 "측정 도구" 열은 실제 가용한 수단으로
> 정정했다.

| 메트릭                             | 목표 (초기 설계안) | 실제 측정 수단                                           |
| ---------------------------------- | ------------------ | -------------------------------------------------------- |
| **TTFB** (Time To First Byte)      | < 200ms            | **없음** (RUM 미도입. 로컬/CI Lighthouse 로 근사만 가능) |
| **FCP** (First Contentful Paint)   | < 1.5s             | Lighthouse (수동)                                        |
| **LCP** (Largest Contentful Paint) | < 2.5s             | Lighthouse (수동)                                        |
| **TTI** (Time To Interactive)      | < 3.5s             | Lighthouse (수동)                                        |
| **CLS** (Cumulative Layout Shift)  | < 0.1              | Lighthouse (수동)                                        |
| **API 응답 시간**                  | < 500ms            | **없음** (pino 로그가 stdout 에만 남고 집계 수단이 없다) |

측정 수단이 없는 항목은 사실상 관리되지 않는 목표다. 이 공백은 「모니터링 및 로깅 전략」 절의
과제와 동일한 뿌리를 가진다.

### 캐싱 전략

1. **Next.js Cache**
   - **Full Route Cache**: 정적 페이지 (빌드 시 생성)
   - **Data Cache**: `fetch()` 자동 캐싱
   - **Router Cache**: 클라이언트 사이드 캐싱

2. **애플리케이션 캐시** (Redis 아님 — 프로세스 내 메모리)
   - `unstable_cache` 로 사용자 목록·고객사 목록 캐싱 (`src/lib/cache.ts`)
   - TTL: 300초
   - 컨테이너 재시작 시 소실된다

3. **정적 자산 캐시**
   - Next.js 가 생성한 해시 파일명 기반 캐시 헤더 + nginx gzip 압축
   - **CDN 은 없다.** 모든 요청이 단일 호스트의 nginx 를 거친다.

4. **Cache Invalidation**
   - Tag-based Revalidation: `revalidateTag('sr-list')`
   - Time-based Revalidation: `revalidatePath('/sr')`
   - On-demand Revalidation: 데이터 변경 시

### 번들 최적화

1. **Code Splitting**
   - Dynamic Import: `next/dynamic`
   - 모달, 차트 등 무거운 컴포넌트

2. **Tree Shaking**
   - ESM import/export
   - `sideEffects: false` (package.json)

3. **Image Optimization**
   - Next.js Image Component
   - WebP 변환, lazy loading
   - Responsive images

4. **Font Optimization**
   - `next/font` 사용
   - 폰트 서브셋팅

### 데이터베이스 최적화

1. **쿼리 최적화**
   - N+1 문제 해결: `include`, `select`
   - 인덱스 활용: 자주 조회되는 컬럼

2. **Connection Pooling**
   - Prisma Client 내장 풀만 사용. 외부 풀러(PgBouncer 등) 없음.
   - 상시 구동 프로세스 1개이므로 `connection_limit=1` 같은 서버리스용 제약이 필요하지 않다.

3. **Read Replica**
   - 없음. 단일 PostgreSQL 컨테이너다. (초기 설계안의 외부 관리형 데이터베이스 서비스 읽기 복제본은 미채택)

4. **느린 쿼리 관측**
   - 개발 환경에서만 Prisma 미들웨어가 `PRISMA_SLOW_MS`(기본 200ms) 초과 쿼리를 경고하고,
     `PRISMA_SLOW_LOG_FILE` 지정 시 파일로 남긴다. 집계는 `pnpm report:slow-queries`.
   - **프로덕션에는 느린 쿼리 로깅이 없다** (`log: ['error']`).

> **구현 상세**: 캐싱 코드, 최적화 설정은 [LLD.md](LLD.md) 참조

---

## 테스팅 전략

### 테스트 범위

| 테스트 종류          | 도구                                | 범위                    | 목표 커버리지 |
| -------------------- | ----------------------------------- | ----------------------- | ------------- |
| **Unit Test**        | Vitest 4.0                          | 유틸 함수, 헬퍼, 서비스 | 80%           |
| **Integration Test** | Vitest (+ 실제 PostgreSQL 컨테이너) | Server Actions, API     | 70%           |
| **E2E Test**         | Playwright 1.58                     | 주요 사용자 흐름, RBAC  | 주요 시나리오 |
| **Component Test**   | Vitest + Testing Library            | React 컴포넌트          | 60%           |
| **Mutation Test**    | Stryker 9.5.1                       | 변경된 파일 (PR 에서만) | —             |

**실측값 (2026-07-30)**: statements 커버리지 **41.27%**, 뮤테이션 점수 **49.64%**.
위 "목표 커버리지" 는 목표치이며 현재 달성값이 아니다. 두 수치의 격차와 커버리지 게이트의
측정 범위 문제는 [docs/archive/PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md) 3.33 참조.

### Vitest 선택 이유

- **빠름**: Vite 기반, ESM 네이티브
- **Jest 호환**: API 유사, 마이그레이션 용이
- **TypeScript 지원**: 설정 간단
- **Next.js 통합**: 별도 설정 필요 (jsdom)

### Playwright 선택 이유

- **크로스 브라우저**: Chromium, Firefox, WebKit
- **자동 대기**: 요소 준비 대기 자동
- **병렬 실행**: 빠른 테스트
- **UI 모드**: 디버깅 편리

### 테스트 전략

1. **Unit Test**: 비즈니스 로직 검증
   - 유틸 함수
   - Zod 스키마
   - 계산 로직

2. **Integration Test**: API 검증
   - Server Actions 호출
   - DB 상호작용 — CI 는 `postgres:16-alpine` 서비스 컨테이너를 띄워 실제 쿼리와
     `prisma migrate deploy` / `migrate diff` 드리프트 검사를 수행한다(Mock 전용이 아니다)
   - 권한 체크

3. **E2E Test**: 사용자 시나리오
   - 로그인 → SR 생성 → 상태 변경 → 완료
   - SR 목록 조회, 필터링
   - 파일 업로드

4. **Component Test**: UI 컴포넌트
   - 버튼 클릭
   - 폼 입력
   - 모달 열기/닫기

### CI/CD 통합 (`.github/workflows/ci-cd.yml` 실측)

- **트리거**: `main` / `dev` 브랜치 push 및 두 브랜치를 향한 PR.
  `paths-ignore: ['**.md', 'docs/**']` — **문서만 수정하면 CI 도 배포도 돌지 않는다.**
- **잡 구성**: `code-quality`(ESLint + `tsc --noEmit`) / `test`(커버리지 게이트) /
  `mutation-test`(PR 전용) / `build` / `e2e-test` / `security`(gating `pnpm audit --prod
--audit-level=critical` + Trivy 리포트) / `deployment-ready`
- **E2E 범위 차등**: `main` push 는 전체 선택(2026-07-30 실측 185개)을,
  PR 은 보안·권한 핵심 서브셋(실측 50개)을 실행한다. PR 에서 전량을 돌리면 timeout 120분에
  육박하기 때문이다.
- **실패 시 배포 차단**: `deploy.yml` 이 `workflow_run` 으로 `CI/CD Pipeline` 의 결론에 매달려
  있고 `conclusion == 'success' && event == 'push'` 만 통과시킨다.
  ⚠️ 워크플로 **이름**(`CI/CD Pipeline`)이 이 결합의 유일한 연결고리다. 이름을 바꾸면 배포가
  조용히 멈춘다.

> **구현 상세**: 테스트 코드, 설정 파일은 [LLD.md](LLD.md) 참조

---

## 배포 전략

> **⚠️ 이 절은 전면 정정되었다(2026-07-30).**
> 1.3 은 Vercel 배포, PR별 Preview 환경(`sr-*.vercel.app`), Vercel Dashboard 환경 변수 관리,
> Vercel 자동 Blue-Green 무중단 배포, Dashboard Rollback 을 규정했다.
> **모두 사실이 아니다.** 실제는 GHCR 이미지 + SSH + `docker compose up --force-recreate` 이며,
> **무중단 배포가 아니다**(컨테이너를 내리고 다시 올린다). 아래는
> `.github/workflows/{ci-cd,deploy}.yml`, `Dockerfile`, `docker-compose.prod.yml`,
> `nginx/nginx.conf` 실측 기준이다.

### 환경 구성

| 환경            | 용도         | 배포 방법                                                              | 접근 지점                                                   |
| --------------- | ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Development** | 로컬 개발    | `pnpm dev`                                                             | `http://localhost:3000`                                     |
| **Staging**     | `dev` 브랜치 | `:dev` 이미지 → `docker-compose.test.yml` (compose 프로젝트 `sr-test`) | `https://test.lkindo.kr`                                    |
| **Production**  | 운영         | `:latest` 이미지 → `docker-compose.prod.yml`                           | `https://sr.lkindo.kr` (그 외 `lkindo.kr`, `www.lkindo.kr`) |

**PR 단위 Preview 환경은 없다.** 운영과 스테이징이 **같은 VM·같은 Docker 데몬·같은 디렉터리
(`/home/opc/sr`)** 를 공유하므로, `deploy.yml` 의 concurrency 그룹이 두 배포를 직렬화한다.

### CI/CD 파이프라인

```
┌─────────────┐
│  Git Push   │  (main / dev, '**.md' 및 docs/** 는 제외)
└──────┬──────┘
       │
       ↓
┌────────────────────────────────────────────┐
│  워크플로: CI/CD Pipeline (ci-cd.yml)      │
│   code-quality : ESLint + tsc --noEmit     │
│   test         : postgres:16-alpine 서비스  │
│                  migrate deploy → drift    │
│                  → seed → 커버리지 게이트   │
│   mutation-test: Stryker (PR 에서만)        │
│   build        : pnpm build (standalone)    │
│   e2e-test     : Playwright                 │
│                  (main=전체 / PR=보안 서브셋)│
│   security     : pnpm audit(게이트) + Trivy  │
└──────┬─────────────────────────────────────┘
       │ conclusion == success && event == push
       ↓ (workflow_run 트리거)
┌────────────────────────────────────────────┐
│  워크플로: Deploy (deploy.yml)              │
│  1. CI 통과 커밋(head_sha)을 체크아웃        │
│  2. Docker 이미지 빌드 → GHCR push          │
│       main → :latest  /  dev → :dev         │
│  3. scp: compose·nginx.conf·스크립트 전송   │
│  4. ssh: GitHub Secrets → 서버 .env 기록    │
│       (시크릿 비면 컨테이너 손대지 않고 중단)│
│  5. ssh: compose config -q 로 보간 검증      │
│  6. ssh: pull → down → up --force-recreate  │
│  7. ssh: 컨테이너 running 검증 (실패 시 exit)│
│  8. ssh: Let's Encrypt 스크립트, 이미지 prune│
└──────┬─────────────────────────────────────┘
       │
       ↓ 컨테이너 기동
┌────────────────────────────────────────────┐
│  docker-entrypoint.sh                      │
│   prisma migrate deploy (실패 시 0_init     │
│   베이스라인 후 재시도) → node server.js    │
└────────────────────────────────────────────┘
```

### 배포 전략

1. **자동 배포**: `main` push → CI 성공 → 운영 배포. `dev` push → CI 성공 → 스테이징 배포.
2. **Preview 배포**: **없다.** PR 은 CI(보안 E2E 서브셋 포함)만 통과시키고 환경을 만들지 않는다.
3. **Rollback**: 대시보드가 없다. GHCR 의 이전 이미지 태그/다이제스트로 되돌린 뒤 서버에서
   `docker compose up -d --force-recreate` 를 수동 실행한다.
   **DB 마이그레이션은 되돌아가지 않는다**(엔트리포인트가 전진만 한다).
4. **무중단 배포 아님**: `down` → `up --force-recreate` 사이에 짧은 다운타임이 있다.
   이름 충돌로 인한 "성공 보고 + 미교체" 를 막기 위해 동명 컨테이너를 강제 제거한 뒤 재생성하며,
   `docker ps` 로 실제 running 여부를 검증해 실패 시 배포를 실패로 처리한다.
5. **데이터 보존**: DB(`sr_db_data`)와 첨부파일(`sr_uploads`)은 named volume 이므로
   컨테이너 재생성으로 유실되지 않는다. nginx 인증서는 bind-mount 로 유지된다.

### 환경 변수 관리

- **저장소에 자격증명을 두지 않는다.** `.env.docker*` 는 추적 해제되었다.
- **운영/스테이징 런타임 env**: GitHub Secrets `PROD_ENV_DOCKER_B64` / `STAGING_ENV_DOCKER_B64`
  (base64) → 배포 시 서버의 `.env.docker` / `.env.docker.test` 로 기록 (`chmod 600`)
- **compose 보간용 env**(`POSTGRES_USER`/`PASSWORD`/`DB`): `PROD_COMPOSE_ENV_B64` /
  `STAGING_COMPOSE_ENV_B64` → `.env.prod` / `.env.staging`
- 서버의 기존 `/home/opc/sr/.env`(Docker 이전 배포 잔존 파일, EMAIL/VAPID 자격증명의 유일한
  사본)는 **덮어쓰지 않는다** — 배포 스크립트가 의도적으로 별도 파일을 사용한다.
- **부팅 시 검증**: `src/lib/env-validation.ts` + `src/instrumentation.ts` 가 필수 변수 누락·
  약한 시크릿을 감지하면 `process.exit(1)` 로 즉시 실패한다.
- 등록·로테이션 절차: [docs/SECRET_ROTATION.md](SECRET_ROTATION.md)

### 데이터베이스 마이그레이션

- **적용 시점**: 컨테이너 시작 시 `docker-entrypoint.sh` 가 `prisma migrate deploy` 를 실행한다.
  배포 워크플로가 별도로 실행하지 않으며, `db push --accept-data-loss` 나 자동 reseed 는
  데이터 유실·운영 계정 초기화 위험 때문에 제거되었다.
- **CI 사전 검증**: 모든 push/PR 이 빈 DB 에 마이그레이션을 적용하고 `migrate diff` 로
  `schema.prisma` 와의 드리프트를 검사한다.
- **Rollback**: 자동화되어 있지 않다. 역방향 마이그레이션을 손으로 작성해야 한다(Prisma 한계).
  복구 경로는 `scripts/restore.sh` + 최근 백업이다.

> **구현 상세**: `.github/workflows/ci-cd.yml`, `.github/workflows/deploy.yml`,
> `docker-compose.prod.yml`, `docker-entrypoint.sh`, [docs/SECRET_ROTATION.md](SECRET_ROTATION.md) 참조

---

## 모니터링 및 로깅 전략

> **⚠️ 이 절은 전면 정정되었다(2026-07-30).**
> 1.3 은 Sentry(에러 추적·성능·Breadcrumbs·Release Tracking·Slack 알림), Axiom(로그 집계·쿼리·
> 대시보드·30일 보관), Vercel Analytics(Web Vitals·Page Views) 세 축으로 서술되어 있었다.
> **세 서비스 모두 채택되지 않았다.** 나아가 **Sentry 는 소유자가 2026-07-30 에 사용하지 않기로
> 결정**했으므로 도입 후보에서도 제외된다. 아래는 실제 상태다.

### 에러 추적 (현재 없음)

- **에러 추적 서비스가 없다.** 예외는 `src/lib/logger.ts` 를 통해 로그로만 남는다.
- 소스맵 업로드, 릴리스 추적, 에러 그룹핑, 알림 라우팅 — 어느 것도 없다.
- **결정(2026-07-30, 소유자): Sentry 는 사용하지 않는다.** 이 공백을 메울 방법은
  자체 호스팅 가능한 방향(예: 서버에 이미 있는 uptime-kuma 알림 활용, 자체 호스팅 에러
  수집기)이어야 한다. 외부 SaaS 로 애플리케이션 예외를 전송하는 방식은 채택하지 않는다.

### 로깅 (pino → stdout → Docker json-file)

**구현**: `src/lib/logger.ts` (pino 10.3)

- **프로덕션**: pino 로 JSON 을 stdout 에 기록. `serverExternalPackages: ['pino',
'thread-stream']` 로 번들링을 피한다. 목적지는 `pino.destination({ sync: false,
minLength: 4096 })`.
- **개발/테스트**: 사람이 읽기 쉬운 `console` 출력
- **출력 레벨**: 프로덕션에서는 `error` / `warn` 만 출력된다. `info` / `debug` 는 억제되므로
  **운영에서 비즈니스 이벤트 로그를 기대할 수 없다.**
- **수집·보관**: Docker `json-file` 드라이버가 컨테이너별로 **3 × 10MB** 로테이션
  (`docker-compose.prod.yml`). 그 이상 오래된 로그는 사라진다.
  **호스트 밖으로 전송되지 않으며, 중앙 검색·쿼리·대시보드가 없다.**
- **알려진 결함**: `sync: false` 인데 `pino.final` / SIGTERM 플러시 핸들러가 등록되어 있지 않다
  → 컨테이너 종료 시 버퍼에 남은 로그가 유실될 수 있다(개선 대상).

**로그 구조** (`LogEntry`):

```json
{
  "level": "error",
  "message": "SR created",
  "timestamp": "2026-07-30T10:00:00.000Z",
  "context": {
    "srId": "abc123",
    "userId": "user1",
    "clientId": "client1"
  },
  "error": { "name": "...", "message": "...", "stack": "...", "code": "...", "statusCode": 500 }
}
```

**로그 레벨**:

- `error`: 에러 발생 (프로덕션 출력됨)
- `warn`: 경고 — 예: Rate Limit 도달, 이메일 자격증명 미설정 (프로덕션 출력됨)
- `info`: 정보 — 예: SSE 접속, 백그라운드 작업 완료 (**프로덕션 미출력**)
- `debug`: 디버깅 (개발 환경만)

### 가용성 감시 (uptime-kuma)

- 서버에서 `uptime-kuma` 컨테이너가 **4주 이상 구동 중**임을 SSH 로 확인했다.
- 단, 이 컨테이너는 **저장소의 어떤 compose 파일에도 정의되어 있지 않다.** 서버에서 수동
  관리되므로 저장소만 읽는 정적 분석·리뷰로는 보이지 않는다.
- **미확인**: 어떤 대상을 감시하는지, 알림 채널이 무엇인지는 저장소 기준으로 확인할 수 없다.
- 앱 측 준비물: `GET /api/health` 가 `SELECT 1` 로 DB 연결을 확인하고 실패 시 503 을 반환한다.
  Dockerfile `HEALTHCHECK` 와 compose `app` 서비스의 `healthcheck:` 는 없다.

### 없는 것 (명시)

- APM / 분산 트레이싱 (OpenTelemetry 등)
- 메트릭 수집·시계열 저장 (Prometheus 등)
- RUM / Web Vitals 실사용자 수집 (Vercel Analytics 미채택)
- 프로덕션 느린 쿼리 로깅 (개발 환경 전용)
- 로그 중앙 집계 및 장기 보관

### 로깅 원칙

1. **구조화된 로그**: JSON 형식
2. **로그 레벨**: error, warn, info, debug (프로덕션은 error/warn 만)
3. **컨텍스트 포함**: 사용자 ID, SR ID, 클라이언트 ID, 요청 ID
4. **민감 정보 제외**: 비밀번호, 토큰 등
5. **로그 보관**: 컨테이너별 3 × 10MB 로테이션 범위 내 (일수 기준 보장 없음)

> **구현 상세**: `src/lib/logger.ts`, `docker-compose.prod.yml` 의 `logging:` 블록,
> [docs/archive/PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md) 3.30 참조

---

## 성능 요구사항 및 벤치마크

> **⚠️ 이 절의 수치는 근거가 확인되지 않은 초기 설계안의 목표치다.**
> 임의로 고쳐 쓰지 않고 그대로 남긴다. 다만 두 가지를 분명히 한다.
>
> 1. **측정 수단이 대부분 없다.** Axiom·Vercel Analytics 는 채택되지 않았고 APM 도 없으므로,
>    운영 환경의 API 응답 시간·처리량은 현재 **측정되지 않는다.**
> 2. **용량 산정 전제가 바뀌었다.** 아래 목표는 자동 확장되는 서버리스 환경을 전제로 쓰였으나,
>    실제는 앱 컨테이너 1개(`--max-old-space-size=450`)와 PostgreSQL 컨테이너 1개가 **같은
>    VM 하나**를 공유하는 구성이다. 따라서 "동시 사용자 100명" 등은 검증된 수치가 아니다.
>
> 실측된 목표로 재기준화하려면 부하 테스트를 실제로 수행해야 한다(현재 미수행).

### 응답 시간 요구사항

| API              | 목표 응답 시간 | 허용 최대 시간 |
| ---------------- | -------------- | -------------- |
| **SR 목록 조회** | < 300ms        | < 500ms        |
| **SR 상세 조회** | < 200ms        | < 400ms        |
| **SR 생성**      | < 500ms        | < 1s           |
| **SR 수정**      | < 500ms        | < 1s           |
| **SR 삭제**      | < 300ms        | < 500ms        |
| **파일 업로드**  | < 2s           | < 5s (10MB)    |
| **통계 조회**    | < 500ms        | < 1s           |
| **검색**         | < 500ms        | < 1s           |

### 처리량 요구사항

| 메트릭          | 목표               | 비고        |
| --------------- | ------------------ | ----------- |
| **동시 사용자** | 100명              | 피크 시간대 |
| **API 호출**    | 1,000 requests/min | 평균        |
| **SR 생성**     | 50 SRs/hour        | 피크 시간대 |
| **파일 업로드** | 20 uploads/min     | 평균        |

### 데이터베이스 성능

| 쿼리                       | 목표 실행 시간 | 최적화 방법                |
| -------------------------- | -------------- | -------------------------- |
| **SR 목록 (페이지네이션)** | < 100ms        | 인덱스 (createdAt, status) |
| **SR 상세 (include 사용)** | < 150ms        | include 최소화             |
| **통계 (COUNT, GROUP BY)** | < 300ms        | 인덱스, 캐싱               |
| **검색 (LIKE 쿼리)**       | < 500ms        | Full-text search (향후)    |

### 프론트엔드 성능

| 메트릭                        | 목표    | 측정 수단                                                      |
| ----------------------------- | ------- | -------------------------------------------------------------- |
| **번들 크기 (First Load JS)** | < 200KB | Next.js 빌드 리포트 / `pnpm analyze` (`@next/bundle-analyzer`) |
| **Lighthouse Score**          | > 90    | 수동 실행 (**Lighthouse CI 는 구성되어 있지 않다**)            |
| **Time To Interactive**       | < 3.5s  | 수동 Lighthouse                                                |
| **First Contentful Paint**    | < 1.5s  | 수동 Lighthouse                                                |

### 벤치마크 계획 (현재 실행 상태 병기)

1. **정기 성능 테스트**
   - `scheduled-checks.yml` 이 매일 번들 분석(`ANALYZE=true pnpm build`)과
     `src/__tests__/performance/benchmark.test.ts` 를 실행한다. 단 `|| true` 로 감싸여 있어
     **실패해도 워크플로를 막지 않는다**(게이트가 아니라 리포트).
   - Lighthouse CI: **미구성**
   - 운영 API 응답 시간 모니터링: **수단 없음** (Axiom 미채택)

2. **부하 테스트**
   - **미수행.** k6 등 부하 테스트 도구가 저장소에 없다. "100명 동시 사용자",
     "1,000 requests/min" 은 검증되지 않은 목표다.

3. **데이터베이스 성능 테스트**
   - **미수행.** 1만 건 규모 데이터셋 생성 스크립트가 없다.
   - 개발 환경 느린 쿼리 로그(`PRISMA_SLOW_MS`)와 `pnpm report:slow-queries` 로 개별 쿼리를
     들여다보는 수준까지만 가능하다.

4. **최적화 우선순위**
   - 느린 쿼리 → 인덱스 추가
   - 큰 번들 → Code Splitting
   - 높은 API 응답 시간 → 캐싱
   - **선행 과제**: 위 판단을 하려면 먼저 측정 수단이 있어야 한다. 관측성 공백 해소가
     성능 최적화보다 앞선다.

> **구현 상세**: `.github/workflows/scheduled-checks.yml`,
> `src/__tests__/performance/benchmark.test.ts`, [LLD.md](LLD.md) 참조

---

## 부록

### 참고 문서

채택된 스택의 문서만 남긴다 (미채택 서비스의 링크는 신규 참여자를 오도하므로 제거했다).

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js v5 / Auth.js Documentation](https://authjs.dev/)
- [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [nginx Documentation](https://nginx.org/en/docs/)
- [nodemailer Documentation](https://nodemailer.com/)
- [web-push (VAPID) Documentation](https://github.com/web-push-libs/web-push)
- [pino Documentation](https://getpino.io/)
- [Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) · [Stryker](https://stryker-mutator.io/)

### 관련 문서

- **[PRD.md](SR_Management_System_PRD.md)**: 비즈니스 요구사항, 기능 정의
- **[DB.md](DB.md)**: 데이터베이스 설계, Prisma 스키마
- **[LLD.md](LLD.md)**: 구현 상세, 코드 예제, API 엔드포인트
- **[SECRET_ROTATION.md](SECRET_ROTATION.md)**: 시크릿 배치·로테이션 런북 (배포 사실의 근거)
- **[PROJECT_AUDIT_2026-07-29.md](archive/PROJECT_AUDIT_2026-07-29.md)**: 감사 보고서.
  본 문서의 "PRD-구현 격차" 정정 근거
- **[API.md](API.md)** (선택 사항): API 레퍼런스 문서

### 용어 정의

| 용어      | 설명                                                                 |
| --------- | -------------------------------------------------------------------- |
| **SR**    | Service Request (서비스 요청)                                        |
| **RBAC**  | Role-Based Access Control (역할 기반 접근 제어)                      |
| **JWT**   | JSON Web Token                                                       |
| **SSR**   | Server-Side Rendering                                                |
| **RSC**   | React Server Components                                              |
| **TTFB**  | Time To First Byte                                                   |
| **LCP**   | Largest Contentful Paint                                             |
| **CLS**   | Cumulative Layout Shift                                              |
| **CI/CD** | Continuous Integration / Continuous Deployment                       |
| **SSE**   | Server-Sent Events (서버 → 클라이언트 단방향 스트림)                 |
| **VAPID** | Voluntary Application Server Identification (웹 푸시 서버 인증 방식) |
| **GHCR**  | GitHub Container Registry                                            |

### 변경 이력 추적

- 모든 변경 사항은 Git 커밋으로 추적
- 주요 변경 사항은 문서 개정 이력에 기록
- 구현 변경 사항은 [LLD.md](LLD.md)에 기록

---

**문서 종료**

본 문서는 SR 관리 시스템의 **기술적 요구사항**을 정의합니다. 구체적인 구현 상세는 **[LLD.md](LLD.md)**를 참조하십시오.

**요약**: TRD는 "무엇을, 왜 선택했는가"에 집중하며, 기술 스택 선택 이유, 아키텍처 원칙, 성능 요구사항, 배포 전략을 다룹니다. 구현 코드는 LLD.md에서 관리합니다.
