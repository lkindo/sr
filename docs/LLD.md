# SR Management System - Low-Level Design (LLD)

**문서 버전:** 1.1
**작성일:** 2025-11-06
**최종 수정일:** 2025-11-07
**프로젝트:** SR 관리 시스템
**기술 스택:** Next.js 14 + Supabase PostgreSQL + Vercel

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

1. **Serverless-First**: Vercel Functions에 최적화된 설계
2. **Type Safety**: TypeScript를 활용한 타입 안전성
3. **Performance**: React Server Components와 캐싱 최적화
4. **Scalability**: Stateless 아키텍처와 Connection Pooling
5. **Maintainability**: 모듈화된 구조와 명확한 관심사 분리
6. **Security**: 다층 보안 및 권한 관리

---

## 시스템 아키텍처

### 계층 구조

시스템의 전체 아키텍처 및 레이어드 아키텍처에 대한 고수준 설명은 **[TRD.md](./TRD.md)** 문서를 참조하십시오. LLD에서는 아래의 상세 디렉토리 구조를 통해 구현 레벨의 구조를 설명합니다.

### 디렉토리 구조 상세

```
sr-management/
├── prisma/
│   ├── schema.prisma                 # Prisma 스키마 정의
│   ├── migrations/                   # DB 마이그레이션
│   │   └── YYYYMMDDHHMMSS_migration_name/
│   │       └── migration.sql
│   └── seed.ts                       # 초기 데이터 시딩
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                  # 인증 라우트 그룹
│   │   │   ├── login/
│   │   │   │   └── page.tsx         # 로그인 페이지
│   │   │   ├── register/
│   │   │   │   └── page.tsx         # 회원가입 페이지
│   │   │   └── layout.tsx           # 인증 레이아웃
│   │   │
│   │   ├── (dashboard)/             # 대시보드 라우트 그룹
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx         # 메인 대시보드
│   │   │   ├── srs/
│   │   │   │   ├── page.tsx         # SR 목록
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx     # SR 생성
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx     # SR 상세
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx # SR 수정
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx         # 고객사 목록
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx     # 고객사 생성
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx     # 고객사 상세
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx # 고객사 수정
│   │   │   ├── users/
│   │   │   │   ├── page.tsx         # 사용자 목록
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx     # 사용자 상세
│   │   │   ├── reports/
│   │   │   │   └── page.tsx         # 보고서
│   │   │   └── layout.tsx           # 대시보드 레이아웃
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts     # NextAuth 핸들러
│   │   │   ├── inngest/
│   │   │   │   └── route.ts         # Inngest webhook
│   │   │   ├── webhooks/
│   │   │   │   └── mattermost/
│   │   │   │       └── route.ts     # Mattermost webhook
│   │   │   └── srs/
│   │   │       ├── route.ts         # SR REST API
│   │   │       └── [id]/
│   │   │           └── route.ts     # SR 상세 API
│   │   │
│   │   ├── layout.tsx               # 루트 레이아웃
│   │   ├── page.tsx                 # 홈페이지
│   │   └── error.tsx                # 에러 페이지
│   │
│   ├── components/
│   │   ├── ui/                      # Shadcn UI 컴포넌트
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ...
│   │   │
│   │   ├── forms/                   # 폼 컴포넌트
│   │   │   ├── sr-form.tsx          # SR 생성/수정 폼
│   │   │   ├── client-form.tsx      # 고객사 폼
│   │   │   ├── user-form.tsx        # 사용자 폼
│   │   │   └── form-field.tsx       # 공통 폼 필드
│   │   │
│   │   ├── tables/                  # 테이블 컴포넌트
│   │   │   ├── sr-table.tsx         # SR 테이블
│   │   │   ├── client-table.tsx     # 고객사 테이블
│   │   │   ├── user-table.tsx       # 사용자 테이블
│   │   │   └── data-table.tsx       # 공통 데이터 테이블
│   │   │
│   │   ├── charts/                  # 차트 컴포넌트
│   │   │   ├── priority-chart.tsx   # 우선순위 차트
│   │   │   ├── status-chart.tsx     # 상태 차트
│   │   │   └── trend-chart.tsx      # 트렌드 차트
│   │   │
│   │   ├── dashboard/               # 대시보드 컴포넌트
│   │   │   ├── stats.tsx            # 통계 카드
│   │   │   ├── recent-srs.tsx       # 최근 SR
│   │   │   └── sla-alerts.tsx       # SLA 알림
│   │   │
│   │   ├── sr/                      # SR 관련 컴포넌트
│   │   │   ├── sr-header.tsx        # SR 헤더
│   │   │   ├── sr-details.tsx       # SR 상세 정보
│   │   │   ├── sr-activities.tsx    # 활동 내역
│   │   │   ├── sr-comments.tsx      # 댓글
│   │   │   ├── sr-attachments.tsx   # 첨부파일
│   │   │   └── sr-status-badge.tsx  # 상태 뱃지
│   │   │
│   │   └── layouts/                 # 레이아웃 컴포넌트
│   │       ├── header.tsx           # 헤더
│   │       ├── sidebar.tsx          # 사이드바
│   │       ├── footer.tsx           # 푸터
│   │       └── nav-menu.tsx         # 네비게이션 메뉴
│   │
│   ├── lib/
│   │   ├── db.ts                    # Prisma Client 인스턴스
│   │   ├── auth.ts                  # NextAuth 설정
│   │   ├── redis.ts                 # Upstash Redis 클라이언트
│   │   ├── storage.ts               # Vercel Blob 클라이언트
│   │   ├── utils.ts                 # 공통 유틸리티
│   │   ├── validations.ts           # Zod 스키마
│   │   └── constants.ts             # 상수 정의
│   │
│   ├── server/
│   │   ├── actions/                 # Server Actions
│   │   │   ├── auth.ts              # 인증 액션
│   │   │   ├── sr.ts                # SR 액션
│   │   │   ├── client.ts            # 고객사 액션
│   │   │   ├── user.ts              # 사용자 액션
│   │   │   └── comment.ts           # 댓글 액션
│   │   │
│   │   ├── services/                # 비즈니스 로직
│   │   │   ├── sr-service.ts        # SR 서비스
│   │   │   ├── client-service.ts    # 고객사 서비스
│   │   │   ├── user-service.ts      # 사용자 서비스
│   │   │   ├── auth-service.ts      # 인증 서비스
│   │   │   ├── permission-service.ts # 권한 서비스
│   │   │   ├── notification-service.ts # 알림 서비스
│   │   │   └── analytics-service.ts # 분석 서비스
│   │   │
│   │   └── email/                   # 이메일 관련
│   │       ├── templates/           # React Email 템플릿
│   │       │   ├── sr-created.tsx
│   │       │   ├── sr-assigned.tsx
│   │       │   ├── sr-completed.tsx
│   │       │   ├── sr-rejected.tsx
│   │       │   └── sr-on-hold.tsx
│   │       └── send.ts              # 이메일 발송 함수
│   │
│   ├── inngest/                     # Inngest 함수
│   │   ├── client.ts                # Inngest 클라이언트
│   │   └── functions/
│   │       ├── send-email.ts        # 이메일 발송
│   │       ├── send-mattermost.ts   # Mattermost 알림
│   │       ├── sla-monitor.ts       # SLA 모니터링
│   │       └── generate-reports.ts  # 보고서 생성
│   │
│   ├── hooks/                       # React 커스텀 훅
│   │   ├── use-srs.ts               # SR 데이터 훅
│   │   ├── use-clients.ts           # 고객사 데이터 훅
│   │   ├── use-users.ts             # 사용자 데이터 훅
│   │   ├── use-permissions.ts       # 권한 체크 훅
│   │   └── use-toast.ts             # Toast 알림 훅
│   │
│   ├── store/                       # Zustand 스토어
│   │   ├── auth-store.ts            # 인증 상태
│   │   ├── ui-store.ts              # UI 상태
│   │   └── filter-store.ts          # 필터 상태
│   │
│   └── types/
│       ├── index.ts                 # 공통 타입
│       ├── api.ts                   # API 타입
│       ├── prisma.ts                # Prisma 타입 확장
│       └── next-auth.d.ts           # NextAuth 타입 확장
│
├── emails/                          # React Email 템플릿 루트
├── tests/
│   ├── unit/                        # 유닛 테스트
│   ├── integration/                 # 통합 테스트
│   └── e2e/                         # E2E 테스트
│
├── public/
│   ├── images/
│   ├── fonts/
│   └── favicon.ico
│
├── .env.local                       # 환경 변수 (로컬)
├── .env.example                     # 환경 변수 예시
├── next.config.js                   # Next.js 설정
├── tailwind.config.ts               # Tailwind 설정
├── tsconfig.json                    # TypeScript 설정
├── package.json                     # 의존성 관리
└── README.md                        # 프로젝트 문서
```

---

## 데이터베이스 설계

데이터베이스의 전체 스키마, ERD, 테이블 명세, 인덱스 전략 등은 데이터베이스 설계의 Single Source of Truth인 **[DB.md](./DB.md)** 문서를 참조하십시오.

### Connection Pooling 설정

**.env.local**:

```bash
# Connection Pooler (PgBouncer) - Vercel Functions용
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct Connection - 마이그레이션용
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

**lib/db.ts**:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

---

## API 설계

### Server Actions 설계

#### SR Management Actions

**server/actions/sr.ts**:

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requirePermission, checkSROwnership } from '@/lib/auth/permissions';
import { inngest } from '@/lib/inngest/client';
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

  // 알림 트리거 (Inngest)
  await inngest.send({
    name: 'sr/created',
    data: {
      srId: sr.id,
      srNumber: sr.srNumber,
      title: sr.title,
      priority: sr.priority,
      clientId: sr.clientId,
      clientName: sr.client.name,
      requesterId: sr.requesterId,
      requesterName: sr.requester.name,
      requesterEmail: sr.requester.email,
    },
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

  // 알림 트리거
  await inngest.send({
    name: 'sr/assigned',
    data: {
      srId: updatedSR.id,
      srNumber: updatedSR.srNumber,
      title: updatedSR.title,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      priority: updatedSR.priority,
      dueDate: updatedSR.dueDate?.toISOString(),
    },
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

  // 알림 트리거
  if (validated.status === 'COMPLETED') {
    await inngest.send({
      name: 'sr/completed',
      data: {
        srId: updatedSR.id,
        srNumber: updatedSR.srNumber,
        title: updatedSR.title,
        requesterId: updatedSR.requesterId,
        assigneeId: updatedSR.assigneeId,
        completedAt: completedAt!.toISOString(),
      },
    });
  } else if (validated.status === 'REJECTED') {
    await inngest.send({
      name: 'sr/rejected',
      data: {
        srId: updatedSR.id,
        srNumber: updatedSR.srNumber,
        title: updatedSR.title,
        requesterId: updatedSR.requesterId,
        reason: validated.reason || '사유 없음',
      },
    });
  }

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
    COMPLETED: ['CONFIRMED'], // 완료 → 확인 완료
    CONFIRMED: ['IN_PROGRESS', 'REJECTED'], // 확인 완료 → 재오픈(진행 중) 또는 거절
    REJECTED: ['INTAKE'], // 거절 → 재오픈(접수)
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

**server/actions/comment.ts**:

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkSROwnership, checkPermission } from '@/lib/auth/permissions';
import { inngest } from '@/lib/inngest/client';

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
  if (!validated.isInternal) {
    const sr = await db.sR.findUnique({
      where: { id: validated.srId },
      include: { requester: true, assignee: true },
    });

    if (sr) {
      await inngest.send({
        name: 'sr/comment-added',
        data: {
          srId: sr.id,
          srNumber: sr.srNumber,
          commentId: comment.id,
          commentContent: comment.content,
          authorId: session.user.id,
          authorName: session.user.name,
          requesterId: sr.requesterId,
          assigneeId: sr.assigneeId,
        },
      });
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

**app/api/srs/route.ts**:

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

**lib/auth.ts**:

```typescript
import NextAuth, { NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
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

**lib/auth/permissions.ts**:

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

**server/services/sr-service.ts**:

```typescript
import { db } from '@/lib/db';
import { SRStatus, SRPriority, Prisma } from '@prisma/client';
import { calculateSLADeadline, isSLABreached } from '@/lib/sr/sla';

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

### Notification Service

**server/services/notification-service.ts**:

```typescript
import { db } from '@/lib/db';
import { NotificationType, NotificationStatus } from '@prisma/client';

export class NotificationService {
  /**
   * 알림 생성
   */
  static async create(data: {
    type: NotificationType;
    recipient: string;
    subject?: string;
    content: string;
    metadata?: Record<string, any>;
  }) {
    return db.notification.create({
      data: {
        type: data.type,
        recipient: data.recipient,
        subject: data.subject,
        content: data.content,
        metadata: data.metadata,
        status: 'PENDING',
      },
    });
  }

  /**
   * 알림 발송 성공 처리
   */
  static async markAsSent(id: string) {
    return db.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }

  /**
   * 알림 발송 실패 처리
   */
  static async markAsFailed(id: string, reason: string) {
    return db.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        failReason: reason,
      },
    });
  }

  /**
   * 미발송 알림 조회
   */
  static async getPendingNotifications(limit = 100) {
    return db.notification.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * 실패한 알림 재시도
   */
  static async retryFailedNotifications(maxRetries = 3) {
    const failedNotifications = await db.notification.findMany({
      where: {
        status: 'FAILED',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 최근 24시간
        },
      },
    });

    // 재시도 로직은 Inngest에서 처리
    return failedNotifications;
  }
}
```

### Complete Inngest Functions Implementation

**inngest/functions/send-email.ts**:

```typescript
import { inngest } from '@/inngest/client';
import { sendEmail } from '@/server/email/send';
import { NotificationService } from '@/server/services/notification-service';
import { db } from '@/lib/db';

export const sendEmailFunction = inngest.createFunction(
  { id: 'send-email' },
  { event: 'notification/send' },
  async ({ event, step }) => {
    const { notificationId, recipient, subject, content, template } = event.data;

    try {
      // 이메일 발송
      await step.run('send-email', async () => {
        await sendEmail(recipient, subject, content, template);
      });

      // 발송 성공 처리
      await step.run('mark-as-sent', async () => {
        await NotificationService.markAsSent(notificationId);
      });

      return { success: true, notificationId };
    } catch (error) {
      // 발송 실패 처리
      await step.run('mark-as-failed', async () => {
        await NotificationService.markAsFailed(notificationId, error.message);
      });

      throw error;
    }
  }
);
```

**inngest/functions/send-mattermost.ts**:

```typescript
import { inngest } from '@/inngest/client';
import { db } from '@/lib/db';
import { NotificationService } from '@/server/services/notification-service';
import { MattermostWebhookService } from '@/lib/mattermost';

export const sendMattermostFunction = inngest.createFunction(
  { id: 'send-mattermost' },
  { event: 'notification/send-mattermost' },
  async ({ event, step }) => {
    const { notificationId, recipient, message } = event.data;

    try {
      // Mattermost 발송
      await step.run('send-mattermost', async () => {
        await MattermostWebhookService.sendMessage(recipient, message);
      });

      // 발송 성공 처리
      await step.run('mark-as-sent', async () => {
        await NotificationService.markAsSent(notificationId);
      });

      return { success: true, notificationId };
    } catch (error) {
      // 발송 실패 처리
      await step.run('mark-as-failed', async () => {
        await NotificationService.markAsFailed(notificationId, error.message);
      });

      throw error;
    }
  }
);
```

**inngest/functions/sla-monitor.ts**:

```typescript
import { inngest } from '@/inngest/client';
import { db } from '@/lib/db';
import { SRStatus, SRPriority } from '@prisma/client';
import { NotificationService } from '@/server/services/notification-service';

export const slaMonitorFunction = inngest.createFunction(
  { id: 'sla-monitor' },
  { cron: '0 */1 * * *' }, // 매시 시작 시 체크
  async ({ step }) => {
    // SLA 위반 임박 또는 위반된 SR 조회
    const now = new Date();
    const srs = await step.run('get-srs-nearing-sla', async () => {
      return db.sR.findMany({
        where: {
          status: {
            notIn: ['COMPLETED', 'CONFIRMED', 'REJECTED'],
          },
          OR: [
            // 1시간 이내 SLA 초과 예정
            { dueDate: { lte: new Date(now.getTime() + 60 * 60 * 1000) } },
            // 이미 SLA 위반
            { dueDate: { lt: now } },
          ],
        },
        include: {
          client: true,
          requester: true,
          assignee: true,
        },
      });
    });

    const notifications = [];
    for (const sr of srs) {
      const timeDiffHours = (sr.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      let type: 'SLA_WARNING' | 'SLA_VIOLATED' = 'SLA_WARNING';
      let message = '';

      if (timeDiffHours < 0) {
        type = 'SLA_VIOLATED';
        message = `SR #${sr.srNumber}가 SLA를 ${Math.abs(Math.round(timeDiffHours))}시간 초과했습니다.`;
      } else if (timeDiffHours <= 1) {
        message = `SR #${sr.srNumber}가 1시간 이내에 SLA를 초과합니다.`;
      } else {
        // 1시간보다 더 남았으면 경고 보내지 않음
        continue;
      }

      // 관련자에게 알림
      const recipients = [sr.assigneeId, sr.requesterId].filter(Boolean);

      for (const recipientId of recipients) {
        const notification = await step.run(
          `create-notification-${sr.id}-${recipientId}`,
          async () => {
            return NotificationService.create({
              type: 'EMAIL',
              recipient: recipientId,
              subject: `SLA ${type === 'SLA_VIOLATED' ? '위반' : '임박'} 알림 - SR #${sr.srNumber}`,
              content: message,
              metadata: {
                srId: sr.id,
                srNumber: sr.srNumber,
                type,
                priority: sr.priority,
              },
            });
          }
        );
        notifications.push(notification);
      }
    }

    return {
      processed: srs.length,
      notifications: notifications.length,
    };
  }
);
```

**inngest/functions/generate-reports.ts**:

```typescript
import { inngest } from '@/inngest/client';
import { db } from '@/lib/db';
import { PDFGenerator } from '@/lib/pdf';
import { EmailService } from '@/server/services/email-service';
import { SRStatus, SRPriority } from '@prisma/client';

export const generateReportsFunction = inngest.createFunction(
  { id: 'generate-reports' },
  { cron: '0 9 * * 1' }, // 매주 월요일 오전 9시
  async ({ step }) => {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // 지난 일요일
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6); // 이번 토요일
    endOfWeek.setHours(23, 59, 59, 999);

    // 주간 리포트 생성
    const reportData = await step.run('generate-report-data', async () => {
      const [totalSRs, completedSRs, byPriority, byStatus, byClient] = await Promise.all([
        db.sR.count({
          where: {
            createdAt: {
              gte: startOfWeek,
              lte: endOfWeek,
            },
          },
        }),
        db.sR.count({
          where: {
            status: 'COMPLETED',
            completedAt: {
              gte: startOfWeek,
              lte: endOfWeek,
            },
          },
        }),
        db.sR.groupBy({
          by: ['priority'],
          where: {
            createdAt: {
              gte: startOfWeek,
              lte: endOfWeek,
            },
          },
          _count: true,
        }),
        db.sR.groupBy({
          by: ['status'],
          where: {
            createdAt: {
              gte: startOfWeek,
              lte: endOfWeek,
            },
          },
          _count: true,
        }),
        db.sR.groupBy({
          by: ['clientId'],
          where: {
            createdAt: {
              gte: startOfWeek,
              lte: endOfWeek,
            },
          },
          _count: true,
        }),
      ]);

      return {
        totalSRs,
        completedSRs,
        byPriority: byPriority.reduce((acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        }, {}),
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
        byClient: byClient.reduce((acc, item) => {
          acc[item.clientId] = item._count;
          return acc;
        }, {}),
        period: {
          start: startOfWeek,
          end: endOfWeek,
        },
      };
    });

    // PDF 리포트 생성
    const pdfBuffer = await step.run('generate-pdf', async () => {
      return PDFGenerator.generateWeeklyReport(reportData);
    });

    // 관리자에게 리포트 이메일 발송
    const adminUsers = await step.run('get-admin-users', async () => {
      return db.user.findMany({
        where: {
          roles: {
            some: {
              role: {
                name: 'SYSTEM_ADMIN',
              },
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    });

    const emailResults = [];
    for (const admin of adminUsers) {
      const result = await step.run(`send-report-email-${admin.id}`, async () => {
        return EmailService.sendWeeklyReport({
          to: admin.email,
          subject: `주간 SR 리포트 (${reportData.period.start.toLocaleDateString()} - ${reportData.period.end.toLocaleDateString()})`,
          reportData,
          pdfBuffer,
        });
      });
      emailResults.push(result);
    }

    return {
      reportData,
      emailsSent: emailResults.length,
      success: emailResults.every((r) => r.success),
    };
  }
);
```

### Complete Email Template Implementations

**emails/sr-created.tsx**:

```tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link } from '@react-email/components';

interface SRCreatedEmailProps {
  srNumber: string;
  title: string;
  requesterName: string;
  clientName: string;
  priority: string;
  dueDate?: string;
  srUrl: string;
}

export const SRCreatedEmail = ({
  srNumber = 'SR-001',
  title = 'Sample SR Title',
  requesterName = 'John Doe',
  clientName = 'Sample Client',
  priority = 'MEDIUM',
  dueDate = '2025-01-01',
  srUrl = 'https://example.com/sr/1',
}: SRCreatedEmailProps) => {
  const priorityColors = {
    CRITICAL: '#dc2626', // red-600
    HIGH: '#ea580c', // orange-600
    MEDIUM: '#ca8a04', // yellow-600
    LOW: '#166534', // green-700
  };

  return (
    <Html>
      <Head />
      <Preview>
        New SR Created: {srNumber} - {title}
      </Preview>
      <Body style={{ backgroundColor: '#f3f4f6', padding: '20px 0' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: '600px',
            margin: '0 auto',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div style={{ backgroundColor: '#1f2937', padding: '24px', textAlign: 'center' }}>
            <Heading style={{ color: '#ffffff', margin: '0', fontSize: '24px' }}>
              SR Management System
            </Heading>
          </div>

          <div style={{ padding: '32px 24px' }}>
            <Heading style={{ color: '#111827', margin: '0 0 16px', fontSize: '20px' }}>
              New Service Request Created
            </Heading>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '0 0 16px' }}
            >
              <strong>SR #{srNumber}</strong> has been created by {requesterName} from {clientName}.
            </Text>

            <div
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                padding: '16px',
                margin: '16px 0',
              }}
            >
              <Text style={{ color: '#374151', margin: '0 0 8px', fontWeight: 'bold' }}>
                Title: {title}
              </Text>
              <Text style={{ color: '#374151', margin: '0 0 8px' }}>
                Priority:{' '}
                <span
                  style={{
                    color: priorityColors[priority as keyof typeof priorityColors] || '#166534',
                    fontWeight: 'bold',
                  }}
                >
                  {priority}
                </span>
              </Text>
              {dueDate && (
                <Text style={{ color: '#374151', margin: '0' }}>Due Date: {dueDate}</Text>
              )}
            </div>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '16px 0' }}
            >
              Please review the new SR and take appropriate action.
            </Text>

            <Link
              href={srUrl}
              style={{
                display: 'inline-block',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                fontWeight: 'bold',
              }}
            >
              View SR Details
            </Link>
          </div>

          <div
            style={{
              backgroundColor: '#f3f4f6',
              padding: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            <Text style={{ margin: '0' }}>This email was sent by SR Management System</Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
};

export default SRCreatedEmail;
```

**emails/sr-assigned.tsx**:

```tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link } from '@react-email/components';

interface SRAssignedEmailProps {
  srNumber: string;
  title: string;
  assigneeName: string;
  requesterName: string;
  clientName: string;
  priority: string;
  dueDate?: string;
  srUrl: string;
}

export const SRAssignedEmail = ({
  srNumber = 'SR-001',
  title = 'Sample SR Title',
  assigneeName = 'Jane Smith',
  requesterName = 'John Doe',
  clientName = 'Sample Client',
  priority = 'MEDIUM',
  dueDate = '2025-01-01',
  srUrl = 'https://example.com/sr/1',
}: SRAssignedEmailProps) => {
  const priorityColors = {
    CRITICAL: '#dc2626', // red-600
    HIGH: '#ea580c', // orange-600
    MEDIUM: '#ca8a04', // yellow-600
    LOW: '#166534', // green-700
  };

  return (
    <Html>
      <Head />
      <Preview>
        SR #{srNumber} assigned to you - {title}
      </Preview>
      <Body style={{ backgroundColor: '#f3f4f6', padding: '20px 0' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: '600px',
            margin: '0 auto',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div style={{ backgroundColor: '#1f2937', padding: '24px', textAlign: 'center' }}>
            <Heading style={{ color: '#ffffff', margin: '0', fontSize: '24px' }}>
              SR Management System
            </Heading>
          </div>

          <div style={{ padding: '32px 24px' }}>
            <Heading style={{ color: '#111827', margin: '0 0 16px', fontSize: '20px' }}>
              Service Request Assigned
            </Heading>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '0 0 16px' }}
            >
              SR <strong>#{srNumber}</strong> has been assigned to <strong>{assigneeName}</strong>{' '}
              by {requesterName} from {clientName}.
            </Text>

            <div
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                padding: '16px',
                margin: '16px 0',
              }}
            >
              <Text style={{ color: '#374151', margin: '0 0 8px', fontWeight: 'bold' }}>
                Title: {title}
              </Text>
              <Text style={{ color: '#374151', margin: '0 0 8px' }}>
                Priority:{' '}
                <span
                  style={{
                    color: priorityColors[priority as keyof typeof priorityColors] || '#166534',
                    fontWeight: 'bold',
                  }}
                >
                  {priority}
                </span>
              </Text>
              {dueDate && (
                <Text style={{ color: '#374151', margin: '0' }}>Due Date: {dueDate}</Text>
              )}
            </div>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '16px 0' }}
            >
              The assigned user should review and process this SR as soon as possible.
            </Text>

            <Link
              href={srUrl}
              style={{
                display: 'inline-block',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                fontWeight: 'bold',
              }}
            >
              View SR Details
            </Link>
          </div>

          <div
            style={{
              backgroundColor: '#f3f4f6',
              padding: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            <Text style={{ margin: '0' }}>This email was sent by SR Management System</Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
};

export default SRAssignedEmail;
```

**emails/sr-completed.tsx**:

```tsx
import React from 'react';
import { Body, Container, Head, Heading, Html, Preview, Text, Link } from '@react-email/components';

interface SRCompletedEmailProps {
  srNumber: string;
  title: string;
  assigneeName: string;
  requesterName: string;
  clientName: string;
  completedAt: string;
  resolutionDescription?: string;
  srUrl: string;
}

export const SRCompletedEmail = ({
  srNumber = 'SR-001',
  title = 'Sample SR Title',
  assigneeName = 'Jane Smith',
  requesterName = 'John Doe',
  clientName = 'Sample Client',
  completedAt = '2025-01-01 10:00:00',
  resolutionDescription = 'The issue has been resolved successfully.',
  srUrl = 'https://example.com/sr/1',
}: SRCompletedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        SR #{srNumber} completed - {title}
      </Preview>
      <Body style={{ backgroundColor: '#f3f4f6', padding: '20px 0' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: '600px',
            margin: '0 auto',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div style={{ backgroundColor: '#1f2937', padding: '24px', textAlign: 'center' }}>
            <Heading style={{ color: '#ffffff', margin: '0', fontSize: '24px' }}>
              SR Management System
            </Heading>
          </div>

          <div style={{ padding: '32px 24px' }}>
            <Heading style={{ color: '#111827', margin: '0 0 16px', fontSize: '20px' }}>
              Service Request Completed
            </Heading>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '0 0 16px' }}
            >
              SR <strong>#{srNumber}</strong> has been completed by <strong>{assigneeName}</strong>.
            </Text>

            <div
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                padding: '16px',
                margin: '16px 0',
              }}
            >
              <Text style={{ color: '#374151', margin: '0 0 8px', fontWeight: 'bold' }}>
                Title: {title}
              </Text>
              <Text style={{ color: '#374151', margin: '0 0 8px' }}>
                Completed by: {assigneeName}
              </Text>
              <Text style={{ color: '#374151', margin: '0 0 8px' }}>
                Completed at: {completedAt}
              </Text>
              {resolutionDescription && (
                <Text style={{ color: '#374151', margin: '0' }}>
                  Resolution: {resolutionDescription}
                </Text>
              )}
            </div>

            <Text
              style={{ color: '#374151', fontSize: '16px', lineHeight: '1.5', margin: '16px 0' }}
            >
              The SR has been marked as completed. Please review and confirm the resolution.
            </Text>

            <Link
              href={srUrl}
              style={{
                display: 'inline-block',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                fontWeight: 'bold',
              }}
            >
              View SR Details
            </Link>
          </div>

          <div
            style={{
              backgroundColor: '#f3f4f6',
              padding: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            <Text style={{ margin: '0' }}>This email was sent by SR Management System</Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
};

export default SRCompletedEmail;
```

## 8. 알림 시스템

### 🟡 Medium - 알림 발송 조건 상세화

**PRD에 알림 트리거가 나열되어 있으나, 정확한 조건 불명확**

**필요한 명세:**

```typescript
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
  channels: ('EMAIL' | 'MATTERMOST' | 'IN_APP')[];
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
    channels: ['EMAIL', 'MATTERMOST'],
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
    channels: ['EMAIL', 'MATTERMOST', 'IN_APP'],
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
    channels: ['EMAIL', 'MATTERMOST'],
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
    channels: ['EMAIL', 'MATTERMOST'],
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

  // 즉시 발송이면 Inngest 트리거
  if (condition.immediate) {
    await inngest.send({
      name: 'notification/send',
      data: { trigger, srId: sr.id },
    });
  }
}
```

---

## 파일 저장소

### Vercel Blob Integration

**lib/storage.ts**:

```typescript
import { put, head, del, list } from '@vercel/blob';

export const STORAGE_PATHS = {
  SR_ATTACHMENTS: 'sr-attachments',
  USER_AVATARS: 'user-avatars',
  CLIENT_LOGOS: 'client-logos',
} as const;

/**
 * 파일 업로드
 */
export async function uploadFile(
  pathname: string,
  file: File | Blob
): Promise<{ url: string; downloadUrl: string; pathname: string }> {
  try {
    const blob = await put(pathname, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    return {
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      pathname: blob.pathname,
    };
  } catch (error) {
    throw new Error(
      `파일 업로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

/**
 * 파일 정보 조회
 */
export async function getFileInfo(url: string) {
  try {
    const info = await head(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    return info;
  } catch (error) {
    throw new Error(
      `파일 정보 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

/**
 * 파일 삭제
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    await del(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });
  } catch (error) {
    throw new Error(
      `파일 삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

/**
 * 여러 파일 삭제
 */
export async function deleteFiles(urls: string[]): Promise<void> {
  try {
    await del(urls, {
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });
  } catch (error) {
    throw new Error(
      `파일 삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

/**
 * 파일 목록 조회
 */
export async function listFiles(prefix: string = '') {
  try {
    const { blobs } = await list({
      prefix,
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    return blobs;
  } catch (error) {
    throw new Error(
      `파일 목록 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

/**
 * SR 첨부파일 업로드
 */
export async function uploadSRAttachment(
  srId: string,
  file: File
): Promise<{ url: string; downloadUrl: string; pathname: string; size: number; type: string }> {
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name}`;
  const pathname = `${STORAGE_PATHS.SR_ATTACHMENTS}/${srId}/${fileName}`;

  const result = await uploadFile(pathname, file);

  return {
    ...result,
    size: file.size,
    type: file.type,
  };
}
```

### 파일 업로드 Server Action

**server/actions/attachment.ts**:

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkSROwnership } from '@/lib/auth/permissions';
import { uploadSRAttachment, deleteFile } from '@/lib/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function addSRAttachment(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const srId = formData.get('srId') as string;
  const file = formData.get('file') as File;

  if (!srId || !file) {
    throw new Error('SR ID와 파일이 필요합니다');
  }

  // 파일 크기 검증
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('파일 크기는 10MB를 초과할 수 없습니다');
  }

  // SR 접근 권한 체크
  const hasAccess = await checkSROwnership(session.user.id, srId);
  if (!hasAccess) {
    throw new Error('권한이 없습니다');
  }

  // 파일 업로드
  const uploadResult = await uploadSRAttachment(srId, file);

  // DB에 첨부파일 정보 저장
  const attachment = await db.sRAttachment.create({
    data: {
      srId,
      fileName: file.name,
      fileSize: uploadResult.size,
      fileType: uploadResult.type,
      fileUrl: uploadResult.url,
      uploadedBy: session.user.id,
    },
  });

  // 활동 내역 추가
  await db.sRActivity.create({
    data: {
      srId,
      userId: session.user.id,
      type: 'ATTACHMENT_ADDED',
      description: `파일 추가: ${file.name}`,
    },
  });

  revalidatePath(`/srs/${srId}`);

  return { success: true, data: attachment };
}

export async function deleteSRAttachment(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const attachment = await db.sRAttachment.findUnique({ where: { id } });
  if (!attachment) throw new Error('첨부파일을 찾을 수 없습니다');

  // SR 접근 권한 체크
  const hasAccess = await checkSROwnership(session.user.id, attachment.srId);
  if (!hasAccess) {
    throw new Error('권한이 없습니다');
  }

  // 파일 삭제 (fileUrl을 사용)
  await deleteFile(attachment.fileUrl);

  // DB에서 삭제
  await db.sRAttachment.delete({ where: { id } });

  // 활동 내역 추가
  await db.sRActivity.create({
    data: {
      srId: attachment.srId,
      userId: session.user.id,
      type: 'ATTACHMENT_REMOVED',
      description: `파일 삭제: ${attachment.fileName}`,
    },
  });

  revalidatePath(`/srs/${attachment.srId}`);

  return { success: true };
}
```

---

## 캐싱 전략

### Redis Cache Utility

**lib/cache.ts**:

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * 캐시 키 생성
 */
export const CacheKeys = {
  dashboardStats: (userId: string) => `dashboard:stats:${userId}`,
  srList: (params: string) => `sr:list:${params}`,
  srDetail: (srId: string) => `sr:detail:${srId}`,
  clientList: () => `client:list`,
  userPermissions: (userId: string) => `user:permissions:${userId}`,
} as const;

/**
 * 캐시된 데이터 조회 또는 생성
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300 // 5분
): Promise<T> {
  // 캐시 조회
  const cached = await redis.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 캐시 미스: 데이터 생성
  const data = await fetcher();

  // 캐시 저장
  await redis.setex(key, ttl, data);

  return data;
}

/**
 * 캐시 무효화
 */
export async function invalidateCache(pattern: string) {
  // Upstash Redis는 SCAN 명령 지원
  const keys = await redis.keys(pattern);

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * 여러 캐시 무효화
 */
export async function invalidateCaches(patterns: string[]) {
  await Promise.all(patterns.map((pattern) => invalidateCache(pattern)));
}
```

### Rate Limiting

**lib/rate-limit.ts**:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './cache';

// API 요청 제한: 10 요청/10초
export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
});

// 로그인 시도 제한: 5 요청/15분
export const loginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  analytics: true,
});

// SR 생성 제한: 20 요청/시간
export const srCreationRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
});

/**
 * Rate limit 체크 미들웨어
 */
export async function checkRateLimit(identifier: string, limiter: Ratelimit = apiRateLimiter) {
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    throw new Error('Rate limit exceeded');
  }

  return {
    limit,
    remaining,
    reset,
  };
}
```

---

## 에러 처리

### 에러 핸들러

**lib/errors.ts**:

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = '인증이 필요합니다') {
    super(401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = '권한이 없습니다') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource}을(를) 찾을 수 없습니다`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * 에러 로깅
 */
export function logError(error: Error, context?: Record<string, any>) {
  if (process.env.NODE_ENV === 'production') {
    // Sentry로 전송
    console.error('Error:', error, context);
  } else {
    console.error('Error:', error, context);
  }
}

/**
 * API 에러 응답 생성
 */
export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return {
      error: error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    logError(error);
    return {
      error: 'Internal Server Error',
      statusCode: 500,
    };
  }

  return {
    error: 'Unknown Error',
    statusCode: 500,
  };
}
```

### Global Error Boundary

**app/error.tsx**:

```typescript
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 에러 로깅
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <AlertTriangle className="mx-auto h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">오류가 발생했습니다</h1>
        <p className="text-muted-foreground">
          {error.message || '알 수 없는 오류가 발생했습니다'}
        </p>
        <Button onClick={reset}>다시 시도</Button>
      </div>
    </div>
  )
}
```

---

## 성능 최적화

### React Query 설정

**lib/react-query.tsx**:

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            cacheTime: 5 * 60 * 1000, // 5분
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  )
}
```

### 커스텀 훅

**hooks/use-srs.ts**:

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

React의 자동 이스케이프 + CSP 헤더:

**next.config.js**:

```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              "font-src 'self'",
              "connect-src 'self' https:",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};
```

### CSRF 방지

NextAuth.js가 자동으로 처리:

```typescript
// NextAuth.js는 자동으로 CSRF 토큰 생성 및 검증
```

---

## 테스트 전략

### Unit Tests (Vitest)

**tests/unit/sr-service.test.ts**:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SRService } from '@/server/services/sr-service';
import { db } from '@/lib/db';

describe('SRService', () => {
  describe('generateSRNumber', () => {
    it('should generate SR number in correct format', async () => {
      const clientId = 'test-client-id';
      const srNumber = await SRService.generateSRNumber(clientId);

      expect(srNumber).toMatch(/^[A-Z]{3}-\d{8}-\d{4}$/);
    });
  });

  describe('create', () => {
    it('should create SR with correct data', async () => {
      const data = {
        title: 'Test SR',
        description: 'This is a test SR description with more than 20 characters',
        clientId: 'client-id',
        requesterId: 'user-id',
        priority: 'MEDIUM' as const,
      };

      const sr = await SRService.create(data);

      expect(sr).toHaveProperty('id');
      expect(sr).toHaveProperty('srNumber');
      expect(sr.title).toBe(data.title);
      expect(sr.status).toBe('INTAKE');
    });
  });
});
```

### Integration Tests

**tests/integration/sr-api.test.ts**:

```typescript
import { describe, it, expect } from 'vitest';
import { createSR, getSRById } from '@/server/actions/sr';

describe('SR API Integration', () => {
  it('should create and retrieve SR', async () => {
    // Create SR
    const createResult = await createSR({
      title: 'Integration Test SR',
      description: 'This is an integration test SR with sufficient description',
      clientId: 'test-client-id',
      priority: 'HIGH',
    });

    expect(createResult.success).toBe(true);
    expect(createResult.data).toHaveProperty('id');

    // Retrieve SR
    const sr = await getSRById(createResult.data.id);
    expect(sr.title).toBe('Integration Test SR');
  });
});
```

### E2E Tests (Playwright)

**tests/e2e/sr-workflow.spec.ts**:

```typescript
import { test, expect } from '@playwright/test';

test.describe('SR Workflow', () => {
  test('should create, assign, and complete SR', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to SR creation
    await page.goto('/srs/new');

    // Fill SR form
    await page.fill('input[name="title"]', 'E2E Test SR');
    await page.fill('textarea[name="description"]', 'This is an E2E test SR description');
    await page.selectOption('select[name="clientId"]', { index: 1 });
    await page.selectOption('select[name="priority"]', 'HIGH');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify SR created
    await expect(page.locator('text=SR 생성 완료')).toBeVisible();

    // Verify SR appears in list
    await page.goto('/srs');
    await expect(page.locator('text=E2E Test SR')).toBeVisible();
  });
});
```

---

## 배포 및 CI/CD

### GitHub Actions Workflow

**.github/workflows/ci.yml**:

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm run type-check

      - name: Lint
        run: pnpm run lint

      - name: Run unit tests
        run: pnpm run test

      - name: Build
        run: pnpm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Vercel 환경 변수

Production 환경 변수 설정:

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
NEXTAUTH_URL="https://sr.yourdomain.com"
NEXTAUTH_SECRET="<generated-secret>"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Redis
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="<token>"

# Email
RESEND_API_KEY="re_..."

# Inngest
INNGEST_EVENT_KEY="<event-key>"
INNGEST_SIGNING_KEY="<signing-key>"

# Mattermost
MATTERMOST_WEBHOOK_URL="https://..."

# Monitoring
NEXT_PUBLIC_SENTRY_DSN="https://..."
SENTRY_AUTH_TOKEN="<token>"
AXIOM_TOKEN="<token>"
AXIOM_ORG_ID="<org-id>"
```

---

## 부록

### 환경별 설정 체크리스트

**Development**:

- [ ] Docker PostgreSQL 또는 Supabase Dev 프로젝트
- [ ] Local Redis (Docker) 또는 Upstash Free
- [ ] NextAuth secret 생성
- [ ] Resend Test 모드
- [ ] Inngest Dev Server

**Staging**:

- [ ] Supabase Staging 프로젝트
- [ ] Upstash Staging 인스턴스
- [ ] Vercel Preview Deployment
- [ ] 테스트 데이터 시딩
- [ ] E2E 테스트 실행

**Production**:

- [ ] Supabase Production 프로젝트
- [ ] Connection Pooling 설정 (6543 포트)
- [ ] Upstash Production
- [ ] Vercel Production Deployment
- [ ] 커스텀 도메인 설정
- [ ] Sentry 설정
- [ ] 백업 설정
- [ ] 모니터링 알림 설정

---

**문서 버전 관리:**

| 버전 | 작성자           | 변경 사항     | 작성일     |
| ---- | ---------------- | ------------- | ---------- |
| 1.0  | Development Team | LLD 초안 작성 | 2025-11-06 |

---

_이 문서는 SR 관리 시스템의 구현 수준 설계를 정의하는 Low-Level Design 문서입니다. 실제 개발 시 이 문서를 기반으로 코드를 작성하며, 변경사항이 발생할 경우 문서를 업데이트합니다._
