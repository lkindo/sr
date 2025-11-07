# SR(Service Request) 관리 시스템 TRD

**문서 종류:** TRD (Technical Requirements Document)
**문서 버전:** 1.3
**작성일:** 2025-11-06
**최종 수정일:** 2025-11-07
**작성자:** Development Team
**검수자:** [검수자 정보]

---

## 📚 문서 간 참조 가이드

| 문서 | 역할 | 주요 내용 |
|------|------|-----------|
| **[PRD.md](SR_Management_System_PRD.md)** | 비즈니스 요구사항 | 기능 정의, 사용자 역할, SR 프로세스 |
| **[DB.md](DB.md)** | 데이터베이스 설계 | Prisma 스키마, ERD, 테이블 명세 |
| **[TRD.md](TRD.md)** | 기술 명세 | **아키텍처, 기술 스택 선택 이유, 배포 전략** ⭐ |
| **[LLD.md](LLD.md)** | 구현 상세 | 코드, 컴포넌트, API 구현, 테스트 코드 |

**권장 읽는 순서**: PRD → DB → TRD → LLD

---

## 문서 개정 이력

| 버전 | 작성자 | 변경 사항 | 작성일 | 검수자 |
|------|--------|-----------|--------|--------|
| 1.0 | Development Team | TRD 초안 작성 | 2025-11-06 | [검수자] |
| 1.1 | Development Team | SR 상태 ENUM 통합, 명명 규칙 정리, Prisma 스키마 업데이트 | 2025-11-06 | [검수자] |
| 1.2 | Development Team | 문서 간 참조 가이드 추가, 중복 제거 최적화 | 2025-11-07 | [검수자] |
| 1.3 | Development Team | TRD 본연의 역할에 집중하도록 구현 코드 제거, LLD 참조 체계 구축 | 2025-11-07 | [검수자] |

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

| 분류 | 기술 | 버전 |
|------|------|------|
| **Frontend** | Next.js (App Router) | 14.x |
| | React | 18.x |
| | TypeScript | 5.x |
| **Backend** | Next.js Server Actions | 14.x |
| | Route Handlers | 14.x |
| **Database** | Supabase PostgreSQL | Latest |
| | Prisma ORM | 5.x |
| **Storage** | Vercel Blob | Latest |
| **Cache** | Upstash Redis | Latest |
| **Deployment** | Vercel | Latest |
| **Authentication** | NextAuth.js | v5 |
| **Email** | Resend | Latest |
| | React Email | Latest |
| **Background Jobs** | Inngest | Latest |
| **Monitoring** | Sentry | Latest |
| | Axiom | Latest |
| **UI Components** | Shadcn/ui | Latest |
| | Tailwind CSS | 3.x |

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
                         │ HTTPS
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Vercel Edge Network (CDN)                   │
│  - Static Assets Cache                                  │
│  - Image Optimization                                   │
│  - Edge Middleware                                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│           Next.js 14 Application (Vercel)               │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Server Components                      │  │
│  │  - SSR (Server-Side Rendering)                   │  │
│  │  - Data Fetching                                 │  │
│  │  - Initial HTML Generation                       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Client Components                      │  │
│  │  - Interactivity                                 │  │
│  │  - State Management (Zustand)                    │  │
│  │  - React Query (Server State)                    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Server Actions                         │  │
│  │  - API Logic                                     │  │
│  │  - Data Mutations                                │  │
│  │  - Server-side Business Logic                    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Route Handlers                         │  │
│  │  - REST API Endpoints                            │  │
│  │  - Webhooks                                      │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │            NextAuth Middleware                    │  │
│  │  - Authentication                                │  │
│  │  - Authorization                                 │  │
│  │  - Session Management                            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│  Supabase   │  │   Upstash    │  │  External   │
│  PostgreSQL │  │    Redis     │  │  Services   │
│             │  │              │  │             │
│ + Pooler    │  │ - Cache      │  │ - Resend    │
│ (PgBouncer) │  │ - Session    │  │ - Inngest   │
│             │  │ - Rate Limit │  │ - Sentry    │
│ Supabase    │  │              │  │ - Axiom     │
│  Storage    │  │              │  │ - Mattermost│
└─────────────┘  └──────────────┘  └─────────────┘
```

### 레이어드 아키텍처

```
┌─────────────────────────────────────────┐
│      Presentation Layer                 │
│  - React Components                     │
│  - UI Components (Shadcn/ui)            │
│  - Forms (React Hook Form)              │
│  - Tables (TanStack Table)              │
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
│  - Supabase PostgreSQL                  │
│  - Vercel Blob                          │
│  - Upstash Redis                        │
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
   - Route Handlers는 외부 API 및 Webhook용

5. **Security by Default**
   - 모든 API는 기본적으로 인증 필요
   - 권한 기반 접근 제어 (RBAC)
   - Input Validation (Zod)

---

## 기술 스택 및 선택 이유

### 1. Next.js 14 (App Router)

**버전**: 14.x (최신 stable)

**선택 이유**:
- **React Server Components**: 초기 로딩 성능 최적화 (JavaScript 번들 크기 감소)
- **Server Actions**: API 라우트 없이 데이터 뮤테이션 가능, 타입 안정성 향상
- **Streaming & Suspense**: 점진적 UI 렌더링으로 TTFB(Time To First Byte) 개선
- **Vercel 통합**: 배포 및 인프라 관리 간소화
- **TypeScript Native**: 타입 안정성 및 개발자 경험(DX) 향상
- **Image Optimization**: 자동 이미지 최적화 및 lazy loading

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Next.js 14** | RSC, Server Actions, Vercel 통합 | Learning Curve | ✅ 선택 |
| Next.js 13 Pages Router | 안정적, 익숙함 | RSC 미지원, 구식 패턴 | ❌ |
| Remix | Server-first, Form Actions | Vercel 통합 부족, 생태계 작음 | ❌ |
| SvelteKit | 빠른 성능, 작은 번들 | React 생태계 활용 불가 | ❌ |
| Vite + React | 빠른 HMR | SSR 설정 복잡, 프레임워크 기능 부족 | ❌ |

**주요 기능 활용**:
- **Server Components**: 데이터 페칭 및 초기 렌더링
- **Client Components**: 상호작용 (form, modal, real-time updates)
- **Server Actions**: 폼 제출, 데이터 뮤테이션
- **Route Handlers**: REST API, Webhooks
- **Middleware**: 인증, 권한, 로깅

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
- 공통 타입은 `src/types/index.ts`에 중앙 관리

> **구현 상세**: tsconfig.json, 타입 정의 예제는 [LLD.md](LLD.md) 참조

---

### 3. Prisma ORM

**버전**: 5.x

**선택 이유**:
- **타입 안전성**: TypeScript와 완벽한 통합
- **스키마 우선**: 단일 스키마 파일로 DB 구조 관리
- **마이그레이션**: 자동 마이그레이션 생성 및 버전 관리
- **쿼리 최적화**: N+1 문제 해결 (include, select)
- **Prisma Studio**: GUI 기반 데이터 관리 도구

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Prisma** | 타입 안전, 마이그레이션, DX 우수 | 복잡한 쿼리 제약 | ✅ 선택 |
| Drizzle ORM | 빠른 성능, SQL-like | 생태계 작음, 미성숙 | ❌ |
| TypeORM | 다양한 DB 지원 | 타입 안정성 부족, 복잡함 | ❌ |
| Sequelize | 성숙한 생태계 | TypeScript 지원 약함 | ❌ |
| Raw SQL (node-postgres) | 최고 성능, 유연성 | 타입 안정성 없음, 보일러플레이트 많음 | ❌ |

**Prisma 설정 원칙**:
- **Connection Pooling**: Vercel Serverless 환경에서 PgBouncer 사용 (Supabase Pooler)
- **두 개의 연결 문자열**:
  - `DATABASE_URL`: Pooler 연결 (6543 포트) - 런타임용
  - `DIRECT_URL`: 직접 연결 (5432 포트) - 마이그레이션용
- **로깅**: 개발 환경에서만 쿼리 로그 활성화
- **Singleton 패턴**: HMR로 인한 다중 인스턴스 방지

**마이그레이션 전략**:
- **개발 환경**: `prisma migrate dev` (자동 마이그레이션 생성)
- **Production**: `prisma migrate deploy` (CI/CD에서 자동 실행)
- **Seed 데이터**: 초기 권한, 역할, 테스트 사용자 생성

> **구현 상세**: Prisma Client 설정, 마이그레이션 스크립트, Seed 파일은 [LLD.md](LLD.md) 참조

---

### 4. Supabase PostgreSQL

**버전**: PostgreSQL 15 (Supabase 관리형)

**선택 이유**:
- **관리형 서비스**: 백업, 확장, 보안 패치 자동화
- **Connection Pooling**: PgBouncer 기본 제공 (Serverless 환경 최적화)
- **통합 서비스**: Storage, Auth, Realtime 통합
- **무료 플랜**: 개발 및 소규모 배포 가능
- **확장 가능**: Vector, PostGIS 등 PostgreSQL 확장 기능 지원

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Supabase PostgreSQL** | 관리형, Pooler, Storage 통합 | 비용 (대규모 시) | ✅ 선택 |
| Neon PostgreSQL | Serverless, Auto-scaling | Storage 별도, 초기 지원 | ❌ |
| PlanetScale (MySQL) | Auto-scaling, Branching | PostgreSQL 아님, 복잡한 기능 제약 | ❌ |
| AWS RDS | 안정적, 다양한 옵션 | 설정 복잡, 비용 높음 | ❌ |
| Railway PostgreSQL | 간단, 저렴 | Connection Pool 수동 설정 | ❌ |

**Connection Pooling 전략**:
- **Pooler 연결 (DATABASE_URL)**: 모든 Prisma 쿼리
- **직접 연결 (DIRECT_URL)**: 마이그레이션, 스키마 변경
- **Connection Limit**: 1개 (Vercel Serverless 함수당)

**보안 설정**:
- **Row Level Security (RLS)**: 사용 안 함 (애플리케이션 레벨에서 권한 관리)
- **SSL 연결**: 필수 (production 환경)
- **Service Role Key**: 백엔드 전용, 노출 금지

> **구현 상세**: 환경 변수 설정, Connection Pooling 설정은 [LLD.md](LLD.md) 참조

---

### 5. Vercel Blob

**버전**: Latest

**선택 이유**:
- **Vercel 통합**: Next.js와 완벽한 통합, 설정 간편
- **엣지 최적화**: 전역 CDN, 빠른 파일 전송
- **간단한 API**: `put`, `head`, `del` 등 직관적인 함수
- **자동 공개 URL**: 업로드 시 즉시 접근 가능한 URL 생성
- **토큰 기반 인증**: 간단한 환경 변수 설정

**파일 업로드 전략**:
- **경로 구조**: `sr-attachments/{srId}/{timestamp}-{originalName}`
- **파일명 규칙**: 타임스탬프 + 원본 파일명
- **접근 권한**: Public access (공개 URL 자동 생성)
- **최대 파일 크기**: 10MB (Server Action limit)

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Vercel Blob** | Vercel 통합, 간단, CDN | 비용 (대용량 시) | ✅ 선택 |
| Supabase Storage | Supabase 통합, 무료 플랜 | Vercel과 별도 관리 | ❌ |
| AWS S3 | 강력, 다양한 기능 | 설정 복잡, 비용 관리 | ❌ |
| Cloudinary | 이미지 변환 강력 | 비용 높음, 오버킬 | ❌ |

> **구현 상세**: 파일 업로드 코드, 설정은 [LLD.md](LLD.md) 참조

---

### 6. Upstash Redis

**버전**: Latest (Redis 7 호환)

**선택 이유**:
- **Serverless**: 사용량 기반 과금, 유휴 시 비용 없음
- **REST API**: HTTP 기반, Vercel Edge Functions 호환
- **저지연**: 전역 복제 지원
- **무료 플랜**: 10,000 requests/day

**사용 목적**:
- **세션 스토어**: NextAuth 세션 저장
- **캐싱**: API 응답, 데이터 쿼리 결과
- **Rate Limiting**: API 호출 제한
- **실시간 알림**: Pub/Sub (선택적)

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Upstash Redis** | Serverless, REST API, 저렴 | 제한적인 고급 기능 | ✅ 선택 |
| Redis Cloud | 강력, 다양한 기능 | 비용 높음, 설정 복잡 | ❌ |
| Vercel KV | Vercel 통합 | Upstash 기반, 중복 | ❌ |
| Memcached | 간단, 빠름 | 기능 제한, 관리형 부족 | ❌ |

**캐싱 전략**:
- **Cache Invalidation**: Tag-based revalidation (Next.js revalidateTag)
- **TTL**: 응답 종류에 따라 5분~1시간
- **Stale-While-Revalidate**: 백그라운드 갱신

> **구현 상세**: Redis Client 설정, 캐싱 코드는 [LLD.md](LLD.md) 참조

---

### 7. NextAuth.js v5

**버전**: 5.x (Auth.js)

**선택 이유**:
- **Next.js 통합**: App Router 네이티브 지원
- **다양한 Provider**: Credentials, OAuth (Google, GitHub 등)
- **세션 관리**: JWT 또는 Database Session
- **타입 안전**: TypeScript 지원
- **미들웨어 통합**: 페이지 보호, 리다이렉트

**인증 전략**:
- **Credentials Provider**: 이메일/비밀번호 (bcrypt)
- **JWT 세션**: Stateless, 확장성 우수
- **세션 저장소**: Redis (선택적, 로그아웃 구현 시)

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **NextAuth.js v5** | Next.js 통합, 다양한 Provider | 복잡한 설정 (v5) | ✅ 선택 |
| Clerk | 간단, UI 제공 | 비용 높음, Lock-in | ❌ |
| Auth0 | 엔터프라이즈급, 강력 | 비용 매우 높음 | ❌ |
| Supabase Auth | Supabase 통합 | Next.js 통합 약함 | ❌ |
| Custom Auth | 완전한 제어 | 보안 리스크, 개발 시간 | ❌ |

**보안 설정**:
- **Password Hashing**: bcrypt (saltRounds: 10)
- **JWT Secret**: 256-bit random string
- **Session Token**: HttpOnly, Secure, SameSite=Lax
- **CSRF Protection**: NextAuth 기본 제공

> **구현 상세**: NextAuth 설정, Callback 코드는 [LLD.md](LLD.md) 참조

---

### 8. Resend + React Email

**버전**: Latest

**선택 이유**:
- **React Email**: JSX로 이메일 템플릿 작성
- **Resend**: 간단한 API, 높은 전달률
- **무료 플랜**: 3,000 emails/month
- **타입 안전**: TypeScript 지원

**이메일 발송 전략**:
- **트랜잭션 이메일**: SR 상태 변경, 할당, 완료 알림
- **템플릿 관리**: React 컴포넌트로 관리 (버전 관리 가능)
- **발송 실패 처리**: Inngest로 재시도

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Resend** | 간단, React Email 통합 | 제한적인 고급 기능 | ✅ 선택 |
| SendGrid | 강력, 다양한 기능 | 복잡한 API, 비용 높음 | ❌ |
| AWS SES | 저렴, 확장 가능 | 설정 복잡, 전달률 관리 필요 | ❌ |
| Postmark | 높은 전달률 | 비용 높음 | ❌ |

> **구현 상세**: 이메일 템플릿, 발송 코드는 [LLD.md](LLD.md) 참조

---

### 9. Inngest

**버전**: Latest

**선택 이유**:
- **백그라운드 작업**: 장기 실행 작업 처리
- **Cron Jobs**: 스케줄링 작업 (일일 리포트, 만료 알림)
- **재시도 로직**: 자동 재시도, 에러 핸들링
- **Type-safe**: TypeScript 지원
- **무료 플랜**: 10,000 steps/month

**백그라운드 작업 종류**:
- **일일 리포트**: 매일 오전 9시 SR 현황 이메일
- **만료 알림**: 예상 완료일 D-1, D-3 알림
- **파일 처리**: 대용량 파일 변환, 압축
- **데이터 동기화**: 외부 시스템 연동

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Inngest** | Type-safe, 재시도, Vercel 통합 | 상대적으로 신규 | ✅ 선택 |
| Vercel Cron | Vercel 통합 | 제한적인 기능, 1분 간격 제약 | ❌ |
| BullMQ | 강력, 성숙 | Redis 필요, 복잡 | ❌ |
| Trigger.dev | 강력, 다양한 통합 | 비용 높음 | ❌ |

> **구현 상세**: Inngest 함수 정의, 스케줄링 코드는 [LLD.md](LLD.md) 참조

---

### 10. Vercel

**버전**: Latest

**선택 이유**:
- **Next.js 최적화**: Next.js 개발사, 완벽한 통합
- **Edge Network**: 전역 CDN, 낮은 지연시간
- **Zero-Config**: 간단한 배포, 자동 SSL
- **Preview Deployments**: PR마다 Preview 환경 자동 생성
- **무료 플랜**: 개인 프로젝트, 소규모 팀

**배포 전략**:
- **3개 환경**: Development (Local), Preview (PR), Production
- **자동 배포**: main 브랜치 push 시 자동 배포
- **환경 변수**: Vercel Dashboard에서 관리

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Vercel** | Next.js 최적화, 간단 | 비용 (대규모 시) | ✅ 선택 |
| Netlify | 간단, 다양한 프레임워크 | Next.js 통합 약함 | ❌ |
| AWS (Amplify, ECS) | 완전한 제어, 저렴 (대규모) | 설정 복잡, 관리 부담 | ❌ |
| Railway | 간단, 저렴 | Next.js 최적화 부족 | ❌ |
| Cloudflare Pages | 빠름, 저렴 | Next.js 제약 (일부 기능) | ❌ |

> **구현 상세**: Vercel 설정, 환경 변수, CI/CD는 [LLD.md](LLD.md) 참조

---

### 11. Sentry + Axiom

**버전**: Latest

**선택 이유**:
- **Sentry**: 에러 추적, 성능 모니터링, 알림
- **Axiom**: 로그 집계, 쿼리, 대시보드
- **Next.js 통합**: 자동 소스맵, Error Boundary
- **무료 플랜**: Sentry 5K errors/month, Axiom 500MB/month

**모니터링 전략**:
- **에러 모니터링**: 모든 서버/클라이언트 에러
- **성능 모니터링**: API 응답 시간, 렌더링 시간
- **로그 집계**: 구조화된 로그, 검색 가능
- **알림**: Slack, 이메일 (Critical 에러)

**대안 기술 비교**:

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Sentry** | 강력한 에러 추적 | 비용 (대규모 시) | ✅ 선택 (에러) |
| **Axiom** | 로그 집계, 저렴 | 에러 추적 약함 | ✅ 선택 (로그) |
| Datadog | 통합 솔루션, 강력 | 비용 매우 높음 | ❌ |
| LogRocket | Session Replay 강력 | 비용 높음 | ❌ |
| Vercel Analytics | Vercel 통합 | 제한적인 기능 | ❌ |

> **구현 상세**: Sentry, Axiom 설정 코드는 [LLD.md](LLD.md) 참조

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

| 기술 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **Shadcn/ui** | 완전한 제어, 커스터마이징 | 수동 업데이트 | ✅ 선택 |
| MUI (Material-UI) | 성숙, 다양한 컴포넌트 | 무거움, Material 디자인 | ❌ |
| Ant Design | 엔터프라이즈급, 다양 | 무거움, 중국풍 디자인 | ❌ |
| Chakra UI | 접근성, 간단 | 커스터마이징 제약 | ❌ |
| Headless UI | 경량, 접근성 | 스타일링 수동 | ❌ |

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
│       Supabase PostgreSQL               │
└─────────────────────────────────────────┘
```

### Server Actions vs Route Handlers 전략

| 비교 | Server Actions | Route Handlers |
|------|----------------|----------------|
| **용도** | 내부 API (폼 제출, 뮤테이션) | 외부 API, Webhooks |
| **타입 안전성** | ✅ 완벽한 타입 추론 | ❌ 수동 타입 정의 필요 |
| **Progressive Enhancement** | ✅ JavaScript 없이 동작 | ❌ JavaScript 필요 |
| **인증** | auth() 함수 사용 | auth() 함수 사용 |
| **재사용성** | Server Component, Client Component 모두 호출 가능 | Client에서만 호출 |
| **캐싱** | Next.js 자동 캐싱 | 수동 캐싱 필요 |
| **선택 기준** | **폼 제출, 데이터 뮤테이션 (우선 사용)** | **REST API, Webhooks** |

**선택 이유**:
- **Server Actions 우선**: 타입 안전성, Progressive Enhancement
- **Route Handlers**: 외부 API (모바일 앱), Webhooks (Inngest, Resend)

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

6. **Rate Limiting**
   - Upstash Redis로 구현
   - IP 기반 제한: 100 requests/minute
   - User 기반 제한: 500 requests/minute

7. **캐싱 전략**
   - Redis 캐싱: 자주 조회되는 데이터
   - Next.js Cache: `unstable_cache()` 활용
   - Revalidation: Tag-based invalidation

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
- **Stateless**: 서버에 세션 저장 불필요, 확장성 우수
- **빠름**: DB 조회 없음
- **Serverless 친화적**: Vercel Edge Functions 호환

**Database Session 대비**:
- 단점: 로그아웃 즉시 반영 불가 (JWT 만료까지 유효)
- 해결: Redis에 Blacklist 저장 (선택적)

### 보안 설정 전략

1. **비밀번호 해싱**
   - bcrypt 사용 (saltRounds: 10)
   - 평문 비밀번호 저장 금지

2. **JWT 보안**
   - Secret: 256-bit random string (환경 변수)
   - HttpOnly Cookie: XSS 방지
   - Secure Flag: HTTPS 전용
   - SameSite=Lax: CSRF 방지
   - 만료 시간: 7일

3. **HTTPS**
   - Production 환경 필수
   - Vercel 자동 SSL 인증서

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

### Vercel Blob 선택 이유

- **Vercel 통합**: Next.js와 완벽한 통합, 설정 간편
- **엣지 최적화**: 전역 CDN, 빠른 파일 전송
- **간단한 API**: `put`, `head`, `del` 등 직관적인 함수
- **자동 공개 URL**: 업로드 시 즉시 접근 가능한 URL 생성
- **토큰 기반 인증**: 간단한 환경 변수 설정

### 파일 경로 구조

| 경로 패턴 | 용도 | 권한 | 최대 파일 크기 |
|----------|------|------|----------------|
| `sr-attachments/{srId}/*` | SR 첨부파일 | Public | 10MB |
| `avatars/*` | 사용자 프로필 이미지 | Public | 2MB |

### 파일 업로드 전략

1. **파일명 규칙**
   - `sr-attachments/{srId}/{timestamp}-{originalName}`
   - 예: `sr-attachments/abc123/1699999999-report.pdf`

2. **파일 타입 제한**
   - 허용: PDF, JPG, PNG, DOCX, XLSX
   - 금지: EXE, BAT, SH 등 실행 파일

3. **파일 크기 제한**
   - SR 첨부파일: 10MB
   - 프로필 이미지: 2MB

4. **권한**
   - Public access (읽기 전용 URL 자동 생성)
   - 업로드는 서버에서만 (Server Action)

5. **파일 관리**
   - 업로드: `put(pathname, file, { access: 'public' })`
   - 삭제: `del(url)`
   - 조회: `head(url)`

6. **파일 삭제**
   - SR 삭제 시 연관 파일 자동 삭제 (Cascade)
   - Soft Delete: DB에서만 삭제, 실제 파일은 유지 (30일 후 Cron으로 삭제)

> **구현 상세**: 파일 업로드 코드, 설정은 [LLD.md](LLD.md) 참조

---

## 알림 시스템 전략

### 알림 채널 전략

| 채널 | 사용 목적 | 발송 조건 | 우선순위 |
|------|-----------|-----------|----------|
| **이메일** | SR 상태 변경, 완료 알림 | 항상 발송 | High |
| **인앱 알림** | 실시간 알림, 댓글 알림 | 로그인 사용자 | Medium |
| **Mattermost** | 긴급 알림, 시스템 장애 | Critical 우선순위 SR | High |
| **SMS** | 긴급 알림 (선택 사항) | Critical SR, 장기 미응답 | Critical |

### 알림 트리거

| 이벤트 | 알림 대상 | 채널 | 내용 |
|--------|-----------|------|------|
| **SR 생성** | 핸들러(담당자) | 이메일, 인앱 | "새 SR이 할당되었습니다: {srCode}" |
| **SR 상태 변경** | 요청자, 핸들러 | 이메일, 인앱 | "SR {srCode} 상태가 {status}로 변경되었습니다" |
| **SR 완료** | 요청자 | 이메일, 인앱 | "SR {srCode}가 완료되었습니다. 확인 부탁드립니다" |
| **댓글 작성** | SR 관련자 | 인앱 | "{user}님이 댓글을 남겼습니다" |
| **예상 완료일 임박** | 핸들러 | 이메일, Mattermost | "SR {srCode} 예상 완료일이 3일 남았습니다" |
| **만료 알림** | 핸들러, 관리자 | 이메일, Mattermost | "SR {srCode}가 예상 완료일을 초과했습니다" |
| **Critical SR** | 관리자 | 이메일, Mattermost | "긴급 SR이 생성되었습니다: {srCode}" |

### 알림 발송 전략

1. **배치 발송**: 여러 알림을 묶어서 발송 (5분 간격)
2. **사용자 설정**: 알림 On/Off, 채널 선택 가능
3. **중복 방지**: 동일 SR에 대한 중복 알림 방지 (5분 내)
4. **재시도**: Inngest로 발송 실패 시 자동 재시도 (3회)
5. **로깅**: 모든 알림 발송 이력 저장 (Notification 테이블)

### 이메일 템플릿

- **React Email**: JSX로 템플릿 작성
- **템플릿 종류**: SR 생성, 상태 변경, 완료, 댓글, 리포트
- **다국어**: 한국어 (향후 영어 지원)

> **구현 상세**: 알림 발송 코드, 이메일 템플릿은 [LLD.md](LLD.md) 참조

---

## 백그라운드 작업 전략

### Inngest 선택 이유

- **Type-safe**: TypeScript 지원, 함수 정의 타입 안전
- **재시도 로직**: 자동 재시도, 에러 핸들링
- **Cron Jobs**: 스케줄링 작업 지원
- **Vercel 통합**: Serverless 환경 최적화
- **무료 플랜**: 10,000 steps/month

### 백그라운드 작업 종류

| 작업 | 트리거 | 실행 주기 | 용도 |
|------|--------|-----------|------|
| **일일 리포트** | Cron | 매일 오전 9시 | SR 현황 이메일 발송 |
| **만료 알림** | Cron | 매일 오전 10시 | 예상 완료일 D-1, D-3 알림 |
| **파일 정리** | Cron | 매일 새벽 2시 | 30일 지난 삭제된 파일 제거 |
| **이메일 재시도** | Event | 즉시 | 발송 실패한 이메일 재시도 |
| **데이터 동기화** | Event | 즉시 | 외부 시스템 연동 (선택 사항) |

### Cron 작업 스케줄

```typescript
// 일일 리포트: 매일 오전 9시 (KST)
schedule: "0 9 * * *"

// 만료 알림: 매일 오전 10시 (KST)
schedule: "0 10 * * *"

// 파일 정리: 매일 새벽 2시 (KST)
schedule: "0 2 * * *"
```

### 재시도 전략

1. **자동 재시도**: 3회 (1분, 5분, 10분 간격)
2. **에러 핸들링**: Sentry로 에러 보고
3. **Dead Letter Queue**: 실패한 작업 별도 저장

> **구현 상세**: Inngest 함수 정의, 스케줄링 코드는 [LLD.md](LLD.md) 참조

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
- 브라우저 API (window, document)
- 실시간 업데이트 (WebSocket, Polling)

**패턴**:
```
Server Component (Page)
  ├── Server Component (Header)
  ├── Client Component (Interactive Form)
  └── Server Component (Footer)
```

### 상태 관리 전략

| 상태 종류 | 관리 방법 | 용도 |
|-----------|-----------|------|
| **Server State** | React Query (TanStack Query) | API 데이터, 캐싱 |
| **UI State** | Zustand | 모달, 사이드바, 알림 |
| **Form State** | React Hook Form | 폼 입력, 검증 |
| **URL State** | Next.js Router (searchParams) | 필터, 페이지네이션 |

**선택 이유**:
- **React Query**: 캐싱, 자동 재페칭, Optimistic Updates
- **Zustand**: 경량, 간단한 API, TypeScript 지원
- **React Hook Form**: 성능 우수, Zod 통합

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
└── api/                       # Route Handlers (외부 API, Webhooks)
    ├── auth/
    └── webhooks/
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

| 메트릭 | 목표 | 측정 도구 |
|--------|------|-----------|
| **TTFB** (Time To First Byte) | < 200ms | Vercel Analytics |
| **FCP** (First Contentful Paint) | < 1.5s | Lighthouse |
| **LCP** (Largest Contentful Paint) | < 2.5s | Lighthouse |
| **TTI** (Time To Interactive) | < 3.5s | Lighthouse |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| **API 응답 시간** | < 500ms | Axiom |

### 캐싱 전략

1. **Next.js Cache**
   - **Full Route Cache**: 정적 페이지 (빌드 시 생성)
   - **Data Cache**: `fetch()` 자동 캐싱
   - **Router Cache**: 클라이언트 사이드 캐싱

2. **Redis Cache**
   - API 응답 캐싱
   - 자주 조회되는 데이터 (클라이언트 목록, 사용자 정보)
   - TTL: 5분~1시간

3. **CDN Cache**
   - 정적 자산 (이미지, CSS, JS)
   - Vercel Edge Network
   - 전역 캐싱

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
   - Supabase PgBouncer
   - `connection_limit=1` (Serverless)

3. **Read Replica** (선택 사항)
   - 읽기 전용 복제본 (Supabase Pro 플랜)

> **구현 상세**: 캐싱 코드, 최적화 설정은 [LLD.md](LLD.md) 참조

---

## 테스팅 전략

### 테스트 범위

| 테스트 종류 | 도구 | 범위 | 목표 커버리지 |
|-------------|------|------|---------------|
| **Unit Test** | Vitest | 유틸 함수, 헬퍼 | 80% |
| **Integration Test** | Vitest | Server Actions, API | 70% |
| **E2E Test** | Playwright | 주요 사용자 흐름 | 주요 시나리오 |
| **Component Test** | Vitest + Testing Library | React 컴포넌트 | 60% |

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
   - DB 상호작용 (Mock DB 사용)
   - 권한 체크

3. **E2E Test**: 사용자 시나리오
   - 로그인 → SR 생성 → 상태 변경 → 완료
   - SR 목록 조회, 필터링
   - 파일 업로드

4. **Component Test**: UI 컴포넌트
   - 버튼 클릭
   - 폼 입력
   - 모달 열기/닫기

### CI/CD 통합

- **GitHub Actions**: PR마다 자동 테스트
- **병렬 실행**: Unit, Integration, E2E 동시 실행
- **실패 시 배포 차단**: 테스트 실패 시 배포 불가

> **구현 상세**: 테스트 코드, 설정 파일은 [LLD.md](LLD.md) 참조

---

## 배포 전략

### 환경 구성

| 환경 | 용도 | 배포 방법 | URL |
|------|------|-----------|-----|
| **Development** | 로컬 개발 | `pnpm dev` | http://localhost:3000 |
| **Preview** | PR 리뷰 | GitHub PR 자동 배포 | `https://sr-*.vercel.app` |
| **Production** | 운영 | `main` 브랜치 자동 배포 | `https://sr.example.com` |

### CI/CD 파이프라인

```
┌─────────────┐
│  Git Push   │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────┐
│    GitHub Actions           │
│  1. Lint (ESLint)           │
│  2. Type Check (tsc)        │
│  3. Unit Tests (Vitest)     │
│  4. Build (Next.js)         │
└──────┬──────────────────────┘
       │
       ↓ (성공 시)
┌─────────────────────────────┐
│    Vercel Deploy            │
│  1. Build & Deploy          │
│  2. E2E Tests (Playwright)  │
│  3. Lighthouse Score        │
└──────┬──────────────────────┘
       │
       ↓ (성공 시)
┌─────────────────────────────┐
│    Production Live          │
└─────────────────────────────┘
```

### GitHub Actions 워크플로우

**트리거**:
- `push` (main 브랜치)
- `pull_request` (모든 브랜치)

**작업 순서**:
1. **Lint & Type Check**: 코드 품질 검증
2. **Unit Tests**: 유닛 테스트 실행
3. **Build**: Next.js 빌드
4. **Deploy**: Vercel 배포 (성공 시)
5. **E2E Tests**: Playwright 테스트 (배포 후)

### 배포 전략

1. **자동 배포**: main 브랜치 push 시 자동 배포
2. **Preview 배포**: PR 생성 시 Preview 환경 자동 생성
3. **Rollback**: Vercel Dashboard에서 이전 버전 Rollback 가능
4. **Blue-Green Deployment**: Vercel 자동 지원 (무중단 배포)

### 환경 변수 관리

- **Vercel Dashboard**: 환경별 환경 변수 관리
- **환경별 분리**: Development, Preview, Production
- **비밀 관리**: Vercel Secrets (민감한 정보)

### 데이터베이스 마이그레이션

- **Production**: `prisma migrate deploy` (CI/CD에서 자동 실행)
- **Rollback**: 수동 마이그레이션 필요 (Prisma 한계)

> **구현 상세**: GitHub Actions YAML, 배포 스크립트는 [LLD.md](LLD.md) 참조

---

## 모니터링 및 로깅 전략

### Sentry (에러 모니터링)

**모니터링 대상**:
- **Server Errors**: Server Actions, Route Handlers 에러
- **Client Errors**: React 컴포넌트 에러
- **Performance**: API 응답 시간, 렌더링 시간
- **Breadcrumbs**: 에러 발생 전 사용자 행동 추적

**알림 설정**:
- **Critical**: Slack, 이메일 즉시 알림
- **High**: 1시간 내 알림
- **Medium/Low**: 일일 리포트

**에러 그룹핑**:
- 동일 에러 그룹화
- 빈도 높은 에러 우선순위

**Release Tracking**:
- 배포 버전별 에러 추적
- 소스맵 업로드 (에러 위치 정확)

---

### Axiom (로그 집계)

**로깅 대상**:
- **API 요청/응답**: URL, Method, Status, 응답 시간
- **DB 쿼리**: 쿼리 내용, 실행 시간
- **인증**: 로그인, 로그아웃, 권한 체크
- **비즈니스 이벤트**: SR 생성, 상태 변경, 완료

**로그 구조**:
```json
{
  "timestamp": "2025-11-07T10:00:00Z",
  "level": "info",
  "message": "SR created",
  "data": {
    "srId": "abc123",
    "userId": "user1",
    "clientId": "client1"
  }
}
```

**로그 레벨**:
- `error`: 에러 발생
- `warn`: 경고 (예: Rate Limit 접근)
- `info`: 정보 (예: SR 생성)
- `debug`: 디버깅 (개발 환경만)

**쿼리 및 대시보드**:
- 에러 빈도, API 응답 시간 차트
- SR 생성 추이, 상태별 분포

---

### Vercel Analytics

**모니터링 메트릭**:
- **Web Vitals**: LCP, FID, CLS, TTFB
- **Page Views**: 페이지별 조회 수
- **Performance Score**: Lighthouse 점수

**알림**:
- 성능 저하 시 알림 (LCP > 3s)

---

### 로깅 전략

1. **구조화된 로그**: JSON 형식
2. **로그 레벨**: error, warn, info, debug
3. **컨텍스트 포함**: 사용자 ID, SR ID, 요청 ID
4. **민감 정보 제외**: 비밀번호, 토큰 등
5. **로그 보관**: 30일 (Axiom 무료 플랜)

> **구현 상세**: Sentry, Axiom 설정 코드는 [LLD.md](LLD.md) 참조

---

## 성능 요구사항 및 벤치마크

### 응답 시간 요구사항

| API | 목표 응답 시간 | 허용 최대 시간 |
|-----|---------------|----------------|
| **SR 목록 조회** | < 300ms | < 500ms |
| **SR 상세 조회** | < 200ms | < 400ms |
| **SR 생성** | < 500ms | < 1s |
| **SR 수정** | < 500ms | < 1s |
| **SR 삭제** | < 300ms | < 500ms |
| **파일 업로드** | < 2s | < 5s (10MB) |
| **통계 조회** | < 500ms | < 1s |
| **검색** | < 500ms | < 1s |

### 처리량 요구사항

| 메트릭 | 목표 | 비고 |
|--------|------|------|
| **동시 사용자** | 100명 | 피크 시간대 |
| **API 호출** | 1,000 requests/min | 평균 |
| **SR 생성** | 50 SRs/hour | 피크 시간대 |
| **파일 업로드** | 20 uploads/min | 평균 |

### 데이터베이스 성능

| 쿼리 | 목표 실행 시간 | 최적화 방법 |
|------|---------------|-------------|
| **SR 목록 (페이지네이션)** | < 100ms | 인덱스 (createdAt, status) |
| **SR 상세 (include 사용)** | < 150ms | include 최소화 |
| **통계 (COUNT, GROUP BY)** | < 300ms | 인덱스, 캐싱 |
| **검색 (LIKE 쿼리)** | < 500ms | Full-text search (향후) |

### 프론트엔드 성능

| 메트릭 | 목표 | 측정 도구 |
|--------|------|-----------|
| **번들 크기 (First Load JS)** | < 200KB | Next.js 빌드 리포트 |
| **Lighthouse Score** | > 90 | Lighthouse CI |
| **Time To Interactive** | < 3.5s | Lighthouse |
| **First Contentful Paint** | < 1.5s | Lighthouse |

### 벤치마크 계획

1. **정기 성능 테스트**
   - 매주 Lighthouse CI 실행
   - API 응답 시간 모니터링 (Axiom)

2. **부하 테스트**
   - 100명 동시 사용자 시뮬레이션 (k6)
   - 1,000 requests/min 부하 테스트

3. **데이터베이스 성능 테스트**
   - 1만 개 SR 데이터 생성
   - 쿼리 실행 시간 측정

4. **최적화 우선순위**
   - 느린 쿼리 → 인덱스 추가
   - 큰 번들 → Code Splitting
   - 높은 API 응답 시간 → 캐싱

> **구현 상세**: 부하 테스트 스크립트, 성능 모니터링 코드는 [LLD.md](LLD.md) 참조

---

## 부록

### 참고 문서

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js v5 Documentation](https://authjs.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Inngest Documentation](https://www.inngest.com/docs)
- [Sentry Documentation](https://docs.sentry.io/)
- [Axiom Documentation](https://axiom.co/docs)

### 관련 문서

- **[PRD.md](SR_Management_System_PRD.md)**: 비즈니스 요구사항, 기능 정의
- **[DB.md](DB.md)**: 데이터베이스 설계, Prisma 스키마
- **[LLD.md](LLD.md)**: 구현 상세, 코드 예제, API 엔드포인트
- **[API.md](API.md)** (선택 사항): API 레퍼런스 문서

### 용어 정의

| 용어 | 설명 |
|------|------|
| **SR** | Service Request (서비스 요청) |
| **RBAC** | Role-Based Access Control (역할 기반 접근 제어) |
| **JWT** | JSON Web Token |
| **SSR** | Server-Side Rendering |
| **RSC** | React Server Components |
| **TTFB** | Time To First Byte |
| **LCP** | Largest Contentful Paint |
| **CLS** | Cumulative Layout Shift |
| **CI/CD** | Continuous Integration / Continuous Deployment |

### 변경 이력 추적

- 모든 변경 사항은 Git 커밋으로 추적
- 주요 변경 사항은 문서 개정 이력에 기록
- 구현 변경 사항은 [LLD.md](LLD.md)에 기록

---

**문서 종료**

본 문서는 SR 관리 시스템의 **기술적 요구사항**을 정의합니다. 구체적인 구현 상세는 **[LLD.md](LLD.md)**를 참조하십시오.

**요약**: TRD는 "무엇을, 왜 선택했는가"에 집중하며, 기술 스택 선택 이유, 아키텍처 원칙, 성능 요구사항, 배포 전략을 다룹니다. 구현 코드는 LLD.md에서 관리합니다.
