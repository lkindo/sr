# SR Management System - Low-Level Design (LLD)

**문서 버전:** 1.2
**작성일:** 2025-11-06
**최종 수정일:** 2026-07-30
**프로젝트:** SR 관리 시스템
**기술 스택:** Next.js 16 (App Router) + PostgreSQL 16 컨테이너 + 자체 서버(Docker Compose + nginx)

---

> **⚠️ 이 문서의 이력에 대하여 (2026-07-30 정정)**
>
> 이 문서의 초안(1.0/1.1)은 **Vercel + Upstash Redis + Vercel Blob + Resend +
> React Email + Inngest + Sentry** 를 전제로 작성되었다. **그중 어느 것도 채택되지 않았다.**
> 실제 운영 스택은 다음과 같다(2026-07-30 실측).
>
> | 영역        | 실제 채택                                                                   | 초안이 적었던 것(미채택) |
> | ----------- | --------------------------------------------------------------------------- | ------------------------ |
> | 프레임워크  | Next.js 16.1.6 (App Router), React 19.2.4                                   | Next.js 14.x             |
> | 런타임      | Node 22.x (`package.json` engines), pnpm 10                                 | Vercel Functions         |
> | DB          | PostgreSQL 16 (`postgres:16-alpine` 컨테이너, named volume)                 | 외부 관리형 PostgreSQL   |
> | 커넥션 풀러 | 없음 (Prisma 6.19 가 DB에 직접 연결)                                        | PgBouncer                |
> | 인증        | NextAuth/Auth.js v5(5.0.0-beta.32), JWT 세션, bcryptjs                      | —                        |
> | 파일 저장   | 서버 디스크 `STORAGE_DIR=/app/var/uploads` (컨테이너 볼륨)                  | Vercel Blob              |
> | 캐시        | 프로세스 내 캐시(`src/lib/cache.ts`)                                        | Upstash Redis            |
> | 백그라운드  | `src/lib/wait-until.ts` 의 `backgroundTask` (응답 후 실행)                  | Inngest                  |
> | 이메일      | nodemailer 7.0 (SMTP)                                                       | Resend + React Email     |
> | 웹 푸시     | web-push 3.6 (VAPID)                                                        | —                        |
> | 실시간      | 자체 SSE (`/api/realtime`)                                                  | —                        |
> | 배포        | 자체 서버(Oracle Cloud VM) + Docker Compose + nginx:alpine                  | Vercel                   |
> | 에러 추적   | **없음** (pino → stdout). Sentry 는 2026-07-30 미사용 결정, Axiom 도 미채택 | Sentry / Axiom           |
>
> 아래 본문에서 **구현이 확인된 절**(디렉토리 구조, DB 클라이언트, 알림 파이프라인, 파일 저장소,
> 캐싱, 에러 처리, 테스트 전략, 배포/CI)은 실제 구현 파일을 읽어 현재 코드로 교체했다.
> 그 외의 코드 예시(Server Actions / 컴포넌트 / 서비스 레이어 등)는 **설계 의도를 담은 초안**
> 이며 실제 파일과 구조·이름이 다르다. 각 절 머리에 어떤 파일이 실물인지 표기했다.
>
> 관련 정정 이력: `docs/SR_Management_System_PRD.md`(알림 절, 흐름도, 비용/환경 구성 배너).

---

## 📚 문서 간 참조 가이드

| 문서                                      | 역할              | 주요 내용                           |
| ----------------------------------------- | ----------------- | ----------------------------------- |
| **[PRD.md](SR_Management_System_PRD.md)** | 비즈니스 요구사항 | 기능 정의, 사용자 역할, SR 프로세스 |
| **[DB.md](DB.md)**                        | 데이터베이스 설계 | Prisma 스키마, ERD, 테이블 명세     |
| **[TRD.md](TRD.md)**                      | 기술 명세         | 아키텍처, 기술 스택, 배포 전략      |
| **[LLD.md](LLD.md)**                      | 구현 상세         | **코드, 컴포넌트, 테스트 전략** ⭐  |

**권장 읽는 순서**: PRD → DB → TRD → LLD

---

## 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [데이터베이스 설계](#데이터베이스-설계)
4. [API 설계](#api-설계)
5. [컴포넌트 설계](#컴포넌트-설계)
6. [인증 및 권한](#인증-및-권한)
7. [비즈니스 로직](#비즈니스-로직)
8. [알림 시스템](#알림-시스템)
9. [파일 저장소](#파일-저장소)
10. [캐싱 전략](#캐싱-전략)
11. [에러 처리](#에러-처리)
12. [성능 최적화](#성능-최적화)
13. [보안](#보안)
14. [테스트 전략](#테스트-전략)
15. [배포 및 CI/CD](#배포-및-cicd)

---

## 개요

### 문서 목적

이 문서는 SR 관리 시스템의 Low-Level Design을 정의합니다. PRD와 TRD에서 정의된 요구사항과 기술 스택을 바탕으로 실제 구현 수준의 상세 설계를 제공합니다.

### 설계 원칙

1. **Single-Node Container**: 단일 호스트의 Docker Compose(app + db + nginx)를 전제로 한 설계.
   상시 구동 Node 프로세스이므로 프로세스 내 상태(메모리 캐시, rate limit 버킷, SSE 연결)를
   사용할 수 있다. 다중 인스턴스로 확장하면 이 전제들이 먼저 깨진다.
2. **Type Safety**: TypeScript를 활용한 타입 안전성
3. **Performance**: React Server Components와 캐싱 최적화
4. **Maintainability**: 모듈화된 구조와 명확한 관심사 분리
5. **Security**: 다층 보안 및 권한 관리

> **초안과 달라진 점**: 1.0/1.1 은 원칙 1을 "Serverless-First: Vercel Functions에 최적화된
> 설계", 원칙 4를 "Scalability: Stateless 아키텍처와 Connection Pooling" 으로 적었다.
> Vercel 은 채택되지 않았고, 커넥션 풀러도 없으며, 앱은 stateless 가 아니다
> (메모리 캐시·rate limit·SSE 가 프로세스에 붙어 있다). 미래에 수평 확장을 하려면
> 이 세 가지를 외부화하는 작업이 선행되어야 한다.

---

## 시스템 아키텍처

### 계층 구조

시스템의 전체 아키텍처 및 레이어드 아키텍처에 대한 고수준 설명은 **[TRD.md](./TRD.md)** 문서를 참조하십시오. LLD에서는 아래의 상세 디렉토리 구조를 통해 구현 레벨의 구조를 설명합니다.

### 디렉토리 구조 상세

아래 트리는 2026-07-30 저장소를 실제로 열거해 작성했다(디렉토리는 2~3단계까지만 표기).
`src/server/`, `src/inngest/`, `src/store/`, `emails/`, `tests/` 는 **존재하지 않는다** —
초안이 계획했으나 그 형태로 만들어지지 않았다(아래 "초안과의 차이" 참고).

```
sr/
├── prisma/
│   ├── schema.prisma                 # Prisma 스키마 (Single Source of Truth)
│   ├── migrations/                   # DB 마이그레이션 (prisma migrate deploy 로 적용)
│   └── seed.ts                       # 기준 데이터 + 개발용 픽스처 시딩
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # 인증 라우트 그룹 (login, register, layout)
│   │   ├── (dashboard)/              # 대시보드 라우트 그룹
│   │   │   ├── dashboard/            # 메인 대시보드
│   │   │   ├── srs/                  # SR 목록 / [id] 상세
│   │   │   ├── my-requests/          # 내 요청
│   │   │   ├── clients/              # 고객사
│   │   │   ├── users/                # 사용자
│   │   │   ├── roles/                # 역할/권한 관리
│   │   │   ├── organization/         # 조직
│   │   │   ├── settings/             # 설정(알림 구독 등)
│   │   │   ├── MainContent.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/   # NextAuth(Auth.js v5) 핸들러
│   │   │   ├── srs/                  # SR REST API
│   │   │   │   └── [id]/             # activities, attachments, comments,
│   │   │   │                         # intake, status, status-history
│   │   │   ├── attachments/          # 첨부 다운로드(인증 필수)
│   │   │   ├── clients/ users/ roles/ permissions/ service-categories/
│   │   │   ├── dashboard/stats/      # 대시보드 집계
│   │   │   ├── reports/              # 보고서
│   │   │   ├── profile/ settings/    # 프로필 / 알림 설정
│   │   │   ├── push/                 # web-push 구독·VAPID 키·테스트 발송
│   │   │   ├── realtime/             # 자체 SSE 스트림
│   │   │   └── health/               # 헬스체크
│   │   ├── layout.tsx  page.tsx  error.tsx  not-found.tsx
│   │   ├── globals.css               # Tailwind 엔트리
│   │   └── manifest.json             # PWA 매니페스트(웹 푸시용)
│   │
│   ├── components/
│   │   ├── ui/                       # Shadcn/ui + Radix 기반 프리미티브
│   │   ├── srs/ clients/ users/ roles/ dashboard/ organization/ profile/
│   │   ├── auth/ layout/ loading/    # 인증 UI, 셸, 로딩 스켈레톤
│   │   └── providers/                # react-query 등 클라이언트 프로바이더
│   │
│   ├── actions/                      # Server Actions ('use server')
│   │   ├── sr.actions.ts  client.actions.ts  user.actions.ts
│   │   ├── role.actions.ts  permission.actions.ts
│   │   ├── service-category.actions.ts
│   │   └── sr-form.utils.ts
│   │
│   ├── services/                     # 비즈니스 로직 (클래스 + 싱글톤 레지스트리)
│   │   ├── sr.service.ts  client.service.ts  user.service.ts
│   │   ├── role.service.ts  permission.service.ts  service-category.service.ts
│   │   ├── email.service.ts          # nodemailer(SMTP) 발송 + 인라인 HTML 템플릿
│   │   ├── push.service.ts           # web-push(VAPID)
│   │   ├── audit.service.ts          # 감사 로그
│   │   ├── service-registry.ts       # 싱글톤 + 도메인 이벤트 리스너 등록
│   │   └── listeners/
│   │       └── sr-notification.listener.ts  # 도메인 이벤트 → 이메일/푸시
│   │
│   ├── lib/
│   │   ├── prisma.ts                 # PrismaClient 싱글톤 + $transaction 이벤트 래퍼
│   │   ├── domain-events.ts          # 프로세스 내 도메인 이벤트 버스(EventEmitter)
│   │   ├── transaction-context.ts    # AsyncLocalStorage 트랜잭션 컨텍스트
│   │   ├── realtime-events.ts        # SSE 이벤트 발행
│   │   ├── wait-until.ts             # backgroundTask (응답 후 백그라운드 실행)
│   │   ├── cache.ts                  # unstable_cache 기반 캐시 (Redis 없음)
│   │   ├── storage.ts                # 로컬 디스크 첨부 저장 (STORAGE_DIR)
│   │   ├── logger.ts                 # pino → stdout 구조화 로깅
│   │   ├── rate-limiter.ts           # 메모리 토큰 버킷 + 프리셋
│   │   ├── api-rate-limit.ts  api-error-handler.ts  api-helpers.ts
│   │   ├── auth-wrapper.ts  permissions.ts  permission-helpers.ts  policies.ts
│   │   ├── sr-state-machine.ts       # SR 상태 전이 규칙
│   │   ├── schemas.ts                # Zod 스키마
│   │   ├── env-validation.ts         # 부팅 시 환경변수 fail-fast 검증
│   │   ├── errors.ts  result.ts  security.ts  file-validator.ts
│   │   └── serialization.ts  pagination.ts  date-utils.ts  utils.ts …
│   │
│   ├── hooks/                        # use-sr, use-sr-infinite, use-permissions,
│   │                                 # use-push-notifications, use-realtime-status …
│   ├── types/                        # sr.types.ts, session.ts, next-auth.d.ts …
│   ├── config/                       # navigation 등 정적 설정
│   ├── stories/                      # Storybook 스토리
│   ├── auth.ts  auth.config.ts       # NextAuth(Auth.js v5) 설정
│   ├── proxy.ts                      # 미들웨어(요청 게이트, rate limit)
│   └── instrumentation.ts            # 부팅 훅 (환경변수 검증 fail-fast)
│
├── e2e/                              # Playwright 스펙 (01~31 + roles/, helpers/)
├── nginx/                            # nginx.conf, certs (리버스 프록시)
├── scripts/                          # backup/restore/setup-letsencrypt, stryker-ci …
├── public/                           # 정적 자산, 서비스 워커
├── .github/workflows/                # ci-cd.yml, deploy.yml, e2e.yml, backup.yml …
├── Dockerfile  docker-entrypoint.sh  # 앱 이미지 (migrate deploy 후 start)
├── docker-compose.yml                # 로컬
├── docker-compose.test.yml           # 스테이징(dev 브랜치)
├── docker-compose.prod.yml           # 운영(main 브랜치)
├── .env.example                      # 환경 변수 템플릿
├── next.config.ts  tailwind.config.ts  tsconfig.json
├── vitest.config.ts  vitest.stryker.config.ts  stryker.config.mjs
├── playwright.config.ts
├── package.json                      # pnpm 10 / Node 22.x
└── README.md
```

**초안과의 차이 (전부 초안이 미채택 스택을 전제한 결과다)**

| 초안의 경로                                                | 실제                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/app/api/inngest/route.ts`                             | 없음. 백그라운드는 `src/lib/wait-until.ts` 의 `backgroundTask`          |
| `src/inngest/**`                                           | 없음. 이벤트 버스는 `src/lib/domain-events.ts`                          |
| `src/lib/redis.ts`                                         | 없음. `src/lib/cache.ts`(프로세스 내) + `src/lib/rate-limiter.ts`       |
| `src/lib/storage.ts` (Vercel Blob)                         | 같은 경로지만 로컬 디스크 구현(`STORAGE_DIR`)                           |
| `src/lib/db.ts`                                            | `src/lib/prisma.ts`                                                     |
| `src/server/actions/**`                                    | `src/actions/*.actions.ts`                                              |
| `src/server/services/**`                                   | `src/services/*.service.ts`                                             |
| `src/server/email/templates/**`, `emails/**` (React Email) | 없음. HTML 문자열이 `src/services/email.service.ts` 안에 인라인         |
| `src/store/**` (Zustand)                                   | 없음. Zustand 는 의존성에 없다(서버 상태는 react-query, UI 상태는 로컬) |
| `src/components/{forms,tables,charts,sr,layouts}/`         | 도메인별 디렉토리(`srs/`, `clients/`, …)로 구성                         |
| `tests/{unit,integration,e2e}/`                            | 단위 테스트는 소스 옆 `src/**/__tests__/`, E2E 는 루트 `e2e/`           |

---

## 데이터베이스 설계

데이터베이스의 전체 스키마, ERD, 테이블 명세, 인덱스 전략 등은 데이터베이스 설계의 Single Source of Truth인 **[DB.md](./DB.md)** 문서를 참조하십시오.

### DB 연결 설정

> **정정(2026-07-30)**: 이 절은 원래 "Connection Pooling 설정" 이라는 제목으로
> 외부 관리형 데이터베이스 서비스의 호스트와 PgBouncer 포트(6543)를 적고 있었다.
> **그 관리형 서비스도 PgBouncer 도 쓰지 않는다.**
> DB 는 앱과 같은 호스트에서 도는 `postgres:16-alpine` 컨테이너이고, Prisma 가 내부 브리지
> 네트워크(`sr-net`)로 직접 연결한다. 커넥션 풀러는 없다.
> `DATABASE_URL` / `DIRECT_URL` 두 변수는 코드에 남아 있고 둘 다 필수다
> (`src/lib/env-validation.ts` — 값이 `postgresql://` 로 시작해야 한다).
> `DIRECT_URL` 은 마이그레이션 경로를 풀러 우회용으로 분리해 두었던 초기 설계의 잔재다.

**환경 변수 형태** (실제 값은 서버의 `/home/opc/sr/.env.docker` 에 있고 GitHub Secrets
`PROD_ENV_DOCKER_B64` 로부터 배포 시 기록된다 — `.github/workflows/deploy.yml`.
**저장소에서는 확인할 수 없으므로, 아래는 compose 네트워크 구조에서 도출한 형태이며 실측값이 아니다.**):

```bash
# 앱 → DB. 호스트는 compose 서비스명(db), 포트는 컨테이너 내부 5432가 된다.
DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>?schema=public"
# 마이그레이션용. 풀러가 없으므로 DATABASE_URL 과 실질적으로 같은 경로를 가리킨다.
DIRECT_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>?schema=public"
```

DB 포트는 호스트로 공개하지 않는다(`docker-compose.prod.yml` 의 `ports` 는 주석 처리되어 있고,
관리 접근은 SSH 터널 또는 `docker exec` 로만 한다). 데이터는 named volume `sr_db_data` 에 남는다.

**src/lib/prisma.ts** (실제 구현. 파일명이 `lib/db.ts` 가 아니다):

```typescript
import { PrismaClient } from '@prisma/client';

import { transactionLocalStorage } from './transaction-context';

const prismaClientSingleton = () => {
  // 빌드 타임에는 DATABASE_URL이 없을 수 있으므로 체크
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set, Prisma client will not be initialized');
    return null;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: { db: { url: process.env.DATABASE_URL! } },
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// $transaction 을 감싸 트랜잭션 중 발행된 도메인/실시간 이벤트를 모아 두고,
// 커밋이 성공한 뒤에만 실제로 emit 한다(롤백 시 유령 알림 방지).
if (prisma) {
  const originalTransaction = prisma.$transaction.bind(prisma);

  prisma.$transaction = async function (arg1: any, arg2: any) {
    const context = { domainEvents: [] as any[], realtimeEvents: [] as any[] };

    const result = await transactionLocalStorage.run(context, async () => {
      return await originalTransaction(arg1, arg2);
    });

    if (context.domainEvents.length > 0) {
      const { domainEvents } = await import('./domain-events');
      context.domainEvents.forEach(({ eventName, args }) => {
        domainEvents.emit(eventName, ...args);
      });
    }

    if (context.realtimeEvents.length > 0) {
      const { emitRealtimeEvent } = await import('./realtime-events');
      context.realtimeEvents.forEach(({ event, data }) => {
        emitRealtimeEvent(event, data);
      });
    }

    return result;
  } as any;
}

export default prisma ?? ({} as PrismaClient);
```

개발 환경에서는 같은 파일이 Prisma 미들웨어로 느린 쿼리(`PRISMA_SLOW_MS`, 기본 200ms)를
경고 로그로 남기며, 선택적으로 `PRISMA_SLOW_LOG_FILE` 에 append 한다.

---

## API 설계

### Server Actions 설계

#### SR Management Actions

> **⚠️ 아래 예시는 초안이며 현재 구현과 구조가 다르다.**
> 실물은 `src/actions/sr.actions.ts`(얇은 Server Action 층) + `src/services/sr.service.ts`
> (검증·권한·트랜잭션·이벤트 발행)로 분리되어 있고, `db` 대신 `src/lib/prisma.ts` 의 기본
> export 를, `@/lib/auth/permissions` 대신 `src/lib/permissions.ts` / `src/lib/policies.ts` /
> `src/lib/auth-wrapper.ts` 를 사용한다. 상태 전이 규칙은 이 파일에 인라인된 형태가 아니라
> `src/lib/sr-state-machine.ts` 에 있다.
> **알림 트리거만은 실제 구현으로 교체했다**(초안은 `inngest.send()` 를 호출했다 — Inngest 는
> 채택되지 않았다). 나머지 흐름은 설계 의도를 보이기 위해 초안 그대로 남긴다.

**초안: server/actions/sr.ts** (실물: `src/actions/sr.actions.ts` + `src/services/sr.service.ts`):

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requirePermission, checkSROwnership } from '@/lib/auth/permissions';
// 실제 구현: 알림은 프로세스 내 도메인 이벤트 버스로 발행한다(외부 큐 없음).
import { domainEvents } from '@/lib/domain-events';
import { SRStatus, SRPriority } from '@prisma/client';

// ============================================================================
// Validation Schemas
// ============================================================================

const createSRSchema = z.object({
  title: z.string().min(5, '제목은 최소 5자 이상이어야 합니다').max(200),
  description: z.string().min(20, '설명은 최소 20자 이상이어야 합니다'),
  clientId: z.string().cuid(),
  serviceCategoryId: z.string().cuid('서비스 카테고리를 선택해주세요'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
});

const updateSRSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(20).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  status: z
    .enum(['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'])
    .optional(),
  assigneeId: z.string().cuid().nullable().optional(),
});

const assignSRSchema = z.object({
  srId: z.string().cuid(),
  assigneeId: z.string().cuid(),
});

const updateSRStatusSchema = z.object({
  srId: z.string().cuid(),
  status: z.enum([
    'REQUESTED',
    'INTAKE',
    'IN_PROGRESS',
    'ON_HOLD',
    'COMPLETED',
    'CONFIRMED',
    'REJECTED',
  ]),
  reason: z.string().optional(),
});

// ============================================================================
// SR CRUD Operations
// ============================================================================

export async function createSR(input: z.infer<typeof createSRSchema>) {
  const session = await requirePermission('sr:create');
  const validated = createSRSchema.parse(input);

  // 고객사 접근 권한 체크
  const hasAccess = await checkClientAccess(session.user.id, validated.clientId);
  if (!hasAccess) {
    throw new Error('해당 고객사에 대한 권한이 없습니다');
  }

  // SR 번호 생성
  const srNumber = await generateSRNumber(validated.clientId);

  // SLA 마감일 계산
  const dueDate = calculateSLADeadline(validated.priority as SRPriority);

  // SR 생성
  const sr = await db.sR.create({
    data: {
      srNumber,
      title: validated.title,
      description: validated.description,
      clientId: validated.clientId,
      requesterId: session.user.id,
      priority: validated.priority as SRPriority,
      serviceCategoryId: validated.serviceCategoryId,
      dueDate,
      activities: {
        create: {
          type: 'CREATED',
          description: `SR이 생성되었습니다`,
          userId: session.user.id,
        },
      },
    },
    include: {
      client: true,
      requester: true,
    },
  });

  // 알림 트리거 — 실제 구현(src/services/sr.service.ts:232).
  // $transaction 안에서 emit 하면 src/lib/prisma.ts 래퍼가 커밋 후로 발행을 미룬다.
  // 페이로드는 src/lib/domain-events.ts 의 SRCreatedEvent 계약이며 이 5개 필드뿐이다.
  domainEvents.emit('sr:created', {
    srId: sr.id,
    srNumber: sr.srNumber,
    title: sr.title,
    requesterId: session.user.id,
    requesterName: session.user.name || '알 수 없음',
  });

  revalidatePath('/srs');
  revalidatePath('/dashboard');

  return { success: true, data: sr };
}

export async function getSRById(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const sr = await db.sR.findUnique({
    where: { id },
    include: {
      client: true,
      requester: {
        select: { id: true, name: true, email: true, image: true },
      },
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      activities: {
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!sr) {
    throw new Error('SR을 찾을 수 없습니다');
  }

  // 권한 체크: 해당 SR의 요청자, 담당자, 또는 관리자만 조회 가능
  const hasPermission = await checkPermission(session.user.id, 'sr:read');
  const isOwner = await checkSROwnership(session.user.id, id);

  if (!hasPermission && !isOwner) {
    throw new Error('권한이 없습니다');
  }

  return sr;
}

export async function getSRs(params: {
  clientId?: string;
  status?: SRStatus;
  priority?: SRPriority;
  assigneeId?: string;
  requesterId?: string;
  page?: number;
  limit?: number;
}) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { clientId, status, priority, assigneeId, requesterId, page = 1, limit = 50 } = params;

  // 권한에 따라 필터링
  const hasAdminPermission = await checkPermission(session.user.id, 'sr:read');

  const where: any = {};

  if (!hasAdminPermission) {
    // 일반 사용자는 자신이 요청했거나 할당받은 SR만 조회
    where.OR = [{ requesterId: session.user.id }, { assigneeId: session.user.id }];
  }

  if (clientId) where.clientId = clientId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assigneeId) where.assigneeId = assigneeId;
  if (requesterId) where.requesterId = requesterId;

  const [srs, total] = await Promise.all([
    db.sR.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true },
        },
        requester: {
          select: { id: true, name: true, email: true },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [
        { priority: 'asc' }, // CRITICAL first
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.sR.count({ where }),
  ]);

  return {
    data: srs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateSR(input: z.infer<typeof updateSRSchema>) {
  const session = await requirePermission('sr:update');
  const validated = updateSRSchema.parse(input);

  // 소유권 또는 권한 체크
  const isOwner = await checkSROwnership(session.user.id, validated.id);
  const hasPermission = await checkPermission(session.user.id, 'sr:update');

  if (!isOwner && !hasPermission) {
    throw new Error('권한이 없습니다');
  }

  const sr = await db.sR.findUnique({ where: { id: validated.id } });
  if (!sr) throw new Error('SR을 찾을 수 없습니다');

  // 변경 사항 추적
  const changes: string[] = [];
  if (validated.title && validated.title !== sr.title) {
    changes.push(`제목 변경: "${sr.title}" → "${validated.title}"`);
  }
  if (validated.priority && validated.priority !== sr.priority) {
    changes.push(`우선순위 변경: ${sr.priority} → ${validated.priority}`);
  }
  if (validated.status && validated.status !== sr.status) {
    changes.push(`상태 변경: ${sr.status} → ${validated.status}`);
  }

  // SR 업데이트
  const updatedSR = await db.sR.update({
    where: { id: validated.id },
    data: {
      ...(validated.title && { title: validated.title }),
      ...(validated.description && { description: validated.description }),
      ...(validated.priority && { priority: validated.priority as SRPriority }),
      ...(validated.status && { status: validated.status as SRStatus }),
      ...(validated.assigneeId !== undefined && { assigneeId: validated.assigneeId }),
      activities: {
        create: {
          type: 'STATUS_CHANGED',
          description: changes.join(', '),
          userId: session.user.id,
          metadata: {
            changes: validated,
          },
        },
      },
    },
    include: {
      client: true,
      requester: true,
      assignee: true,
    },
  });

  revalidatePath(`/srs/${validated.id}`);
  revalidatePath('/srs');
  revalidatePath('/dashboard');

  return { success: true, data: updatedSR };
}

export async function assignSR(input: z.infer<typeof assignSRSchema>) {
  const session = await requirePermission('sr:assign');
  const validated = assignSRSchema.parse(input);

  const sr = await db.sR.findUnique({
    where: { id: validated.srId },
    include: { client: true, requester: true },
  });

  if (!sr) throw new Error('SR을 찾을 수 없습니다');

  const assignee = await db.user.findUnique({
    where: { id: validated.assigneeId },
  });

  if (!assignee) throw new Error('담당자를 찾을 수 없습니다');

  // SR 할당
  const updatedSR = await db.sR.update({
    where: { id: validated.srId },
    data: {
      assigneeId: validated.assigneeId,
      status: 'IN_PROGRESS', // 할당 시 자동으로 진행 중으로 변경
      activities: {
        create: {
          type: 'ASSIGNED',
          description: `${assignee.name}님에게 할당되었습니다`,
          userId: session.user.id,
        },
      },
    },
    include: {
      client: true,
      requester: true,
      assignee: true,
    },
  });

  // 알림 트리거 — 실제 구현(src/services/sr.service.ts:613).
  // 담당 해제(assigneeId=null)도 같은 이벤트로 발행하며, 리스너가 알림을 생략한다.
  domainEvents.emit('sr:assigned', {
    srId: updatedSR.id,
    srNumber: updatedSR.srNumber,
    title: updatedSR.title,
    assigneeId: assignee.id,
    assigneeName: assignee.name,
  });

  revalidatePath(`/srs/${validated.srId}`);
  revalidatePath('/srs');

  return { success: true, data: updatedSR };
}

export async function updateSRStatus(input: z.infer<typeof updateSRStatusSchema>) {
  const session = await requirePermission('sr:update');
  const validated = updateSRStatusSchema.parse(input);

  const sr = await db.sR.findUnique({ where: { id: validated.srId } });
  if (!sr) throw new Error('SR을 찾을 수 없습니다');

  // 상태 전이 검증
  const canTransition = validateStateTransition(sr.status, validated.status as SRStatus, {
    requesterId: sr.requesterId,
    assigneeId: sr.assigneeId,
  });

  if (!canTransition.valid) {
    throw new Error(canTransition.error);
  }

  // 완료 시 완료 시간 기록
  const completedAt = validated.status === 'COMPLETED' ? new Date() : sr.completedAt;

  const updatedSR = await db.sR.update({
    where: { id: validated.srId },
    data: {
      status: validated.status as SRStatus,
      ...(completedAt && { completedAt }),
      activities: {
        create: {
          type: 'STATUS_CHANGED',
          description: `상태 변경: ${sr.status} → ${validated.status}${
            validated.reason ? ` (사유: ${validated.reason})` : ''
          }`,
          userId: session.user.id,
          metadata: {
            oldStatus: sr.status,
            newStatus: validated.status,
            reason: validated.reason,
          },
        },
      },
    },
    include: {
      client: true,
      requester: true,
      assignee: true,
    },
  });

  // 알림 트리거 — 실제 구현(src/services/sr.service.ts:601).
  // 상태별로 이벤트를 나누지 않는다. 단일 'sr:status_changed' 이벤트에 이전/현재 상태를 담고,
  // 수신자 결정과 문구 생성은 리스너(src/services/listeners/sr-notification.listener.ts)가 한다.
  domainEvents.emit('sr:status_changed', {
    srId: updatedSR.id,
    srNumber: updatedSR.srNumber,
    title: updatedSR.title,
    requesterId: updatedSR.requesterId,
    previousStatus: sr.status,
    currentStatus: validated.status as SRStatus,
  });

  revalidatePath(`/srs/${validated.srId}`);
  revalidatePath('/srs');

  return { success: true, data: updatedSR };
}

export async function deleteSR(id: string) {
  const session = await requirePermission('sr:delete');

  const sr = await db.sR.findUnique({ where: { id } });
  if (!sr) throw new Error('SR을 찾을 수 없습니다');

  // 소프트 삭제 또는 완전 삭제 (정책에 따라)
  // 여기서는 완전 삭제 예시
  await db.sR.delete({ where: { id } });

  revalidatePath('/srs');
  revalidatePath('/dashboard');

  return { success: true };
}

// ============================================================================
// Helper Functions
// ============================================================================

// ⚠️ 이 채번 방식은 채택되지 않았다. count() 기반이라 동시 생성 시 같은 번호가 나온다.
// 실제 구현은 sr_sequences 테이블의 원자적 upsert 다 — "비즈니스 로직 > SR Service Layer" 참고.
async function generateSRNumber(clientId: string): Promise<string> {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error('고객사를 찾을 수 없습니다');

  // SR 번호 형식: CLIENT_CODE-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const clientCode = client.code; // Client.code 필드 사용

  // 오늘 생성된 SR 개수 조회
  const count = await db.sR.count({
    where: {
      clientId,
      createdAt: {
        gte: new Date(today.setHours(0, 0, 0, 0)),
        lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    },
  });

  const sequence = String(count + 1).padStart(4, '0');
  return `${clientCode}-${dateStr}-${sequence}`;
}

function calculateSLADeadline(priority: SRPriority): Date {
  const SLA_HOURS: Record<SRPriority, number> = {
    CRITICAL: 4,
    HIGH: 24,
    MEDIUM: 72,
    LOW: 168,
  };

  const hours = SLA_HOURS[priority];
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + hours);
  return deadline;
}

function validateStateTransition(
  currentStatus: SRStatus,
  targetStatus: SRStatus,
  srData: { requesterId: string; assigneeId: string | null }
): { valid: boolean; error?: string } {
  const SR_STATE_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
    REQUESTED: ['INTAKE', 'REJECTED'], // 신청 → 접수 또는 거절
    INTAKE: ['IN_PROGRESS', 'REJECTED'], // 접수 → 진행 중 또는 거절
    IN_PROGRESS: ['COMPLETED', 'ON_HOLD'], // 진행 중 → 완료 또는 보류
    ON_HOLD: ['IN_PROGRESS', 'REJECTED'], // 보류 → 진행 중 또는 거절
    COMPLETED: ['CONFIRMED', 'IN_PROGRESS'], // 완료 → 확인 완료 또는 재오픈
    CONFIRMED: ['IN_PROGRESS'], // 확인 완료 → 재오픈(진행 중)
    REJECTED: [], // 거절은 종단 상태다
  };

  if (!SR_STATE_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
    return {
      valid: false,
      error: `${currentStatus}에서 ${targetStatus}로 변경할 수 없습니다`,
    };
  }

  // IN_PROGRESS는 담당자가 있어야 함
  if (targetStatus === 'IN_PROGRESS' && !srData.assigneeId) {
    return {
      valid: false,
      error: '담당자가 할당되어야 진행 중 상태로 변경할 수 있습니다',
    };
  }

  return { valid: true };
}
```

#### Comment Actions

> **⚠️ 아래 예시는 초안이다.** 댓글은 Server Action 이 아니라 REST 라우트
> `src/app/api/srs/[id]/comments/route.ts` 로 구현되어 있다. 실물은 댓글 생성과 활동 이력을
> 한 `$transaction` 으로 묶고, 그 뒤에 SSE 이벤트(`emitRealtimeEvent`)를 발행하고, 이메일은
> 도메인 이벤트를 거치지 않고 라우트 안에서 직접 `backgroundTask(...)` 로 발송한다.
> 발송 여부는 수신자별 `notificationPreference.emailCommentAdded`(스키마 기본값 `false`)를 따르고,
> 작성자 본인에게는 보내지 않는다. 아래 초안의 `inngest.send()` 호출은 실제 코드로 교체했다.

**초안: server/actions/comment.ts** (실물: `src/app/api/srs/[id]/comments/route.ts`):

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkSROwnership, checkPermission } from '@/lib/auth/permissions';
import { getSRUrl } from '@/lib/app-url';
import { backgroundTask } from '@/lib/wait-until';
import { emailService } from '@/services/email.service';

const createCommentSchema = z.object({
  srId: z.string().cuid(),
  content: z.string().min(1, '댓글 내용을 입력해주세요'),
  isInternal: z.boolean().default(false),
});

const updateCommentSchema = z.object({
  id: z.string().cuid(),
  content: z.string().min(1),
});

export async function createComment(input: z.infer<typeof createCommentSchema>) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const validated = createCommentSchema.parse(input);

  // SR 접근 권한 체크
  const hasAccess = await checkSROwnership(session.user.id, validated.srId);
  if (!hasAccess) {
    throw new Error('권한이 없습니다');
  }

  const comment = await db.sRComment.create({
    data: {
      srId: validated.srId,
      userId: session.user.id,
      content: validated.content,
      isInternal: validated.isInternal,
    },
    include: {
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // SR 활동 내역 추가
  await db.sRActivity.create({
    data: {
      srId: validated.srId,
      userId: session.user.id,
      type: 'COMMENTED',
      description: `댓글을 작성했습니다`,
    },
  });

  // 알림 트리거 (내부 댓글이 아닌 경우)
  // 실제 구현(src/app/api/srs/[id]/comments/route.ts:154-190):
  // 큐에 넣지 않고, 응답을 막지 않도록 backgroundTask 로 발송만 위임한다.
  // 재시도·outbox 는 없다 — 프로세스가 죽으면 그 발송은 유실된다.
  if (!validated.isInternal) {
    const sr = await db.sR.findUnique({
      where: { id: validated.srId },
      include: {
        requester: { include: { notificationPreference: true } },
        assignee: { include: { notificationPreference: true } },
      },
    });

    if (sr) {
      const emailTasks: Promise<unknown>[] = [];

      // 스키마 기본값이 false 이므로, 켠 사용자에게만 보낸다. 본인 댓글은 제외.
      const shouldSendRequester = sr.requester.notificationPreference?.emailCommentAdded ?? false;
      if (sr.requester.id !== session.user.id && sr.requester.email && shouldSendRequester) {
        emailTasks.push(
          emailService.sendCommentAdded(
            sr.requester.email,
            sr.srNumber,
            sr.title,
            comment.user.name,
            validated.content,
            getSRUrl(sr.id)
          )
        );
      }

      if (sr.assignee && sr.assignee.id !== session.user.id && sr.assignee.email) {
        const shouldSendAssignee = sr.assignee.notificationPreference?.emailCommentAdded ?? false;
        if (shouldSendAssignee) {
          emailTasks.push(
            emailService.sendCommentAdded(
              sr.assignee.email,
              sr.srNumber,
              sr.title,
              comment.user.name,
              validated.content,
              getSRUrl(sr.id)
            )
          );
        }
      }

      if (emailTasks.length > 0) {
        backgroundTask(Promise.allSettled(emailTasks), 'comment-email');
      }
    }
  }

  revalidatePath(`/srs/${validated.srId}`);

  return { success: true, data: comment };
}

export async function updateComment(input: z.infer<typeof updateCommentSchema>) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const validated = updateCommentSchema.parse(input);

  const comment = await db.sRComment.findUnique({ where: { id: validated.id } });
  if (!comment) throw new Error('댓글을 찾을 수 없습니다');

  // 작성자 본인만 수정 가능
  if (comment.userId !== session.user.id) {
    throw new Error('권한이 없습니다');
  }

  const updatedComment = await db.sRComment.update({
    where: { id: validated.id },
    data: { content: validated.content },
    include: {
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  revalidatePath(`/srs/${comment.srId}`);

  return { success: true, data: updatedComment };
}

export async function deleteComment(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const comment = await db.sRComment.findUnique({ where: { id } });
  if (!comment) throw new Error('댓글을 찾을 수 없습니다');

  // 작성자 본인 또는 관리자만 삭제 가능
  const hasPermission = await checkPermission(session.user.id, 'sr:delete');
  if (comment.userId !== session.user.id && !hasPermission) {
    throw new Error('권한이 없습니다');
  }

  await db.sRComment.delete({ where: { id } });

  revalidatePath(`/srs/${comment.srId}`);

  return { success: true };
}
```

### REST API 엔드포인트

> **⚠️ 아래 예시는 초안이다.** 실물 `src/app/api/srs/route.ts` 는 핸들러를
> `withAuthAndRateLimit(...)`(`src/lib/auth-wrapper.ts`)으로 감싸 인증·rate limit·에러 변환을
> 일괄 처리하고, 권한은 `checkPermission('sr:read')` 대신 `src/lib/policies.ts` 의
> `isInternalUser()` / `ensureCanCreateSR()` 로 판정한다. **외부 사용자는 세션의 `clientIds` 로
> 조회 범위가 강제 제한된다**(테넌트 경계). 페이지네이션은 `src/lib/pagination.ts` 의
> `usePagination(request)` 이, BigInt/Date 직렬화는 `src/lib/serialization.ts` 가 담당하며,
> 파일 상단에 `runtime = 'nodejs'` / `dynamic = 'force-dynamic'` / `revalidate = 0` 을 선언한다.
> 아래 초안처럼 `try/catch` + `console.error` 를 직접 쓰지 않는다.

**초안: app/api/srs/route.ts**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkPermission } from '@/lib/auth/permissions';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};

    // 권한에 따른 필터링
    const hasAdminPermission = await checkPermission(session.user.id, 'sr:read');
    if (!hasAdminPermission) {
      where.OR = [{ requesterId: session.user.id }, { assigneeId: session.user.id }];
    }

    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const [srs, total] = await Promise.all([
      db.sR.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sR.count({ where }),
    ]);

    return NextResponse.json({
      data: srs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/srs error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

---

## 컴포넌트 설계

> **⚠️ 이 장의 코드 예시는 초안이다.** 파일 경로가 실제와 다르다
> (`components/forms/sr-form.tsx`, `components/tables/sr-table.tsx` 는 없다). 실제 컴포넌트는
> 도메인별 디렉토리 `src/components/srs/`, `src/components/clients/`, `src/components/users/`,
> `src/components/roles/`, `src/components/dashboard/`, `src/components/organization/`,
> `src/components/profile/` 아래에 있고, 프리미티브는 `src/components/ui/`(Shadcn/ui + Radix)다.
> SR 폼의 상태 로직은 `src/hooks/useCreateSRForm.ts` / `src/hooks/useEditSRForm.ts` 로 분리되어
> 있다. 아래 예시는 폼 검증(Zod + react-hook-form)과 테이블 구성 패턴의 설계 의도를 보이기 위해
> 남겨 둔다 — 그대로 복사해 쓸 수 있는 코드가 아니다.

### UI 컴포넌트 계층

```
컴포넌트 계층 구조:

1. Atoms (기본 UI 요소)
   - Button, Input, Select, Badge, etc. (Shadcn/ui)

2. Molecules (조합된 UI 요소)
   - FormField, SearchBar, StatusBadge, etc.

3. Organisms (복잡한 UI 블록)
   - SRForm, SRTable, CommentSection, etc.

4. Templates (페이지 레이아웃)
   - DashboardLayout, SRDetailLayout, etc.

5. Pages (전체 페이지)
   - DashboardPage, SRListPage, SRDetailPage, etc.
```

### SR Form Component

**components/forms/sr-form.tsx**:

```typescript
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createSR, updateSR } from '@/server/actions/sr'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

const srFormSchema = z.object({
  title: z.string().min(5, '제목은 최소 5자 이상이어야 합니다').max(200),
  description: z.string().min(20, '설명은 최소 20자 이상이어야 합니다'),
  clientId: z.string().cuid('고객사를 선택해주세요'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
})

type SRFormValues = z.infer<typeof srFormSchema>

interface SRFormProps {
  clients: Array<{ id: string; name: string }>
  defaultValues?: Partial<SRFormValues>
  mode?: 'create' | 'edit'
  srId?: string
}

export function SRForm({ clients, defaultValues, mode = 'create', srId }: SRFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SRFormValues>({
    resolver: zodResolver(srFormSchema),
    defaultValues: defaultValues || {
      title: '',
      description: '',
      clientId: '',
      priority: 'MEDIUM',
    },
  })

  async function onSubmit(data: SRFormValues) {
    setIsSubmitting(true)

    try {
      if (mode === 'create') {
        const result = await createSR(data)
        if (result.success) {
          toast({
            title: 'SR 생성 완료',
            description: `SR ${result.data.srNumber}이(가) 생성되었습니다.`,
          })
          router.push(`/srs/${result.data.id}`)
        }
      } else if (mode === 'edit' && srId) {
        const result = await updateSR({ id: srId, ...data })
        if (result.success) {
          toast({
            title: 'SR 수정 완료',
            description: 'SR이 성공적으로 수정되었습니다.',
          })
          router.push(`/srs/${srId}`)
        }
      }
    } catch (error) {
      toast({
        title: '오류 발생',
        description: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>고객사 *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="고객사를 선택하세요" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>제목 *</FormLabel>
              <FormControl>
                <Input placeholder="SR 제목을 입력하세요" {...field} />
              </FormControl>
              <FormDescription>
                명확하고 간결한 제목을 작성해주세요 (5-200자)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>상세 설명 *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="SR의 상세 내용을 입력하세요"
                  className="min-h-[200px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                문제 상황, 요구사항, 기대 결과 등을 자세히 작성해주세요 (최소 20자)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>우선순위 *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="CRITICAL">긴급 (4시간 내 대응)</SelectItem>
                  <SelectItem value="HIGH">높음 (24시간 내 대응)</SelectItem>
                  <SelectItem value="MEDIUM">보통 (3일 내 대응)</SelectItem>
                  <SelectItem value="LOW">낮음 (7일 내 대응)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'SR 생성' : 'SR 수정'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            취소
          </Button>
        </div>
      </form>
    </Form>
  )
}
```

### SR Table Component

**components/tables/sr-table.tsx**:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table'
import { SR, User, Client } from '@prisma/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

type SRWithRelations = SR & {
  client: Client
  requester: User
  assignee: User | null
}

const priorityColors = {
  CRITICAL: 'destructive',
  HIGH: 'orange',
  MEDIUM: 'yellow',
  LOW: 'default',
} as const

const statusColors = {
  REQUESTED: 'default',
  INTAKE: 'secondary',
  IN_PROGRESS: 'blue',
  ON_HOLD: 'yellow',
  COMPLETED: 'green',
  CONFIRMED: 'green',
  REJECTED: 'destructive',
} as const

export function SRTable({ data }: { data: SRWithRelations[] }) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const columns: ColumnDef<SRWithRelations>[] = [
    {
      accessorKey: 'srNumber',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          SR 번호
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono font-medium">{row.getValue('srNumber')}</span>
      ),
    },
    {
      accessorKey: 'title',
      header: '제목',
      cell: ({ row }) => (
        <div className="max-w-[400px] truncate font-medium">
          {row.getValue('title')}
        </div>
      ),
    },
    {
      accessorKey: 'priority',
      header: '우선순위',
      cell: ({ row }) => {
        const priority = row.getValue('priority') as keyof typeof priorityColors
        return <Badge variant={priorityColors[priority]}>{priority}</Badge>
      },
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => {
        const status = row.getValue('status') as keyof typeof statusColors
        return <Badge variant={statusColors[status]}>{status}</Badge>
      },
    },
    {
      accessorKey: 'client',
      header: '고객사',
      cell: ({ row }) => row.original.client.name,
    },
    {
      accessorKey: 'assignee',
      header: '담당자',
      cell: ({ row }) => row.original.assignee?.name || <span className="text-muted-foreground">미할당</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          등록일
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        return format(new Date(row.getValue('createdAt')), 'PPp', { locale: ko })
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="SR 번호 또는 제목 검색..."
            value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn('title')?.setFilterValue(event.target.value)
            }
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/srs/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  결과가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </Button>
        <div className="text-sm text-muted-foreground">
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          다음
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

---

_문서가 너무 길어 계속 이어서 작성하겠습니다..._

## 인증 및 권한

### NextAuth.js 설정

> **⚠️ 아래 예시는 초안이며 실제 구현과 다르다.** 실물은 두 파일로 나뉘어 있다:
> `src/auth.config.ts`(Edge 에서도 로드 가능한 부분 — 세션 전략, `pages`, `authorized` 콜백)와
> `src/auth.ts`(Credentials 프로바이더, Node 전용 로직). 미들웨어(`src/proxy.ts`)가
> `auth.config.ts` 만 쓰기 때문에 이렇게 분리되어 있다.
>
> 주요 차이:
>
> - **`@auth/prisma-adapter` 를 쓰지 않는다.** 어댑터 없이 Credentials + JWT 세션만 쓴다
>   (그 패키지는 의존성에도 없다). 초안이 `adapter` 와 `strategy: 'jwt'` 를 함께 적은 것은
>   실제 구성이 아니다.
> - 비밀번호 비교는 `compare` 직접 호출이 아니라 `src/lib/security.ts` 의 `verifyPassword()`
>   (bcryptjs)를 쓴다. **사용자가 없을 때도 더미 비교를 수행해 타이밍 공격을 막는다.**
> - `session.maxAge` 를 명시하지 않는다(NextAuth 기본값). 유휴 로그아웃은 클라이언트 측
>   `IdleTimeoutProvider` 가 담당한다.
> - 권한 문자열은 `role.permissions[].permission` 을 거쳐 만든다(중간 테이블 `RolePermission`).
> - `authorized` 콜백에서 미로그인 접근 차단과 로그인 상태의 `/`·`/login` 리다이렉트를 처리한다.
> - 실패 로그는 `console.error` 가 아니라 `logger` 로 남긴다.

**초안: lib/auth.ts** (실물: `src/auth.ts` + `src/auth.config.ts`):

```typescript
import NextAuth, { NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter'; // 실제로는 사용하지 않음
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { compare } from 'bcrypt';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const { email, password } = loginSchema.parse(credentials);

          const user = await db.user.findUnique({
            where: { email },
            include: {
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: true,
                    },
                  },
                },
              },
            },
          });

          if (!user || !user.password) {
            return null;
          }

          if (!user.isActive) {
            throw new Error('계정이 비활성화되었습니다');
          }

          const isPasswordValid = await compare(password, user.password);

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            roles: user.roles.map((ur) => ur.role.name),
            permissions: user.roles.flatMap((ur) =>
              ur.role.permissions.map((p) => `${p.resource}:${p.action}`)
            ),
          };
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = token.roles as string[];
        session.user.permissions = token.permissions as string[];
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

### 권한 관리 유틸리티

> **⚠️ 아래 예시는 초안이다.** `src/lib/auth/permissions.ts` 는 없다. 실제로는 세 파일로 나뉜다:
>
> - `src/lib/permissions.ts` — DB 조회 기반 권한 확인
>   (`hasPermission`, `requirePermission`, `hasAnyPermission`, `hasAllPermissions`, `hasRole`,
>   `getUserPermissions`, `getUserRoles`)
> - `src/lib/policies.ts` — 세션 정보만으로 판정하는 리소스 정책.
>   `can*` 는 boolean 을 반환하고 `ensureCan*` 는 위반 시 `ForbiddenError` 를 던진다
>   (`canReadSR`/`ensureCanReadSR`, `canUpdateSR`, `canDeleteSR`, 고객사·사용자용 동종 함수).
>   테넌트 경계(`clientIds`)와 내부/외부 사용자 구분(`isInternalUser`)이 여기 모여 있다.
> - `src/lib/auth-wrapper.ts` — 라우트 핸들러 래퍼(`withAuthAndRateLimit`)

**초안: lib/auth/permissions.ts**:

```typescript
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export type PermissionAction =
  | 'sr:create'
  | 'sr:read'
  | 'sr:update'
  | 'sr:delete'
  | 'sr:assign'
  | 'client:create'
  | 'client:read'
  | 'client:update'
  | 'client:delete'
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'role:manage'
  | 'system:admin';

export async function checkPermission(userId: string, action: PermissionAction): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) return false;

  // System Admin has all permissions
  const hasAdminRole = user.roles.some((ur) => ur.role.name === 'SYSTEM_ADMIN');
  if (hasAdminRole) return true;

  // Check specific permission
  const hasPermission = user.roles.some((ur) =>
    ur.role.permissions.some((p) => `${p.resource}:${p.action}` === action)
  );

  return hasPermission;
}

export async function requirePermission(action: PermissionAction) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized: No session');
  }

  const hasPermission = await checkPermission(session.user.id, action);

  if (!hasPermission) {
    throw new Error(`Forbidden: Missing permission ${action}`);
  }

  return session;
}

export async function checkSROwnership(userId: string, srId: string): Promise<boolean> {
  const sr = await db.sR.findUnique({
    where: { id: srId },
    select: { requesterId: true, assigneeId: true },
  });

  if (!sr) return false;
  return sr.requesterId === userId || sr.assigneeId === userId;
}

export async function checkClientAccess(userId: string, clientId: string): Promise<boolean> {
  const userClients = await db.userClient.findMany({
    where: { userId },
    select: { clientId: true },
  });

  return userClients.some((uc) => uc.clientId === clientId);
}
```

---

## 비즈니스 로직

### SR Service Layer

> **⚠️ 아래 예시는 초안이다.** 실물은 `src/services/sr.service.ts` 이며 정적 메서드 클래스가
> 아니라 인스턴스 클래스다(`src/services/service-registry.ts` 의 `services.srService` 싱글톤으로
> 접근한다). `@/lib/sr/sla` 모듈은 존재하지 않으며, 상태 전이 규칙은 `src/lib/sr-state-machine.ts`,
> 권한은 `src/lib/policies.ts`, DB 는 `src/lib/prisma.ts` 다. 쓰기 경로는 `$transaction` 으로
> 감싸고 그 안에서 `domainEvents.emit(...)` 을 호출해 **커밋 후에** 알림이 발행되게 한다
> (위 "알림 파이프라인" 절 참고).
>
> **SR 번호 채번도 다르다.** 초안은 고객사 코드 + 그날의 `count()` 로 만들었지만
> (동시 생성 시 같은 번호가 나온다), 실제 구현은 `sr_sequences` 테이블에
> `INSERT … ON CONFLICT ("date") DO UPDATE SET seq = seq + 1 RETURNING seq` 로 **원자적으로**
> 채번하고 형식은 `SR-YYYYMMDD-0001` 이다(고객사 코드는 들어가지 않는다).

**초안: server/services/sr-service.ts** (실물: `src/services/sr.service.ts`):

```typescript
import { db } from '@/lib/db';
import { SRStatus, SRPriority, Prisma } from '@prisma/client';
import { calculateSLADeadline, isSLABreached } from '@/lib/sr/sla'; // 존재하지 않는 모듈

export class SRService {
  /**
   * SR 생성
   */
  static async create(data: {
    title: string;
    description: string;
    clientId: string;
    requesterId: string;
    priority: SRPriority;
  }) {
    const srNumber = await this.generateSRNumber(data.clientId);
    const dueDate = calculateSLADeadline(data.priority);

    return db.sR.create({
      data: {
        ...data,
        srNumber,
        dueDate,
        status: 'INTAKE',
        activities: {
          create: {
            type: 'CREATED',
            description: 'SR이 생성되었습니다',
            userId: data.requesterId,
          },
        },
      },
      include: {
        client: true,
        requester: true,
      },
    });
  }

  /**
   * SR 번호 생성 로직
   */
  static async generateSRNumber(clientId: string): Promise<string> {
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) throw new Error('고객사를 찾을 수 없습니다');

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const clientCode = client.code; // Client.code 필드 사용

    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const count = await db.sR.count({
      where: {
        clientId,
        createdAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${clientCode}-${dateStr}-${sequence}`;
  }

  /**
   * SR 목록 조회 (필터링, 페이지네이션)
   */
  static async list(params: {
    userId: string;
    isAdmin: boolean;
    clientId?: string;
    status?: SRStatus;
    priority?: SRPriority;
    assigneeId?: string;
    requesterId?: string;
    searchQuery?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      isAdmin,
      clientId,
      status,
      priority,
      assigneeId,
      requesterId,
      searchQuery,
      page = 1,
      limit = 50,
    } = params;

    const where: Prisma.SRWhereInput = {};

    // 권한에 따른 필터링
    if (!isAdmin) {
      where.OR = [{ requesterId: userId }, { assigneeId: userId }];
    }

    if (clientId) where.clientId = clientId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;
    if (requesterId) where.requesterId = requesterId;

    if (searchQuery) {
      where.OR = [
        { srNumber: { contains: searchQuery, mode: 'insensitive' } },
        { title: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const [srs, total] = await Promise.all([
      db.sR.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sR.count({ where }),
    ]);

    return {
      data: srs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * SLA 위반 SR 조회
   */
  static async getSLABreachedSRs() {
    const srs = await db.sR.findMany({
      where: {
        status: {
          notIn: ['COMPLETED', 'REJECTED'],
        },
      },
      include: {
        client: true,
        requester: true,
        assignee: true,
      },
    });

    return srs.filter((sr) => isSLABreached(sr.priority, sr.createdAt));
  }

  /**
   * 대시보드 통계
   */
  static async getDashboardStats(userId: string, isAdmin: boolean) {
    const where: Prisma.SRWhereInput = {};

    if (!isAdmin) {
      where.OR = [{ requesterId: userId }, { assigneeId: userId }];
    }

    const [
      total,
      requested,
      intake,
      inProgress,
      onHold,
      completed,
      confirmed,
      rejected,
      byPriority,
      recentSRs,
    ] = await Promise.all([
      db.sR.count({ where }),
      db.sR.count({ where: { ...where, status: 'REQUESTED' } }),
      db.sR.count({ where: { ...where, status: 'INTAKE' } }),
      db.sR.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      db.sR.count({ where: { ...where, status: 'ON_HOLD' } }),
      db.sR.count({ where: { ...where, status: 'COMPLETED' } }),
      db.sR.count({ where: { ...where, status: 'CONFIRMED' } }),
      db.sR.count({ where: { ...where, status: 'REJECTED' } }),
      db.sR.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      db.sR.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      total,
      byStatus: {
        requested,
        intake,
        inProgress,
        onHold,
        completed,
        confirmed,
        rejected,
      },
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<SRPriority, number>
      ),
      recentSRs,
    };
  }
}
```

### 알림 파이프라인 (실제 구현)

> **⚠️ 정정(2026-07-30) — 이 절은 원래 "Notification Service" 로서 `notifications` 테이블에
> PENDING 레코드를 적고 Inngest 가 이를 집어 발송·재시도하는 큐 기반 파이프라인을 기술했다.**
> 그런 파이프라인은 **구현되지 않았다.** Inngest 는 채택되지 않았고, 영속 큐도 워커도 없다.
> 또한 `NotificationService` 라는 파일 자체가 존재하지 않으며, `notifications` 테이블은
> 스키마에는 남아 있지만 **애플리케이션 코드가 한 번도 읽거나 쓰지 않는다**
> (2026-07-30 `src/` 전체 grep 으로 참조 0건 확인). 발송 상태 추적·재시도·미발송 조회 기능은
> 현재 존재하지 않는다. 실제 동작은 아래와 같다.

**구성 요소 (읽은 파일)**

| 역할             | 파일                                                 | 요약                                                 |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 이벤트 정의·버스 | `src/lib/domain-events.ts`                           | Node `EventEmitter` 기반. 이벤트 3종, 최대 리스너 50 |
| 커밋 후 발행     | `src/lib/prisma.ts`                                  | `$transaction` 래퍼가 커밋 성공 후에만 `emit`        |
| 리스너           | `src/services/listeners/sr-notification.listener.ts` | 수신자 조회 → 이메일/푸시 태스크 구성                |
| 리스너 등록      | `src/services/service-registry.ts`                   | 프로세스당 1회 `registerSRNotificationListeners()`   |
| 백그라운드 실행  | `src/lib/wait-until.ts`                              | `backgroundTask(Promise.allSettled(...))`            |
| 이메일           | `src/services/email.service.ts`                      | nodemailer SMTP 풀. 자격증명 없으면 warn 후 스킵     |
| 웹 푸시          | `src/services/push.service.ts`                       | web-push(VAPID)                                      |

**이벤트 계약** (`src/lib/domain-events.ts` — 이 3개가 전부다):

```typescript
interface DomainEventsMap {
  'sr:created': (payload: SRCreatedEvent) => void;
  'sr:status_changed': (payload: SRStatusChangedEvent) => void;
  'sr:assigned': (payload: SRAssignedEvent) => void;
}

class DomainEventEmitter extends EventEmitter {
  emit<K extends keyof DomainEventsMap>(
    eventName: K,
    ...args: Parameters<DomainEventsMap[K]>
  ): boolean {
    // 트랜잭션 컨텍스트(AsyncLocalStorage) 안이면 즉시 발행하지 않고 버퍼에 쌓는다.
    // src/lib/prisma.ts 의 $transaction 래퍼가 커밋 성공 후 이 버퍼를 flush 한다.
    const context = transactionLocalStorage.getStore();
    if (context) {
      context.domainEvents.push({ eventName, args });
      return true;
    }
    return super.emit(eventName, ...args);
  }
}

export const domainEvents = new DomainEventEmitter();
```

**리스너** (`src/services/listeners/sr-notification.listener.ts` 발췌 — `sr:created` 분기):

```typescript
domainEvents.on('sr:created', async (payload) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
        isActive: true,
      },
      select: { id: true, email: true, notificationPreference: true },
    });

    const promises: Promise<unknown>[] = [];

    // 웹 푸시 (VAPID). 구독이 없으면 push.service 내부에서 무시된다.
    const adminIds = admins.map((u) => u.id);
    if (adminIds.length > 0) {
      promises.push(
        pushService.sendToUsers(adminIds, {
          title: '새로운 SR 등록',
          body: `${payload.srNumber}: ${payload.title}`,
          url: `/srs/${payload.srId}`,
          tag: 'sr-created',
        })
      );
    }

    // 이메일 (nodemailer SMTP). 수신자별 선호 설정을 따른다.
    admins.forEach((admin) => {
      const shouldSend = admin.notificationPreference?.emailSRCreated ?? true;
      if (admin.email && shouldSend) {
        promises.push(
          emailService.sendSRCreated(
            admin.email,
            payload.srNumber,
            payload.title,
            payload.requesterName,
            getSRUrl(payload.srId)
          )
        );
      }
    });

    backgroundTask(Promise.allSettled(promises), 'sr-notification-dispatch');
  } catch (error) {
    logger.error(
      'Failed to handle sr:created notification',
      error instanceof Error ? error : undefined,
      { srId: payload.srId }
    );
  }
});
```

`sr:status_changed` 는 요청자에게, `sr:assigned` 는 새 담당자에게 같은 방식으로 발송한다
(담당 해제 시에는 `assigneeId === null` 이므로 로그만 남기고 발송을 생략한다).
이메일 기본값은 `emailSRCreated`/`emailSRAssigned` 가 `true`, `emailSRStatusChanged` 와
`emailCommentAdded` 가 `false` 다(`notification_preferences`).

**backgroundTask** (`src/lib/wait-until.ts`):

```typescript
export function backgroundTask<T>(promise: Promise<T>, label?: string): void {
  const tracked = promise
    .then((result) => {
      logger.info(`[BackgroundTask] ${label || 'Task'} completed successfully`);
      return result;
    })
    .catch((error) => {
      logger.error(`[BackgroundTask] ${label || 'Task'} failed:`, error as Error);
    });

  try {
    waitUntil(tracked); // @vercel/functions. 요청 컨텍스트가 있을 때만 의미가 있다.
  } catch {
    // 상시 구동 Node 프로세스(현재 배포 형태)에서는 fire-and-forget 으로 자연히 완료된다.
  }
}
```

> `@vercel/functions` 는 아직 의존성에 남아 있으나(`package.json`), 자체 서버 배포에서는
> `waitUntil` 이 요청 컨텍스트를 찾지 못해 catch 로 빠지고 fire-and-forget 이 된다.
> 즉 이 함수의 실효는 "실패를 삼키지 않고 로그로 남긴다" 는 쪽이다.

**이 설계가 보장하지 않는 것 (알려진 한계)**

- **재시도 없음**: SMTP/푸시 실패는 `Promise.allSettled` 로 삼켜지고 로그만 남는다.
- **영속성 없음**: 발송 전에 프로세스가 종료되면 그 알림은 사라진다. outbox 패턴 미구현.
- **상태 추적 없음**: `notifications` 테이블이 쓰이지 않으므로 "무엇이 발송됐는지" 를
  DB 에서 조회할 수 없다. 로그(pino → stdout → Docker json-file)가 유일한 기록이다.
- **다중 인스턴스 불가**: 이벤트 버스가 프로세스 내부에 있어 인스턴스를 늘리면
  각 인스턴스가 자기 요청에서 난 이벤트만 본다.

### 스케줄 작업 (SLA 모니터링 / 정기 보고서)

> **⚠️ 정정(2026-07-30) — 이 절은 원래 Inngest 크론 함수 3개
> (`send-email`, `sla-monitor`, `generate-reports`)의 전체 구현을 코드로 싣고 있었다.**
> Inngest 는 채택되지 않았고, **그 세 함수에 해당하는 코드는 어디에도 없다.** 즉 다음 기능은
> 문서에만 존재했다: 매시 SLA 임박/위반 스캔, 주간 PDF 리포트 생성 및 관리자 메일 발송,
> 발송 실패 재시도. `src/` 에 SLA 를 주기적으로 스캔하는 코드는 없다(SLA 관련 코드는
> 대시보드·목록의 표시 로직뿐이다). 오해를 남기지 않기 위해 코드 예시는 삭제했다.

현재 저장소에 실제로 존재하는 스케줄 작업은 **GitHub Actions 크론 두 개뿐이며, 둘 다
애플리케이션 기능이 아니라 운영 작업**이다.

| 워크플로                                 | 스케줄         | 하는 일                                            |
| ---------------------------------------- | -------------- | -------------------------------------------------- |
| `.github/workflows/backup.yml`           | 매일 UTC 18:00 | 운영 DB `pg_dump` + `uploads` 백업, 보존 관리      |
| `.github/workflows/scheduled-checks.yml` | 매일 UTC 00:00 | 의존성 outdated/audit, 복잡도, 번들 크기, 벤치마크 |

앱 내부에는 스케줄러가 없다. 주기 작업이 필요해지면 (a) 호스트 cron 또는 systemd timer 가
컨테이너의 스크립트를 실행, (b) GitHub Actions 크론이 인증된 엔드포인트를 호출,
(c) 영속 큐/스케줄러 도입 중 하나를 선택해야 한다. **어느 것도 아직 결정되지 않았다.**

### 이메일 발송과 템플릿 (실제 구현)

> **⚠️ 정정(2026-07-30) — 이 절은 원래 `@react-email/components` 기반 React Email 템플릿
> (`emails/sr-created.tsx`, `emails/sr-assigned.tsx`, `emails/sr-completed.tsx`)의 전체 코드를
> 싣고 있었다.** **Resend 도 React Email 도 채택되지 않았다.** `emails/` 디렉토리와 그 파일들은
> 존재하지 않으며, `@react-email/components` 는 의존성에도 없다. 실제 발송은 nodemailer(SMTP)
> 이고, HTML 은 `src/services/email.service.ts` 안에 템플릿 리터럴로 인라인되어 있다.
> 발송 전용 템플릿은 **4종뿐이다**(생성/배정/상태 변경/댓글). 완료·거절 전용 템플릿은 없고
> 상태 변경 템플릿이 그 역할을 겸한다.

**트랜스포터** (`src/services/email.service.ts`):

```typescript
import nodemailer from 'nodemailer';

import { logger } from '@/lib/logger';

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      pool: true,
      host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_SERVER_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      tls: {
        // 프로덕션에서는 반드시 TLS 인증서를 검증한다(MITM 자격증명 탈취 방지).
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
      // 외부 SMTP 응답 지연으로 풀 연결이 묶이는 것을 방지
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async sendMail({ to, subject, html }: EmailOptions): Promise<void> {
    // 자격 증명이 없으면 조용히 스킵한다(로컬/스테이징에서 부팅을 막지 않기 위한 선택).
    if (!process.env.EMAIL_SERVER_USER || !process.env.EMAIL_SERVER_PASSWORD) {
      logger.warn('[EmailService] Email credentials not found. Skipping email sending.');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"SR System" <no-reply@sr-system.com>',
        to,
        subject,
        html,
      });
      logger.info(`[EmailService] Email sent: ${info.messageId}`);
    } catch (error) {
      // 예외를 던지지 않는다. 호출자(리스너/라우트)는 실패를 알 수 없다.
      logger.error('[EmailService] Error sending email:', error as Error);
    }
  }
}

export const emailService = new EmailService();
```

**템플릿 목록** (같은 파일의 메서드. 각 메서드가 제목과 HTML 을 직접 만든다)

| 메서드                | 제목                                             | 링크 대상     |
| --------------------- | ------------------------------------------------ | ------------- |
| `sendSRCreated`       | `[SR System] 새로운 SR이 생성되었습니다: {번호}` | SR 상세       |
| `sendSRAssigned`      | `[SR System] SR 담당자가 배정되었습니다: {번호}` | SR 상세       |
| `sendSRStatusChanged` | `[SR System] SR 상태가 변경되었습니다: {번호}`   | SR 상세       |
| `sendCommentAdded`    | `[SR System] SR에 새 댓글이 달렸습니다: {번호}`  | SR 상세(댓글) |

**템플릿 예시** — `sendSRStatusChanged` (상태 코드는 메서드 안의 `statusMap` 으로 한글화한다):

```typescript
async sendSRStatusChanged(
  to: string,
  srNumber: string,
  title: string,
  oldStatus: string,
  newStatus: string,
  link: string
) {
  const subject = `[SR System] SR 상태가 변경되었습니다: ${srNumber}`;
  const statusMap = new Map<string, string>([
    ['REQUESTED', '요청됨'],
    ['INTAKE', '접수'],
    ['IN_PROGRESS', '진행중'],
    ['ON_HOLD', '보류'],
    ['COMPLETED', '완료'],
    ['CONFIRMED', '확인완료'],
    ['REJECTED', '거절됨'],
  ]);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">SR 상태 변경 알림</h2>
      <p><strong>SR 번호:</strong> ${srNumber}</p>
      <p><strong>제목:</strong> ${title}</p>
      <p><strong>상태:</strong> ${statusMap.get(oldStatus) || oldStatus} ➡️ <span style="color: #0070f3; font-weight: bold;">${statusMap.get(newStatus) || newStatus}</span></p>
      <a href="${link}" style="display: inline-block; background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">SR 확인하기</a>
    </div>
  `;
  await this.sendMail({ to, subject, html });
}
```

**주의할 점**

- 링크 URL 은 `src/lib/app-url.ts` 의 `getSRUrl()` 이 만든다(리버스 프록시 뒤에서 내부 주소가
  새지 않도록 `NEXT_PUBLIC_APP_URL` 을 우선한다).
- `sendMail` 은 실패해도 예외를 던지지 않으므로, 상위의 `Promise.allSettled` 와 합쳐져
  **발송 실패가 사용자에게도 DB 에도 남지 않는다**. 로그가 유일한 흔적이다.
- 템플릿 문자열에 값이 그대로 보간된다(`${commentContent}` 등). 이메일 본문의 HTML 이스케이프는
  현재 적용되어 있지 않다 — 개선 대상으로 남아 있는 지점이다.
- 자격 증명이 플레이스홀더면 `src/lib/env-validation.ts` 가 경고만 남기고 "미설정" 으로 간주한다
  (컨테이너를 크래시 루프에 빠뜨리지 않기 위한 의도된 동작).

## 8. 알림 시스템

### 🟡 Medium - 알림 발송 조건 상세화

**PRD에 알림 트리거가 나열되어 있으나, 정확한 조건 불명확**

> **⚠️ 아래는 "필요한 명세"(요구사항 초안)이며 구현이 아니다.**
> `notification-triggers.ts` 라는 파일은 존재하지 않고, 트리거 10종·채널 매핑·`immediate` 배치
> 발송·`NOTIFICATION_CONDITIONS` 테이블도 구현되지 않았다. 실제 구현은 위
> "알림 파이프라인 (실제 구현)" 절이 전부이며, 다음만 동작한다.
>
> | 초안의 트리거                                  | 실제                                                                                      |
> | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
> | `SR_CREATED`                                   | ✅ `sr:created` — 수신자는 **ADMIN/MANAGER 역할 보유자**(초안의 "고객사 담당자"가 아니다) |
> | `SR_ASSIGNED`                                  | ✅ `sr:assigned` — 새 담당자                                                              |
> | `SR_STATUS_CHANGED`                            | ✅ `sr:status_changed` — 요청자                                                           |
> | `SR_COMPLETED` / `SR_REJECTED` / `SR_REOPENED` | ⚠️ 별도 이벤트 없음. `sr:status_changed` 가 겸한다                                        |
> | `SR_COMMENT_ADDED`                             | ✅ 단, 이벤트가 아니라 댓글 라우트에서 직접 발송(즉시, 배치 아님)                         |
> | `SLA_WARNING` / `SLA_VIOLATED`                 | ❌ 미구현. 주기 스캔 작업이 없다                                                          |
> | `CONTRACT_EXPIRING`                            | ❌ 미구현                                                                                 |
>
> 채널도 다르다. 실제 채널은 **이메일(SMTP) + 웹 푸시(VAPID)** 이며, 초안의 `IN_APP` 채널
> (앱 내 알림함)은 구현되지 않았다. `NotificationType` enum 에 `IN_APP` 값이 남아 있지만
> 이를 쓰는 코드는 없다. 즉시성 요구는 SSE(`/api/realtime`)로 화면을 갱신해 충족한다.

**필요한 명세(미구현):**

```typescript
// 초안. 이 파일은 저장소에 존재하지 않는다.
// src/server/services/notification-triggers.ts

export enum NotificationTrigger {
  SR_CREATED = 'SR_CREATED',
  SR_ASSIGNED = 'SR_ASSIGNED',
  SR_STATUS_CHANGED = 'SR_STATUS_CHANGED',
  SR_COMPLETED = 'SR_COMPLETED',
  SR_REJECTED = 'SR_REJECTED',
  SR_REOPENED = 'SR_REOPENED',
  SR_COMMENT_ADDED = 'SR_COMMENT_ADDED',
  SLA_WARNING = 'SLA_WARNING',
  SLA_VIOLATED = 'SLA_VIOLATED',
  CONTRACT_EXPIRING = 'CONTRACT_EXPIRING',
}

/**
 * 알림 발송 조건
 */
export interface NotificationCondition {
  trigger: NotificationTrigger;
  description: string;
  recipients: (sr: SR) => Promise<string[]>; // User IDs 또는 Emails
  channels: ('EMAIL' | 'IN_APP')[];
  immediate: boolean; // 즉시 발송 여부
  template: string;
  enabled: boolean;
}

export const NOTIFICATION_CONDITIONS: Record<NotificationTrigger, NotificationCondition> = {
  SR_CREATED: {
    trigger: NotificationTrigger.SR_CREATED,
    description: 'SR이 생성되었을 때',
    recipients: async (sr) => {
      // 해당 고객사의 담당자들
      const handlers = await db.clientHandler.findMany({
        where: { clientId: sr.clientId, unassignedDate: null },
        select: { userId: true },
      });
      return handlers.map((h) => h.userId);
    },
    channels: ['EMAIL'],
    immediate: true,
    template: 'sr-created',
    enabled: true,
  },

  SR_ASSIGNED: {
    trigger: NotificationTrigger.SR_ASSIGNED,
    description: 'SR이 담당자에게 배정되었을 때',
    recipients: async (sr) => {
      // 배정된 담당자
      return sr.assigneeId ? [sr.assigneeId] : [];
    },
    channels: ['EMAIL', 'IN_APP'],
    immediate: true,
    template: 'sr-assigned',
    enabled: true,
  },

  SR_STATUS_CHANGED: {
    trigger: NotificationTrigger.SR_STATUS_CHANGED,
    description: 'SR 상태가 변경되었을 때',
    recipients: async (sr) => {
      // 신청자 + 담당자
      const recipients = [sr.requesterId];
      if (sr.assigneeId) {
        recipients.push(sr.assigneeId);
      }
      return recipients;
    },
    channels: ['EMAIL', 'IN_APP'],
    immediate: true,
    template: 'sr-status-changed',
    enabled: true,
  },

  SR_COMPLETED: {
    trigger: NotificationTrigger.SR_COMPLETED,
    description: 'SR이 완료되었을 때',
    recipients: async (sr) => {
      // 신청자
      return [sr.requesterId];
    },
    channels: ['EMAIL', 'IN_APP'],
    immediate: true,
    template: 'sr-completed',
    enabled: true,
  },

  SR_REJECTED: {
    trigger: NotificationTrigger.SR_REJECTED,
    description: 'SR이 거절되었을 때',
    recipients: async (sr) => {
      // 신청자
      return [sr.requesterId];
    },
    channels: ['EMAIL', 'IN_APP'],
    immediate: true,
    template: 'sr-rejected',
    enabled: true,
  },

  SR_COMMENT_ADDED: {
    trigger: NotificationTrigger.SR_COMMENT_ADDED,
    description: 'SR에 댓글이 추가되었을 때',
    recipients: async (sr) => {
      // 신청자 + 담당자 (댓글 작성자 제외)
      const recipients = [sr.requesterId];
      if (sr.assigneeId) {
        recipients.push(sr.assigneeId);
      }
      return recipients;
    },
    channels: ['EMAIL', 'IN_APP'],
    immediate: false, // 배치로 5분마다 발송
    template: 'sr-comment-added',
    enabled: true,
  },

  SLA_WARNING: {
    trigger: NotificationTrigger.SLA_WARNING,
    description: 'SLA 위반 임박 (남은 시간 < 25%)',
    recipients: async (sr) => {
      // 담당자 + 고객사 관리자
      const recipients: string[] = [];

      if (sr.assigneeId) {
        recipients.push(sr.assigneeId);
      }

      // 고객사 관리자
      const admins = await db.userClient.findMany({
        where: {
          clientId: sr.clientId,
          user: {
            roles: {
              some: {
                role: { name: 'CLIENT_ADMIN' },
              },
            },
          },
        },
        select: { userId: true },
      });

      recipients.push(...admins.map((a) => a.userId));

      return [...new Set(recipients)]; // 중복 제거
    },
    channels: ['EMAIL'],
    immediate: true,
    template: 'sla-warning',
    enabled: true,
  },

  SLA_VIOLATED: {
    trigger: NotificationTrigger.SLA_VIOLATED,
    description: 'SLA 위반',
    recipients: async (sr) => {
      // SLA_WARNING과 동일 + 시스템 관리자
      const warningRecipients = await NOTIFICATION_CONDITIONS.SLA_WARNING.recipients(sr);

      const sysAdmins = await db.user.findMany({
        where: {
          roles: {
            some: {
              role: { name: 'SYSTEM_ADMIN' },
            },
          },
        },
        select: { id: true },
      });

      return [...warningRecipients, ...sysAdmins.map((a) => a.id)];
    },
    channels: ['EMAIL'],
    immediate: true,
    template: 'sla-violated',
    enabled: true,
  },

  CONTRACT_EXPIRING: {
    trigger: NotificationTrigger.CONTRACT_EXPIRING,
    description: '계약 만료 임박 (30일, 14일, 1일 전)',
    recipients: async (sr) => {
      // 고객사 관리자 + 시스템 관리자
      const admins = await db.userClient.findMany({
        where: {
          clientId: sr.clientId,
          user: {
            roles: {
              some: {
                role: { name: 'CLIENT_ADMIN' },
              },
            },
          },
        },
        select: { userId: true },
      });

      const sysAdmins = await db.user.findMany({
        where: {
          roles: {
            some: {
              role: { name: 'SYSTEM_ADMIN' },
            },
          },
        },
        select: { id: true },
      });

      return [...admins.map((a) => a.userId), ...sysAdmins.map((a) => a.id)];
    },
    channels: ['EMAIL'],
    immediate: false, // 크론 작업으로 일일 체크
    template: 'contract-expiring',
    enabled: true,
  },
};

/**
 * 알림 발송 함수
 */
export async function sendNotification(trigger: NotificationTrigger, sr: SR) {
  const condition = NOTIFICATION_CONDITIONS[trigger];

  if (!condition.enabled) {
    return;
  }

  const recipients = await condition.recipients(sr);

  if (recipients.length === 0) {
    return;
  }

  // 각 채널별로 발송
  for (const channel of condition.channels) {
    for (const recipientId of recipients) {
      await db.notification.create({
        data: {
          type: channel,
          status: 'PENDING',
          recipient: recipientId,
          subject: `[SR#${sr.srNumber}] ${trigger}`,
          content: await renderTemplate(condition.template, sr),
          metadata: {
            trigger,
            srId: sr.id,
            srNumber: sr.srNumber,
          },
        },
      });
    }
  }

  // 초안은 여기서 Inngest 큐에 발송 요청을 넣었다(`inngest.send({ name: 'notification/send' })`).
  // Inngest 는 채택되지 않았으므로 그 호출은 삭제했다. 이 함수 전체가 미구현이며,
  // 구현한다면 위 `notifications` 레코드 생성 대신 domainEvents.emit(...) 으로 리스너에 넘기고
  // 리스너가 backgroundTask 로 발송하는 현재 경로에 합류시켜야 한다.
}
```

---

## 파일 저장소

### 로컬 디스크 저장소 (실제 구현)

> **⚠️ 정정(2026-07-30) — 이 절은 원래 "Vercel Blob Integration" 이었고
> `@vercel/blob` 의 `put/head/del/list` 와 `BLOB_READ_WRITE_TOKEN` 을 전제로 작성되어 있었다.**
> **Vercel Blob 은 채택되지 않았다.** 오브젝트 스토리지도 CDN 도 없다. 첨부파일은 앱 컨테이너의
> 디스크(`STORAGE_DIR`, 기본 `<cwd>/var/uploads`, 운영은 `/app/var/uploads`)에 저장되며
> 그 경로에 named volume `sr_uploads` 가 마운트된다(`docker-compose.prod.yml`).
> 파일은 **웹루트(`public/`) 밖**에 있으므로 정적 서빙으로 접근할 수 없고, 인증 라우트
> `/api/attachments/[id]/download` 로만 스트리밍된다. 초안의 `access: 'public'` 공개 URL 모델과는
> 보안 성격이 정반대다.

**src/lib/storage.ts** (실제 구현 발췌):

```typescript
import fs from 'fs';
import path from 'path';

import { logger } from '@/lib/logger';

// 보안(C4): 웹루트(public) 밖에 저장하여 정적 서빙으로 인한 무인증 접근을 차단한다.
// 다운로드는 인증 라우트(/api/attachments/[id]/download)로만 제공된다.
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), 'var', 'uploads');

// 레거시 저장 위치. 과거 업로드분의 다운로드 폴백 조회에만 사용한다.
const LEGACY_PUBLIC_DIR = path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export async function uploadAttachmentBlob(srId: string, file: File): Promise<UploadResult> {
  // 파일명 정화: 경로 구분자/상위 경로 제거 후 안전 문자만 허용 (경로 탐색 방지)
  const baseName = path.basename(file.name).replace(/\s+/g, '-');
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
  const safeSrId = path.basename(srId); // 방어적
  const timestamp = Date.now();

  const srDir = path.join(STORAGE_DIR, 'attachments', safeSrId);
  const filename = `${timestamp}-${safeName}`;
  const filepath = path.join(srDir, filename);

  // 경로 탐색(Directory Traversal) 방지: 최종 경로가 STORAGE_DIR 내부인지 확인
  const resolvedRoot = path.resolve(STORAGE_DIR);
  if (!path.resolve(filepath).startsWith(resolvedRoot + path.sep)) {
    logger.warn(`[storage] Attempted path traversal on upload: ${file.name}`);
    throw new Error('잘못된 파일 경로입니다.');
  }

  await fs.promises.mkdir(srDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.promises.writeFile(filepath, buffer);

  // DB 에는 STORAGE_DIR 기준 "상대 경로"만 저장한다(절대 경로/공개 URL 이 아니다).
  const pathname = `attachments/${safeSrId}/${filename}`;
  return { url: pathname, pathname, downloadUrl: pathname, size: file.size, type: file.type };
}

/**
 * storagePath/fileUrl 로부터 실제 파일의 절대 경로를 안전하게 해석한다.
 * STORAGE_DIR 우선, 없으면 LEGACY_PUBLIC_DIR 폴백. 두 루트 밖이면 null(containment check).
 */
export function resolveAttachmentFilePath(
  storagePathOrUrl: string | null | undefined
): string | null;

export async function deleteAttachmentBlob(pathname: string); // 해석 후 unlink, 실패는 로그만
```

`listAttachmentBlobs()` 는 Vercel Blob 의 `list()` 반환 타입을 맞추기 위한 **스터브**이며
항상 빈 배열과 경고 로그를 남긴다(재귀 탐색 미구현).

**함수 대응표**

| 초안 (Vercel Blob)               | 실제 (`src/lib/storage.ts`)                     |
| -------------------------------- | ----------------------------------------------- |
| `put()` / `uploadSRAttachment()` | `uploadAttachmentBlob(srId, file)`              |
| `del()`                          | `deleteAttachmentBlob(pathname)`                |
| `head()` / `getFileInfo()`       | 없음. 경로 해석은 `resolveAttachmentFilePath()` |
| `list()`                         | `listAttachmentBlobs()` — 스터브(항상 빈 배열)  |
| `blob.url` (공개 CDN URL)        | `/api/attachments/{id}/download` (인증 라우트)  |

### 파일 업로드 / 다운로드 (실제 구현)

> **⚠️ 정정(2026-07-30)**: 이 절은 원래 `server/actions/attachment.ts` Server Action 에서
> Vercel Blob 에 올리고 공개 `fileUrl` 을 DB 에 저장하는 흐름을 기술했다. 실제로는 **REST 라우트**
> 두 개로 구현되어 있고, 검증·경로·권한 모델이 전부 다르다. 아래는 실물이다.

| 라우트                               | 파일                                             | 비고                                     |
| ------------------------------------ | ------------------------------------------------ | ---------------------------------------- |
| `POST /api/srs/[id]/attachments`     | `src/app/api/srs/[id]/attachments/route.ts`      | 다중 업로드(최대 10개), 스트리밍 저장    |
| `GET /api/srs/[id]/attachments`      | 같은 파일                                        | 목록. `storagePath` 는 응답에서 제거     |
| `POST /api/attachments`              | `src/app/api/attachments/route.ts`               | 단건 업로드. `uploadAttachmentBlob` 사용 |
| `GET /api/attachments/[id]/download` | `src/app/api/attachments/[id]/download/route.ts` | 인증 후 파일 스트리밍                    |
| `DELETE /api/attachments/[id]`       | `src/app/api/attachments/[id]/route.ts`          | DB 삭제 + `deleteAttachmentBlob`         |

**업로드 시 검증** (`src/lib/file-validator.ts`)

- 확장자 블랙리스트: `.exe .bat .cmd .com .pif .scr .vbs .js .jar .msi .app .deb .rpm .dmg .pkg .sh .bash .ps1`
- **Magic Number 기반 MIME 검증**(`file-type` 패키지) — 확장자 스푸핑을 막는다.
- 타입별 최대 크기: 이미지 5~10MB, 문서(pdf/doc/xls) 20MB, 프레젠테이션 50MB,
  압축(zip/rar/7z) 50MB, 텍스트 5MB, CSV 10MB.
  초안이 적었던 "일괄 10MB" 제한은 실제 규칙이 아니다.
- **절대 상한 50MB** (`MAX_UPLOAD_FILE_SIZE`). 요청 총합도 같은 값(`MAX_UPLOAD_TOTAL_SIZE`)이며
  nginx `client_max_body_size 50m` 과 일치한다.
- 두 업로드 라우트(`POST /api/attachments`, `POST /api/srs/{id}/attachments`) 모두
  `assertUploadSizeWithinLimit()` 로 **`formData()` 호출 전에** Content-Length 를 검사해
  초과 요청을 413 으로 거부한다. Node 의 `Request.formData()` 는 모든 파트를 인메모리 Blob 으로
  파싱하므로, 파싱 후의 타입별 검증만으로는 메모리를 보호하지 못한다(감사 3.41).
- 업로드 라우트는 `export const runtime = 'nodejs'` 를 명시한다(파일시스템 접근 필요).

**업로드 흐름** (`POST /api/srs/[id]/attachments`)

1. SR 조회 → `ensureCanReadSR(session.user, sr)` 로 테넌트/역할 경계 확인.
2. `formData.getAll('files')` — 0개면 400, 10개 초과면 400.
3. 파일별 `validateFile()` → 통과분만 `createWriteStream` + `stream/promises.pipeline` 로 저장
   (전체를 메모리에 올리지 않는다). 파일명은 `${timestamp}_${index}_${정화된 원본명}` 으로
   병렬 업로드 시 충돌을 피한다.
4. `createManyAndReturn()` 으로 DB 삽입 후, 생성된 id 로 `fileUrl` 을
   `/api/attachments/{id}/download` 로 갱신한다(공개 URL 이 존재하지 않으므로).
5. 응답에서 `storagePath`(내부 저장 경로)는 제거하고, `fileSize`(BigInt)는
   `src/lib/serialization.ts` 로 직렬화한다.
6. 일부만 실패하면 성공분 + `errors` 배열을 함께 반환하고, 전부 실패하면 400.

**다운로드 흐름** (`GET /api/attachments/[id]/download`)

1. 첨부 → 소속 SR 조회 → `ensureCanReadSR()` (IDOR 방지).
2. `resolveAttachmentFilePath()` 로 경로 해석(두 루트 밖이면 404).
3. `Content-Disposition` 은 이미지/PDF 만 `inline`, 그 외는 `attachment` 로 강제한다.
   `image/svg+xml` 은 앱 오리진에서 스크립트가 실행될 수 있어 **명시적으로 inline 금지**다.

**알려진 불일치**: `POST /api/srs/[id]/attachments` 는 `src/lib/storage.ts` 의
`uploadAttachmentBlob()` 을 쓰지 않고 라우트 안에서 직접 경로를 만든다. 그래서 저장 경로가
두 갈래다 — 라우트는 `attachments/{timestamp}_{index}_{name}`, 헬퍼는
`attachments/{srId}/{timestamp}-{name}`. 다운로드는 두 형태를 모두 해석하므로 동작에는
문제가 없지만, 저장 규칙이 한 곳에 모여 있지 않다.

---

## 캐싱 전략

### Next.js Cache Utility

> **참고(2026-07-30 확인)**: 초기 설계는 **Upstash Redis** 를 전제했으나 **채택되지 않았다.**
> Redis 자체가 배포에 없다. 현재는 Next.js 내장 `unstable_cache` 와 프로세스 내 Map 만 쓴다.
> 단일 컨테이너 전제이므로 캐시는 인스턴스 밖으로 공유되지 않으며, 컨테이너를 재생성하면 비워진다.

**src/lib/cache.ts** (현재 구현 전문 — 이 파일에 있는 것은 이 두 함수뿐이다):

```typescript
import { unstable_cache as cache } from 'next/cache';

import prisma from '@/lib/prisma';

/**
 * Next.js unstable_cache 기반 캐시 유틸리티
 * Redis 제거 후 간소화된 버전
 */

// 사용자 목록 캐싱
export const getCachedUsers = cache(
  async () => {
    return prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  },
  ['users'],
  { revalidate: 300 } // 5분마다 갱신
);

// 고객사 목록 캐싱
export const getCachedClients = cache(
  async () => {
    return prisma.client.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  },
  ['clients'],
  { revalidate: 300 } // 5분마다 갱신
);
```

### 캐싱 전략 요약

| 항목            | 현재 구현                             | 비고                                     |
| --------------- | ------------------------------------- | ---------------------------------------- |
| **캐시 백엔드** | Next.js `unstable_cache`              | 앱 컨테이너 로컬. 인스턴스 간 공유 안 됨 |
| **TTL**         | 5분 (300초)                           | `revalidate` 옵션                        |
| **무효화**      | `revalidatePath()`, `revalidateTag()` | Next.js 내장                             |
| **분산 캐시**   | 없음                                  | Redis 미도입 (단일 컨테이너)             |
| **캐시 대상**   | 활성 사용자 목록, 활성 고객사 목록    | `src/lib/cache.ts` 에 있는 것은 이 둘뿐  |

### Rate Limiting

Rate Limiting 은 프로세스 내 메모리 토큰 버킷으로 구현되어 있다. 분산 스토어(Redis 등)는 없다.

> **정정(2026-07-30)**: 이 절에 실려 있던 `checkRateLimit(identifier)` 예시는 실제 코드가
> 아니었다(그런 함수는 존재하지 않는다). 아래는 `src/lib/rate-limiter.ts` 의 실제 구조다.

**src/lib/rate-limiter.ts** (실제 구현 발췌):

```typescript
export class MemoryRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();

    // Edge Runtime 등 타이머 미지원 환경 대응: 호출 시점에 점진적으로 정리한다.
    this.performIncrementalEviction(now);

    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.lastRefill >= this.config.windowMs) {
      bucket = { tokens: this.config.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const allowed = bucket.tokens > 0;
    if (allowed) bucket.tokens--;

    return {
      allowed,
      current: this.config.maxRequests - bucket.tokens,
      limit: this.config.maxRequests,
      resetTime: this.config.windowMs - (now - bucket.lastRefill),
      remaining: Math.max(0, bucket.tokens),
    };
  }

  // 1) 10% 확률로 임의 5개를 샘플링해 만료 버킷만 제거(O(1) 수준)
  // 2) 버킷이 10,000개를 넘으면 가장 오래된 500개를 FIFO 로 강제 방출(OOM 방지)
  private performIncrementalEviction(now: number): void {
    /* … */
  }
}
```

**프리셋** (모두 환경 변수로 재정의 가능. 값이 없으면 아래 기본값)

| 프리셋        | 기본값       | 용도                     | 환경 변수 접두어           |
| ------------- | ------------ | ------------------------ | -------------------------- |
| `STRICT`      | 1분당 5회    | 로그인 등 민감한 작업    | `RATE_LIMIT_STRICT_*`      |
| `STANDARD`    | 1분당 100회  | 일반 API                 | `RATE_LIMIT_STANDARD_*`    |
| `RELAXED`     | 1분당 300회  | 읽기 전용 API            | `RATE_LIMIT_RELAXED_*`     |
| `FILE_UPLOAD` | 1시간당 20회 | 파일 업로드              | `RATE_LIMIT_FILE_UPLOAD_*` |
| `MIDDLEWARE`  | 1분당 100회  | 미들웨어(`src/proxy.ts`) | `RATE_LIMIT_MIDDLEWARE_*`  |

> `.env.example` 은 `MIDDLEWARE` 를 1분당 20회로 예시하지만, 코드의 **기본값은 100회**다
> (`RateLimitPresets.MIDDLEWARE`). 환경 변수를 설정하지 않으면 100이 적용된다.

식별자는 `getClientIp()` 가 결정한다. `X-Real-IP` 를 최우선으로 쓰고, 없으면
`X-Forwarded-For` 의 **마지막** 항목을 쓴다(nginx 가 실제 클라이언트를 마지막에 추가하므로
첫 항목은 클라이언트가 위조할 수 있다). 프록시를 거치지 않으면 `'unknown'` 이다.

### 향후 Redis 도입 시나리오 (미결정 로드맵)

아래는 **아직 결정되지 않은 향후 검토 항목**이다. 현재 Redis 는 도입되어 있지 않다.
다음 조건 중 하나라도 해당되면 도입 검토가 필요하다.

1. **다중 인스턴스 배포**: 캐시·rate limit 버킷·SSE 연결이 프로세스에 묶여 있어 즉시 깨진다
2. **세션 공유**: 현재는 JWT 세션이라 서버 상태가 없으나, DB 세션으로 바꾸면 필요해진다
3. **정밀한 Rate Limiting**: 인스턴스별 독립 카운팅 문제 해소
4. **알림 영속화/재시도**: 현재 `backgroundTask` 는 유실 가능하므로 큐 또는 outbox 가 필요하다

---

## 에러 처리

### 에러 클래스 (실제 구현)

> **⚠️ 정정(2026-07-30)** — 이 절의 초안은 `AppError` 를 기반으로 한 5개 클래스와
> `logError()` 안의 `// Sentry로 전송` 주석을 담고 있었다. 실제 계층의 이름과 개수가 다르며,
> **Sentry 는 사용하지 않는다**(아래 "에러 추적" 참고). 아래는 `src/lib/errors.ts` 의 실물이다.

```typescript
import { logger } from '@/lib/logger';

/**
 * 기본 Service 에러 클래스 (초안의 AppError 에 해당)
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
```

`ServiceError` 를 상속하는 클래스는 10개다. HTTP 상태와 `code` 를 클래스가 함께 들고 있다.

| 클래스                      | status | code                              | 용도                        |
| --------------------------- | ------ | --------------------------------- | --------------------------- |
| `ValidationError`           | 400    | `VALIDATION_ERROR`                | 입력 검증 실패              |
| `BadRequestError`           | 400    | `BAD_REQUEST`                     | 잘못된 요청                 |
| `BusinessRuleError`         | 400    | `BUSINESS_RULE_VIOLATION`         | 도메인 규칙 위반            |
| `UnauthorizedError`         | 401    | `UNAUTHORIZED`                    | 미인증                      |
| `ForbiddenError`            | 403    | `FORBIDDEN`                       | 권한 없음                   |
| `NotFoundError`             | 404    | `NOT_FOUND`                       | 리소스 없음                 |
| `ConflictError`             | 409    | `CONFLICT`                        | 낙관적 잠금 실패(동시 수정) |
| `DuplicateError`            | 409    | `DUPLICATE`                       | 중복 리소스                 |
| `ReferentialIntegrityError` | 409    | `REFERENTIAL_INTEGRITY_VIOLATION` | 참조 무결성 위반            |
| `TooManyRequestsError`      | 429    | `TOO_MANY_REQUESTS`               | Rate Limit 초과             |

같은 파일에 Prisma 의 알려진 오류 코드(`P2003` 등)를 위 도메인 에러로 변환하는 헬퍼가 있어,
DB 제약 위반이 500 대신 적절한 4xx 로 내려간다.

### API 에러 응답 (실제 구현)

**src/lib/api-error-handler.ts** — 초안의 `handleApiError()` 는 평범한 객체를 반환했지만,
실물은 `NextResponse` 를 만들고 로그 레벨을 에러 종류별로 나눈다.

```typescript
export function handleApiError(
  error: unknown,
  context?: { userId?: string; path?: string; method?: string }
): NextResponse {
  if (error instanceof ServiceError) {
    logger.logError(error, context);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    const firstError = error.issues?.[0];
    // 사용자 입력 실수는 error 가 아니라 warn 으로 남긴다(운영 로그 노이즈 방지).
    logger.warn('Validation error', {
      ...context,
      custom_validationError: firstError?.message,
      custom_path: firstError?.path?.join('.'),
    });
    return NextResponse.json(
      { error: firstError?.message || '유효성 검사 실패', code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    logger.error('Unexpected error', error, context);
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }

  logger.error('Unknown error', undefined, {
    ...context,
    custom_errorType: typeof error,
    custom_errorValue: String(error),
  });
  return NextResponse.json(
    { error: '알 수 없는 오류가 발생했습니다.', code: 'UNKNOWN_ERROR' },
    { status: 500 }
  );
}
```

### 로깅과 에러 추적

> **⚠️ Sentry 는 사용하지 않는다 (소유자 결정, 2026-07-30).** Axiom 도 채택되지 않았다.
> 초안에 있던 `// Sentry로 전송` 예시와 `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` /
> `AXIOM_*` 환경 변수는 삭제했다. `src/lib/logger.ts` 파일 상단 주석은 아직
> "에러 트래킹 서비스(Sentry 등) 연동 가능" 이라고 적고 있으나, 그것은 가능성 서술이며
> 연동 코드는 존재하지 않는다.

**현재 로깅 경로**: `src/lib/logger.ts` (싱글톤 `logger`) → 프로덕션에서 **pino 10** →
stdout → Docker `json-file` 드라이버(10MB × 3 로테이션, `docker-compose.prod.yml`).
**호스트 밖으로 전송되지 않는다.**

```typescript
class Logger {
  private isBrowser = typeof window !== 'undefined';
  private isEdge = process.env.NEXT_RUNTIME === 'edge';
  private isProduction = process.env.NODE_ENV === 'production';

  private pinoLogger: ReturnType<typeof pino> | null = null;

  // 브라우저/Edge 에서는 pino 를 로드하지 않는다(Node 전용 API 로 크래시 방지).
  // 프로덕션 Node 런타임에서만 동적 require 로 pino 를 붙이고, 실패하면 console 로 폴백한다.
  private initPino(): void {
    if (!this.isProduction || this.isEdge || this.isBrowser) return;
    /* pino.destination({ sync: false, minLength: 4096 }) 로 비동기 버퍼 출력 */
  }

  // 프로덕션에서는 error / warn 만 출력한다(개발에서는 전부).
  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) return true;
    return level === 'error' || level === 'warn';
  }
}

export const logger = new Logger();
```

메서드는 `debug` / `info` / `warn` / `error` / `logError(ServiceError)` / `logRequest(...)` 이며,
컨텍스트는 `userId` · `srId` · `clientId` · `requestId` 와 `custom_*` 임의 키를 받는다.

**여기가 공백이다.** 에러가 발생해도 알림을 받을 수단이 없고, 로그는 컨테이너 로테이션 안에서만
살아 있으며, 검색 가능한 저장소가 없다. 관측성 중 현재 확보된 것은 **uptime-kuma 컨테이너로
외부에서 확인하는 가용성 감시뿐**이며, 이 컨테이너는 저장소의 어떤 compose 파일에도 정의되어
있지 않아 코드만 봐서는 보이지 않는다(SSH 로 확인). 해법은 Sentry 가 아니라 **자체 호스팅
방향**으로 검토해야 한다(구체안 미정 — 정하지 않은 것을 여기에 적지 않는다).

### Global Error Boundary

**src/app/error.tsx** (실제 구현):

```tsx
'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h2 className="text-2xl font-bold tracking-tight">문제가 발생했습니다</h2>
        <p className="text-muted-foreground">
          요청을 처리하는 도중 예기치 않은 오류가 발생했습니다.
        </p>
      </div>
      <Button onClick={() => reset()}>다시 시도</Button>
    </div>
  );
}
```

> 초안과 달리 `error.message` 를 화면에 노출하지 않는다(서버 내부 메시지 유출 방지).
> 클라이언트 콘솔 로그 외에 이 경계에서 **외부로 전송하는 곳은 없다** — 에러 추적 서비스가
> 없으므로 사용자가 본 클라이언트 오류는 서버에 기록되지 않는다.
> `src/app/not-found.tsx` 도 함께 존재한다.

---

## 성능 최적화

### React Query 설정

**src/components/providers/ClientLayout.tsx** (실제 구현. `lib/react-query.tsx` 는 없다):

```tsx
'use client';

import { ReactNode, useState } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Devtools를 전용 컴포넌트로 분리하여 HMR 안정성 확보
const QueryDevtools = dynamic(() => import('./QueryDevtools'), { ssr: false });

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            gcTime: 5 * 60 * 1000, // 5분 (react-query v5. v4 의 cacheTime 이 아니다)
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeProvider>
          {/* SSE(/api/realtime) 구독 */}
          <IdleTimeoutProvider>
            {children}
            <Toaster />
            <PWARegistration /> {/* 서비스 워커 등록(웹 푸시) */}
          </IdleTimeoutProvider>
        </RealtimeProvider>
      </SessionProvider>
      {process.env.NODE_ENV === 'development' && <QueryDevtools />}
    </QueryClientProvider>
  );
}
```

> 초안은 옵션 이름을 `cacheTime` 으로 적었다. @tanstack/react-query 5.90 에서는 `gcTime` 이며
> `cacheTime` 은 무시된다. 또한 실제 프로바이더는 NextAuth 세션, SSE, 유휴 타임아웃,
> PWA 서비스 워커 등록을 함께 감싼다.

### 커스텀 훅

> **⚠️ 아래 예시는 초안이다.** `src/hooks/use-srs.ts` 는 없다. 실제 훅은
> `src/hooks/use-sr.ts`(`useSRDetails`, `useUpdateSR`, `useDeleteSR`, `useChangeSRStatus`)와
> `src/hooks/use-sr-infinite.ts`(`useSRActivitiesInfinite`, `useSRCommentsInfinite`)이며,
> Server Action 을 직접 `mutationFn` 으로 넘기지 않고 REST 라우트를 호출한다.
> 목록 조회는 훅이 아니라 서버 컴포넌트에서 처리한다.

**초안: hooks/use-srs.ts**:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSRs, createSR, updateSR } from '@/server/actions/sr';
import { SRStatus, SRPriority } from '@prisma/client';

export function useSRs(params: {
  clientId?: string;
  status?: SRStatus;
  priority?: SRPriority;
  page?: number;
}) {
  return useQuery({
    queryKey: ['srs', params],
    queryFn: () => getSRs(params),
    staleTime: 30 * 1000, // 30초
  });
}

export function useCreateSR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSR,
    onSuccess: () => {
      // SR 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['srs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateSR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSR,
    onSuccess: (data) => {
      // 특정 SR 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['sr', data.data.id] });
      queryClient.invalidateQueries({ queryKey: ['srs'] });
    },
  });
}
```

### Next.js 캐싱 전략

```typescript
// Server Components에서 fetch 사용 시

// 정적 데이터 (빌드 시 캐시)
const staticData = await fetch('https://...', {
  cache: 'force-cache',
});

// 동적 데이터 (요청마다 재검증)
const dynamicData = await fetch('https://...', {
  cache: 'no-store',
});

// ISR (60초마다 재검증)
const revalidatedData = await fetch('https://...', {
  next: { revalidate: 60 },
});

// 태그 기반 재검증
const taggedData = await fetch('https://...', {
  next: { tags: ['srs'] },
});
```

---

## 보안

### 입력 검증

모든 입력은 Zod 스키마로 검증:

```typescript
import { z } from 'zod';

export const srSchema = z.object({
  title: z.string().min(5).max(200).trim(),
  description: z.string().min(20).trim(),
  clientId: z.string().cuid(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
});
```

### SQL Injection 방지

Prisma ORM 사용으로 자동 방지:

```typescript
// ✅ Safe - Parameterized query
const user = await db.user.findUnique({
  where: { email: userInput },
});

// ❌ Never use raw SQL with user input
// const users = await db.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${userInput}'`)
```

### XSS 방지

React의 자동 이스케이프 + CSP 헤더.

> **정정(2026-07-30)**: CSP 는 `next.config.js` 의 `headers()` 가 아니라
> **미들웨어 `src/proxy.ts` 에서 요청마다 동적으로** 설정한다(요청별 nonce 를 만들기 위해).
> `next.config.ts` 의 `headers()` 는 CSP 를 포함하지 않으며 나머지 보안 헤더만 담당한다.
> 파일명도 `next.config.js` 가 아니라 `next.config.ts` 다.

**src/proxy.ts** (CSP, 요청별 nonce):

```typescript
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

// 개발 모드의 HMR 은 'unsafe-eval' 을 요구한다. 프로덕션에서는 넣지 않는다.
const isDev = process.env.NODE_ENV === 'development';
const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'nonce-${nonce}' ${isDev ? "'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `
  .replace(/\s{2,}/g, ' ')
  .trim();

response.headers.set('Content-Security-Policy', cspHeader);
response.headers.set('x-nonce', nonce);
```

**next.config.ts** (정적 보안 헤더):

```typescript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '0' }, // 레거시 필터 비활성(CSP 로 대체)
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ];
}
```

같은 파일은 Docker 배포를 위해 `output: 'standalone'` 을, pino 번들링 회피를 위해
`serverExternalPackages: ['pino', 'thread-stream']` 을 설정한다.

> **잔재 주의**: `next.config.ts` 의 `images.remotePatterns` 에는 아직
> `**.public.blob.vercel-storage.com` 이 남아 있다. Vercel Blob 은 채택되지 않았으므로
> 이 패턴은 실제로 매칭될 일이 없는 미채택 스택의 흔적이다(코드 정리 대상).

### CSRF 방지

NextAuth.js가 자동으로 처리:

```typescript
// NextAuth.js는 자동으로 CSRF 토큰 생성 및 검증
```

---

## 테스트 전략

> **⚠️ 정정(2026-07-30)** — 이 절의 초안은 `tests/{unit,integration,e2e}/` 디렉토리와
> 그 안의 예시 테스트를 기술했으나, **그런 디렉토리는 존재하지 않는다.** 실제 배치와 도구
> 버전, 그리고 커버리지 수치를 실측값으로 교체했다.

### 도구와 버전 (2026-07-30 `package.json` 실측)

| 목적            | 도구                                                     | 실행 명령                                     |
| --------------- | -------------------------------------------------------- | --------------------------------------------- |
| 단위/컴포넌트   | **vitest 4.0** (`@vitest/coverage-v8` v8 프로바이더)     | `pnpm test`, `pnpm test:coverage`             |
| 컴포넌트 스토리 | Storybook 10 + `@storybook/addon-vitest` (브라우저 모드) | `pnpm test:coverage` 에 포함                  |
| E2E             | **Playwright 1.58**                                      | `pnpm test:e2e`                               |
| 뮤테이션        | **Stryker 9.5.1** (`@stryker-mutator/vitest-runner`)     | `pnpm test:mutation`, `pnpm test:mutation:ci` |
| 접근성          | `@axe-core/playwright`                                   | `e2e/30-accessibility.spec.ts`                |
| API 목킹        | Vitest `vi.mock` (모듈 단위)                             | 단위 테스트                                   |

### 파일 배치

- **단위 테스트**: 소스 옆 `src/**/__tests__/*.test.ts(x)` (2026-07-30 기준 136개 파일).
  `vitest.config.ts` 의 `include` 는 `src/**/*.test.ts`, `src/**/*.test.tsx` 다.
  예: `src/lib/__tests__/domain-events.test.ts`, `src/services/__tests__/`,
  `src/app/api/**/__tests__/route.test.ts`.
- **E2E**: 루트 `e2e/` (스펙 31개 + `e2e/roles/`, `e2e/helpers/`, setup 프로젝트).
- **통합 테스트 디렉토리는 없다.** DB 를 실제로 쓰는 검증은 CI 의 `test` 잡이 postgres
  서비스 컨테이너를 띄운 상태에서 같은 vitest 스위트를 돌리는 방식으로 대신한다.

### 커버리지 기준선 (실측)

**측정 시점: 2026-07-30. 명령: `pnpm test:coverage`(= `vitest run --coverage`, unit + storybook
두 프로젝트 전부 — CI 와 동일한 명령).**

| 지표       | 실측    | 게이트 임계값 | 절대 개수     |
| ---------- | ------- | ------------- | ------------- |
| statements | 41.27 % | 40.9          | 3,026 / 7,331 |
| branches   | 35.63 % | 35.2          | 1,785 / 5,009 |
| functions  | 41.98 % | 41.6          | 710 / 1,691   |
| lines      | 40.75 % | 40.4          | 2,780 / 6,821 |

분모는 소스 232개다. `vitest.config.ts` 의 `coverage.include` 로 "테스트가 우연히 import 한
파일"이 아니라 **소스 전체**를 분모로 고정했다. 이 고정 이전에는 같은 코드가
statements 84.39 % 로 보였다(분모가 111개뿐이었기 때문이다). 84 % 는 코드가 좋아서 나온
숫자가 아니었다.

임계값 미달 시 vitest 가 실패하고 CI 의 `test` 잡이 빨간불이 된다. Codecov 업로드는
리포팅 전용이며 게이트가 아니다.

> **수치를 고칠 때의 규칙**: `pnpm test:coverage` 로 재측정한 뒤 이 표와 측정 시점을 함께
> 갱신할 것. 임계값을 **낮추는 것은 원칙적으로 금지** — 낮춰야 하는 상황이라면 그것이 바로
> 게이트가 잡아낸 회귀다.

### 뮤테이션 테스트 기준선 (실측)

**측정 시점: 2026-07-30 (PR #247 CI 실행). 변경 파일 9개, 뮤턴트 2,788개, 37.6분 소요.**

- **전체 뮤테이션 점수 49.64 %** (killed 1,379 / survived 1,107 / no-coverage 294 / timeout 2)
- `stryker.config.mjs` 의 `thresholds.break = 45` 가 게이트다. `break` 가 없던 시절에는
  점수가 0이어도 exit 0 이었다(항상 통과하는 가짜 게이트).
- `scripts/stryker-ci.ts` 가 PR 에서 변경된 `.ts` 파일만 `--mutate` 로 넘기므로,
  이 점수는 "이번 PR 이 건드린 파일들의 점수" 다.

파일별(같은 실행):

| 파일                             | 점수    | survived |
| -------------------------------- | ------- | -------- |
| `src/actions/user.actions.ts`    | 94.87 % | 4        |
| `src/lib/policies.ts`            | 76.44 % | 49       |
| `src/app/api/srs/route.ts`       | 73.81 % | 10       |
| `src/services/client.service.ts` | 54.87 % | 67       |
| `src/lib/serialization.ts`       | 51.43 % | 46       |
| `src/services/push.service.ts`   | 44.02 % | 83       |
| `src/lib/env-validation.ts`      | 30.61 % | 325      |

이 파일들의 **라인 커버리지는 84~100 %** 인데 뮤턴트 절반이 살아남는다. 즉 "코드를 실행하지만
동작을 검증하지 않는 테스트" 가 상당수라는 뜻이다. 커버리지 숫자만으로 품질을 판단하지 말 것.

### E2E 실행 범위 (`playwright.config.ts` + `.github/workflows/ci-cd.yml`)

Playwright 프로젝트는 `setup`, `multi-user-setup`, `role-persona-setup`(의존 setup),
`chromium`, `multi-user`, `role-personas`, `permissions`, 그리고 `firefox` / `webkit` /
`Mobile Chrome` 이다.

- **main push**: 전체 선택 실행(2026-07-30 `--list` 실측 185개). `chromium` + `multi-user` +
  `role-personas` + `permissions`. `deploy.yml` 이 이 워크플로의 결론에 매달려 있으므로
  여기서 실패하면 운영 배포가 차단된다.
- **pull request**: 보안·권한 스펙만(실측 50개). `permissions` + `role-personas`, 그리고
  `multi-user` 중 `08-user-management` / `09-client-management` / `23-role-exclusivity`.
- **어디서도 실행되지 않는 것**: `firefox` / `webkit` / `Mobile Chrome`
  (`testIgnore` 가 없어 멀티유저 스펙을 단일 인증 상태로 중복 실행한다 — 설정 결함),
  `Dashboard Visual & Performance`(스냅샷이 `*-win32.png` 뿐이라 리눅스에서 반드시 실패하고
  일부는 :6006 Storybook 서버를 요구한다), `Manual Screen Captures`(검증이 아니라 문서용
  스크린샷 생성). PR 에서는 `chromium` 일반 기능 스펙과 `multi-user` 17~22 도 돌지 않는다.

E2E 는 `next dev` 가 아니라 **프로덕션 빌드**(`pnpm build` → `pnpm start`)를 대상으로 돌린다.
`next dev` 는 라우트별 온디맨드 컴파일로 CI 에서 타임아웃 플레이크를 만든다.

### 예시: 단위 테스트

실제 스위트의 형태는 `src/**/__tests__/` 를 직접 보는 편이 정확하다. 참고로 초안이 이 자리에
싣고 있던 `SRService.create()` / `SRService.generateSRNumber()` 예시는 존재하지 않는 API 를
호출하고 있었다(실제 서비스는 정적 메서드가 아니라 `services.srService` 인스턴스를 통해
쓰이며, `src/lib/prisma.ts` 를 목킹한다).

### 예시: E2E 테스트

```typescript
// e2e/*.spec.ts 는 공통 헬퍼로 로그인한다(각 스펙이 셀렉터를 직접 다루지 않는다).
import { test, expect } from '@playwright/test';

import { ADMIN_PERSONA, loginAs } from './helpers/auth-helpers';

test.describe('SR Workflow', () => {
  test('SR 을 생성하고 목록에서 확인한다', async ({ page }) => {
    await loginAs(page, ADMIN_PERSONA); // Persona 객체를 넘긴다(문자열 아님)
    await page.goto('/srs/new');
    // … 폼 작성 후 제출
    await page.goto('/srs');
    await expect(page.getByText('E2E Test SR')).toBeVisible();
  });
});
```

> 위 예시는 구조를 보이기 위한 축약이다. 계정·역할 페르소나는
> `e2e/helpers/auth-helpers.ts` 의 `ROLE_PERSONAS` 와 `prisma/seed.ts` 가 만드는 계정
> (`SEED_*_PASSWORD`, `TEST_*_EMAIL` 환경 변수)이 **계약으로 맞물려 있다.** 시드에 해당
> 계정이 없으면 `role-persona-setup` 프로젝트가 실패한다(의도된 게이트).

---

## 배포 및 CI/CD

> **⚠️ 정정(2026-07-30) — 이 절의 초안은 `amondnet/vercel-action` 으로 Vercel 에 배포하고
> Upstash/Resend/Inngest/Sentry/Axiom 환경 변수를 Vercel 대시보드에 넣는 것을
> 전제했다. Vercel 은 채택되지 않았다.** 실제 배포는 **GHCR 이미지 빌드 → SSH → 자체 서버의
> Docker Compose 재기동** 이다. 아래는 저장소의 워크플로 파일을 읽어 정리한 실제 파이프라인이다.

### 워크플로 구성

| 파일                                     | 이름                                | 트리거                                                        |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `.github/workflows/ci-cd.yml`            | **CI/CD Pipeline**                  | `push`/`pull_request` (main, dev). `**.md`, `docs/**` 는 제외 |
| `.github/workflows/deploy.yml`           | Deploy to Self-Hosted Docker Server | `workflow_run` — 위 워크플로가 **성공**한 뒤                  |
| `.github/workflows/e2e.yml`              | E2E                                 | 별도                                                          |
| `.github/workflows/backup.yml`           | Scheduled Backup                    | 매일 UTC 18:00 (KST 03:00)                                    |
| `.github/workflows/scheduled-checks.yml` | Code Quality & Security             | 매일 UTC 00:00                                                |
| `.github/workflows/prewarm.yml`          | Prewarm Cache                       | `workflow_dispatch`                                           |

> **`ci-cd.yml` 의 워크플로 이름(`CI/CD Pipeline`)은 절대 바꾸면 안 된다.** `deploy.yml` 이
> `workflow_run: workflows: ['CI/CD Pipeline']` 로 이 문자열에 매달려 있어, 이름을 바꾸면
> 배포가 **조용히** 멈춘다.

### CI (`ci-cd.yml`) 잡 구성

Node 22 / pnpm 10 기준이다(초안은 Node 18 + `npm install -g pnpm` 이었다).

| 잡                 | 게이트 내용                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-quality`     | `pnpm lint`, `pnpm type-check`                                                                                                                                                 |
| `test`             | **실제 postgres:16-alpine 서비스 컨테이너**에서 `prisma migrate deploy` → 스키마 drift 검사(`migrate diff --exit-code`) → `pnpm db:seed` → `pnpm test:coverage`(임계값 게이트) |
| `mutation-test`    | PR 에서만. `pnpm test:mutation:ci` (변경 파일만, `break: 45`)                                                                                                                  |
| `build`            | `pnpm build` 후 `.next` 존재 확인                                                                                                                                              |
| `e2e-test`         | main push 는 전체 선택, PR 은 보안·권한 서브셋 (위 "테스트 전략" 참고)                                                                                                         |
| `security`         | `pnpm audit --prod --audit-level=critical` (**게이트**) + Trivy SARIF/table(리포트 전용)                                                                                       |
| `deployment-ready` | main push 에서 위 잡들이 모두 성공했을 때만 성공 로그를 남긴다                                                                                                                 |

`test` 잡이 진짜 DB 를 띄우는 이유는 두 가지다. (1) 마이그레이션이 빈 DB 에 실제로 적용되는지
검증한다. (2) 테스트가 `$transaction` 을 스텁하지 않고 실제 쿼리를 돌릴 수 있게 한다.

### 배포 (`deploy.yml`)

```yaml
on:
  workflow_run:
    workflows: ['CI/CD Pipeline']
    types: [completed]
    branches: [main, dev]

# 단일 서버(/home/opc/sr, 동일 docker 데몬)를 main/dev 배포가 공유하므로 전부 직렬화한다.
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

- CI 가 **성공**한 **push** 이벤트에서만 실행된다
  (`workflow_run.conclusion == 'success' && workflow_run.event == 'push'`).
- `workflow_run` 은 기본 브랜치를 체크아웃하므로 CI 를 통과한 커밋
  (`github.event.workflow_run.head_sha`)을 **명시적으로** 다시 체크아웃한다.
- 이미지: `docker/build-push-action` 으로 `ghcr.io/lkindo/sr` 에 푸시.
  태그는 `main` → `latest`, 그 외(dev) → `dev`.
- 설정 파일(`docker-compose.*.yml`, `nginx/nginx.conf`, `scripts/*.sh`)을 `scp` 로
  `/home/opc/sr` 에 복사한다. **`.env.docker*` 는 저장소에 없다** — 런타임 시크릿은 SSH 단계에서
  GitHub Secrets(base64)로부터 서버에 직접 기록한다.
- 컨테이너를 내리기 **전에** 시크릿 존재 여부와 `docker compose config -q` 보간을 검증한다.
  실패하면 아무것도 건드리지 않고 중단하므로 현재 서비스는 계속 살아 있다.
- 재기동은 `pull` → `down --remove-orphans` → 동명 컨테이너 `docker rm -f` →
  `up -d --force-recreate --remove-orphans` 순이다. 마지막에 컨테이너가 실제로 running 인지
  확인하고 아니면 배포를 실패로 처리한다(과거에 "성공 보고 + 미교체" 사고가 있었다).
- **마이그레이션은 배포 워크플로가 실행하지 않는다.** 컨테이너 시작 시
  `docker-entrypoint.sh` 가 `prisma migrate deploy` 를 수행한다. 시딩도 파이프라인에서
  하지 않는다(과거의 무조건 reseed 가 운영자의 비밀번호 변경을 되돌렸다).
- main 배포는 추가로 443 방화벽 개방, 자가서명 인증서 폴백 생성,
  `scripts/setup-letsencrypt.sh` 실행을 한다. **인증서 자동 갱신은 아직 구성되어 있지 않다.**

### 런타임 구성 (`docker-compose.prod.yml`)

| 서비스  | 이미지                     | 요점                                                                                                                                               |
| ------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nginx` | `nginx:alpine`             | 80/443 공개. `nginx.conf` 와 `certs` 를 read-only bind mount                                                                                       |
| `app`   | `ghcr.io/lkindo/sr:latest` | `expose: 3000`(호스트 비공개). `env_file: .env.docker`, `NODE_OPTIONS=--max-old-space-size=450`, `STORAGE_DIR=/app/var/uploads`, 볼륨 `sr_uploads` |
| `db`    | `postgres:16-alpine`       | 호스트 포트 **비공개**. `POSTGRES_*` 는 `:?` 문법으로 미설정 시 즉시 실패. 볼륨 `sr_db_data`, `pg_isready` healthcheck                             |

세 서비스 모두 로깅은 `json-file` 드라이버, `max-size: 10m` × `max-file: 3` 이다.
네트워크는 내부 브리지 `sr-net`(MTU 1400). 스테이징(dev)은 같은 서버에서
`docker-compose.test.yml` + 프로젝트명 `sr-test` 로 분리 구동한다.

### 환경 변수

운영 값은 `/home/opc/sr/.env.docker`(컨테이너 런타임)와 `.env.prod`(compose 보간)에 있고,
둘 다 GitHub Secrets(`PROD_ENV_DOCKER_B64`, `PROD_COMPOSE_ENV_B64`)에서 생성된다.
스테이징은 `STAGING_*` 시크릿과 `.env.docker.test` / `.env.staging` 을 쓴다.
회전 절차는 `docs/SECRET_ROTATION.md` 를 따른다.

**실제로 코드가 읽는 변수** (`src/lib/env-validation.ts` 의 `ENV_VARIABLES` 기준):

```bash
# Database (필수)
DATABASE_URL="postgresql://…"      # postgresql:// 로 시작해야 한다
DIRECT_URL="postgresql://…"        # 마이그레이션용. 풀러가 없으므로 현재는 위와 동일

# Auth (NEXTAUTH_SECRET 필수, 32자 이상)
NEXTAUTH_SECRET="<32자 이상>"
AUTH_SECRET="<NEXTAUTH_SECRET 과 동일 값>"   # Auth.js v5 가 직접 읽는다
NEXTAUTH_URL="https://<도메인>"
NEXT_PUBLIC_APP_URL="https://<도메인>"        # 알림 링크 생성(src/lib/app-url.ts)

# 파일 저장 (compose 가 주입)
STORAGE_DIR="/app/var/uploads"

# Email — SMTP (nodemailer). 미설정/플레이스홀더면 발송을 건너뛴다
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="…"
EMAIL_SERVER_PASSWORD="…"
EMAIL_FROM="SR System <no-reply@…>"

# Web Push (VAPID). 미설정이면 푸시만 비활성화되고 부팅은 막지 않는다
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<base64url 87~88자>"
VAPID_PRIVATE_KEY="<base64url 43~44자>"
VAPID_SUBJECT="mailto:…"

# Rate Limiting (선택. 미설정 시 코드 기본값)
RATE_LIMIT_{STRICT,STANDARD,RELAXED,FILE_UPLOAD,MIDDLEWARE}_{WINDOW_MS,MAX_REQUESTS}

# compose 보간 전용 (.env.prod / .env.staging)
POSTGRES_USER=…  POSTGRES_PASSWORD=…  POSTGRES_DB=sr_db
```

**삭제된 변수** — 초안이 나열했던 다음 변수들은 어떤 코드도 읽지 않는다:
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`,
`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
`AXIOM_TOKEN`, `AXIOM_ORG_ID`.

> **주의**: `.env.example` 에는 아직 `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`,
> `UPSTASH_REDIS_REST_TOKEN` 항목이 남아 있다. `src/lib/env-validation.ts` 는 이 세 개를
> 검증 목록에 넣지 않으므로 동작에는 영향이 없으나, 신규 참여자가 필요한 값으로 오해할 수 있는
> 잔재다(코드 정리 대상).

### 관측성 현황

- **로그**: pino → stdout → Docker `json-file`(10MB × 3). 호스트 밖으로 나가지 않는다.
- **가용성 감시**: 서버에서 `uptime-kuma` 컨테이너가 구동 중이다(2026-07-30 SSH 확인, 4주 이상
  가동). **저장소의 어떤 compose 파일에도 정의되어 있지 않아** 코드만 보면 존재를 알 수 없다.
- **에러 추적**: 없다. Sentry 는 미사용 결정(2026-07-30), Axiom 도 미채택.
  대체 수단은 자체 호스팅 방향으로 검토하되 **아직 결정된 것이 없다.**
- **백업**: `backup.yml` + `scripts/backup.sh` 가 매일 서버 로컬에 DB dump + uploads 를 남긴다.
  오프호스트 복제는 훅(`OFFSITE_CMD`)만 있고 구성되지 않았다.

---

## 부록

### 환경별 설정 체크리스트

> **정정(2026-07-30)**: 초안의 체크리스트는 Upstash / Resend / Inngest / Vercel /
> Sentry 항목으로 채워져 있었다. 그 항목들은 **채택되지 않은 서비스의 계정 준비 작업**이므로
> 모두 제거하고, 실제로 필요한 준비 작업으로 대체했다.

**Development (로컬)**:

- [ ] Node 22.x, pnpm 10 설치
- [ ] `docker compose -f docker-compose.yml up -d` 로 PostgreSQL 16 컨테이너 기동
- [ ] `.env.example` → `.env` 복사 후 `DATABASE_URL` / `DIRECT_URL` 채우기
- [ ] `NEXTAUTH_SECRET` / `AUTH_SECRET` 생성 (`openssl rand -base64 32`, 32자 이상 동일 값)
- [ ] `pnpm exec prisma migrate deploy` → `pnpm db:seed` (`SEED_DEV_FIXTURES=true`)
- [ ] (선택) SMTP 자격증명 — 없으면 메일 발송을 건너뛴다(부팅은 정상)
- [ ] (선택) VAPID 키 쌍 — 없으면 웹 푸시만 비활성화된다
- [ ] `pnpm verify:static` (type-check + lint + format) 통과 확인

**Staging (dev 브랜치, 같은 서버의 `sr-test` 프로젝트)**:

- [ ] GitHub Secrets `STAGING_ENV_DOCKER_B64`, `STAGING_COMPOSE_ENV_B64` 등록
      (절차: `docs/SECRET_ROTATION.md` 3절)
- [ ] `NEXTAUTH_SECRET` 을 **운영과 다른 값**으로 발급(같으면 스테이징 세션 쿠키가 운영에서도 유효해진다)
- [ ] dev 브랜치 push → `CI/CD Pipeline` 성공 → `deploy.yml` 자동 배포 확인
- [ ] 기준 데이터(권한/역할) 시딩은 필요할 때 서버에서 1회 수동 실행
      (이미지가 `NODE_ENV=production` 이라 테스트 계정/샘플 픽스처는 실행되지 않는다)
- [ ] E2E 서브셋 결과 확인

**Production (main 브랜치)**:

- [ ] GitHub Secrets `PROD_ENV_DOCKER_B64`, `PROD_COMPOSE_ENV_B64`, `SERVER_HOST/USER/KEY` 등록
- [ ] `POSTGRES_USER` / `POSTGRES_PASSWORD` — hex 권장(base64 의 `/`, `+`, `=` 는 URL 인코딩 필요).
      기존 볼륨의 비밀번호 교체는 `ALTER USER` 로 한다(`POSTGRES_*` 는 최초 기동에만 반영된다)
- [ ] 도메인 DNS → 서버, 방화벽 80/443 개방
- [ ] Let's Encrypt 발급(`scripts/setup-letsencrypt.sh`).
      **⚠️ 갱신 자동화는 아직 구성되어 있지 않다 — 만료 전 수동 갱신 필요**
- [ ] named volume `sr_db_data`, `sr_uploads` 존재 확인(재배포 시 데이터 보존의 전제)
- [ ] `backup.yml` 스케줄 동작 확인 + **오프호스트 복제 구성**(현재 미구성)
- [ ] uptime-kuma 감시 대상에 배포 URL 등록 (해당 컨테이너는 저장소에 정의되어 있지 않다)
- [ ] 에러 추적 수단 결정 — **현재 공백. Sentry 는 미사용 결정, 대안 미정**

---

**문서 버전 관리:**

| 버전 | 작성자           | 변경 사항                                                                                                                                                                                                                                              | 작성일     |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1.0  | Development Team | LLD 초안 작성                                                                                                                                                                                                                                          | 2025-11-06 |
| 1.1  | Development Team | 캐싱 전략 절 갱신(Redis 제거)                                                                                                                                                                                                                          | 2025-11-07 |
| 1.2  | Development Team | 미채택 스택(Vercel/Upstash/Vercel Blob/Resend/React Email/Inngest/Sentry) 기술을 실측 구현으로 교체. 디렉토리 구조·DB 연결·알림 파이프라인·이메일·파일 저장소·캐싱/Rate Limit·에러 처리·CSP·테스트 전략·배포/CI·체크리스트 정정. 미구현 절에 배너 추가 | 2026-07-30 |
| 1.3  | Development Team | 초기 설계안의 외부 관리형 데이터베이스 서비스 서술 제거 (미채택 확정, 자체 PostgreSQL 사용)                                                                                                                                                            | 2026-08-06 |

---

_이 문서는 SR 관리 시스템의 구현 수준 설계를 정의하는 Low-Level Design 문서입니다. 실제 개발 시 이 문서를 기반으로 코드를 작성하며, 변경사항이 발생할 경우 문서를 업데이트합니다._
