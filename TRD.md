# SR(Service Request) 관리 시스템 TRD

**문서 종류:** TRD
**문서 버전:** 1.1
**작성일:** 2025-11-06
**최종 수정일:** 2025-11-06
**작성자:** Development Team
**검수자:** [검수자 정보]

---

## 문서 개정 이력

| 버전 | 작성자 | 변경 사항 | 작성일 | 검수자 |
|------|--------|-----------|--------|--------|
| 1.0 | Development Team | TRD 초안 작성 | 2025-11-06 | [검수자] |
| 1.1 | Development Team | SR 상태 ENUM 통합, 명명 규칙 정리, Prisma 스키마 업데이트 | 2025-11-06 | [검수자] |

---

## 목차

1. [문서 개요](#문서-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [기술 스택 상세](#기술-스택-상세)
4. [데이터베이스 설계](#데이터베이스-설계)
5. [API 설계](#api-설계)
6. [인증 및 보안](#인증-및-보안)
7. [파일 스토리지](#파일-스토리지)
8. [알림 시스템](#알림-시스템)
9. [백그라운드 작업](#백그라운드-작업)
10. [프론트엔드 아키텍처](#프론트엔드-아키텍처)
11. [성능 최적화](#성능-최적화)
12. [테스팅 전략](#테스팅-전략)
13. [배포 전략](#배포-전략)
14. [모니터링 및 로깅](#모니터링-및-로깅)

---

## 문서 개요

### 문서 목적

본 문서는 SR 관리 시스템의 기술적 구현 요구사항을 정의합니다. 개발팀이 시스템을 구현하는 데 필요한 구체적인 기술 사양, 아키텍처 결정, 개발 가이드라인을 제공합니다.

### 기술 스택 요약

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Backend**: Next.js Server Actions, Route Handlers
- **Database**: Supabase PostgreSQL + Prisma ORM
- **Storage**: Supabase Storage
- **Cache**: Upstash Redis
- **Deployment**: Vercel
- **Authentication**: NextAuth.js v5
- **Email**: Resend + React Email
- **Background Jobs**: Inngest
- **Monitoring**: Sentry + Axiom

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
│  - Supabase Storage                     │
│  - Upstash Redis                        │
└─────────────────────────────────────────┘
```

---

## 기술 스택 상세

### 1. Next.js 14 (App Router)

**버전**: 14.x (최신 stable)

**사용 이유**:
- Server Components로 초기 로딩 성능 최적화
- Server Actions로 API 라우트 없이 데이터 뮤테이션 가능
- Vercel과의 완벽한 통합
- TypeScript 네이티브 지원

**주요 기능 사용**:

```typescript
// app/layout.tsx - Root Layout
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SR 관리 시스템',
  description: 'Service Request Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
```

```typescript
// app/(dashboard)/sr/page.tsx - Server Component
import { getSRList } from '@/server/actions/sr'

export default async function SRListPage() {
  const srs = await getSRList()

  return <SRList data={srs} />
}
```

```typescript
// app/(dashboard)/sr/actions.ts - Server Actions
'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createSR(formData: FormData) {
  const title = formData.get('title') as string
  const description = formData.get('description') as string

  const sr = await db.sR.create({
    data: { title, description }
  })

  revalidatePath('/sr')
  return { success: true, data: sr }
}
```

**설정**:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
```

### 2. TypeScript

**버전**: 5.x

**tsconfig.json 설정**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**타입 정의 예시**:

```typescript
// src/types/index.ts
export type SRStatus =
  | 'REQUESTED'
  | 'INTAKE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'ON_HOLD'

export type SRPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'

export interface SR {
  id: string
  srCode: string
  clientId: string
  requesterId: string
  handlerId?: string
  title: string
  description: string
  status: SRStatus
  priority: SRPriority
  requestedAt: Date
  intakeAt?: Date
  completedAt?: Date
  expectedCompletionDate?: Date
  client: Client
  requester: User
  handler?: User
}
```

### 3. Prisma ORM

**버전**: 5.x

**prisma/schema.prisma**:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  username      String
  phone         String
  firstName     String?  @map("first_name")
  lastName      String?  @map("last_name")
  profileImage  String?  @map("profile_image_url")
  status        UserStatus @default(ACTIVE)
  lastLoginAt   DateTime? @map("last_login_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  // Relations
  clientUsers   ClientUser[]
  requestedSRs  SR[]         @relation("RequesterSRs")
  handledSRs    SR[]         @relation("HandlerSRs")

  @@map("users")
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SLEEPING
  DELETED
}

model Client {
  id              String       @id @default(cuid())
  clientCode      String       @unique @map("client_code")
  clientName      String       @unique @map("client_name")
  industryType    String?      @map("industry_type")
  region          String?
  contactEmail    String       @map("contact_email")
  contactPhone    String       @map("contact_phone")
  websiteUrl      String?      @map("website_url")
  logoUrl         String?      @map("logo_url")
  description     String?
  contractStart   DateTime?    @map("contract_start_date")
  contractEnd     DateTime?    @map("contract_end_date")
  status          ClientStatus @default(ACTIVE)
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")

  // Relations
  clientUsers     ClientUser[]
  srs             SR[]
  handlers        ClientHandler[]

  @@map("clients")
}

enum ClientStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  TERMINATED
}

model ClientUser {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  clientId      String    @map("client_id")
  roleId        String    @map("role_id")
  department    String?
  team          String?
  assignedDate  DateTime  @default(now()) @map("assigned_date")
  unassignedDate DateTime? @map("unassigned_date")
  isPrimary     Boolean   @default(false) @map("is_primary")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  user          User      @relation(fields: [userId], references: [id])
  client        Client    @relation(fields: [clientId], references: [id])
  role          Role      @relation(fields: [roleId], references: [id])

  @@map("client_users")
  @@index([userId])
  @@index([clientId])
}

model SR {
  id                    String      @id @default(cuid())
  srCode                String      @unique @map("sr_code")
  clientId              String      @map("client_id")
  requesterId           String      @map("requester_id")
  handlerId             String?     @map("handler_id")
  title                 String
  description           String      @db.Text
  serviceCategoryId     String      @map("service_category_id")
  status                SRStatus    @default(REQUESTED)
  priority              SRPriority  @default(MEDIUM)
  requestedAt           DateTime    @default(now()) @map("requested_at")
  intakeAt              DateTime?   @map("intake_at")
  completedAt           DateTime?   @map("completed_at")
  confirmedAt           DateTime?   @map("confirmed_at")
  expectedCompletionDate DateTime?  @map("expected_completion_date")
  actualCompletionDate  DateTime?   @map("actual_completion_date")
  resolutionDescription String?     @map("resolution_description") @db.Text
  rejectionReason       String?     @map("rejection_reason") @db.Text
  attachmentCount       Int         @default(0) @map("attachment_count")
  commentCount          Int         @default(0) @map("comment_count")
  satisfactionRating    Int?        @map("satisfaction_rating")
  additionalFeedback    String?     @map("additional_feedback") @db.Text
  createdAt             DateTime    @default(now()) @map("created_at")
  updatedAt             DateTime    @updatedAt @map("updated_at")

  // Relations
  client                Client      @relation(fields: [clientId], references: [id])
  requester             User        @relation("RequesterSRs", fields: [requesterId], references: [id])
  handler               User?       @relation("HandlerSRs", fields: [handlerId], references: [id])
  comments              SRComment[]
  attachments           SRAttachment[]
  statusHistory         SRStatusHistory[]

  @@map("srs")
  @@index([clientId])
  @@index([requesterId])
  @@index([handlerId])
  @@index([status])
  @@index([priority])
  @@index([createdAt])
}

enum SRStatus {
  REQUESTED
  INTAKE
  IN_PROGRESS
  COMPLETED
  CONFIRMED
  REJECTED
  ON_HOLD
}

enum SRPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

model Role {
  id          String   @id @default(cuid())
  roleName    String   @unique @map("role_name")
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  clientUsers ClientUser[]
  rolePermissions RolePermission[]

  @@map("roles")
}

model Permission {
  id              String   @id @default(cuid())
  permissionName  String   @unique @map("permission_name")
  description     String?
  module          String
  action          String
  createdAt       DateTime @default(now()) @map("created_at")

  // Relations
  rolePermissions RolePermission[]

  @@map("permissions")
}

model RolePermission {
  id           String   @id @default(cuid())
  roleId       String   @map("role_id")
  permissionId String   @map("permission_id")
  createdAt    DateTime @default(now()) @map("created_at")

  // Relations
  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@map("role_permissions")
  @@unique([roleId, permissionId])
}

// NextAuth.js 관련 모델
model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

**Prisma Client 설정**:

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

**환경 변수 (.env.local)**:

```bash
# Supabase PostgreSQL
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://[ENDPOINT].upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# Resend
RESEND_API_KEY="re_..."

# Inngest
INNGEST_EVENT_KEY="your-event-key"
INNGEST_SIGNING_KEY="your-signing-key"

# Sentry
NEXT_PUBLIC_SENTRY_DSN="https://..."
SENTRY_AUTH_TOKEN="your-auth-token"
```

### 4. Supabase PostgreSQL 연결

**Connection Pooling 설정**:

Vercel Serverless 환경에서는 Connection Pooler를 사용해야 합니다.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooler 연결 (6543 포트)
  directUrl = env("DIRECT_URL")        // 직접 연결 (5432 포트, 마이그레이션용)
}
```

**마이그레이션 실행**:

```bash
# 개발 환경에서 마이그레이션 생성
pnpm prisma migrate dev --name init

# Production 환경에 마이그레이션 적용
pnpm prisma migrate deploy

# Prisma Client 생성
pnpm prisma generate

# 데이터베이스 시드
pnpm prisma db seed
```

**Seed 파일 (prisma/seed.ts)**:

```typescript
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // 권한 생성
  const permissions = await Promise.all([
    prisma.permission.create({
      data: {
        permissionName: 'sr:read',
        description: 'SR 조회',
        module: 'SR',
        action: 'READ',
      },
    }),
    prisma.permission.create({
      data: {
        permissionName: 'sr:create',
        description: 'SR 생성',
        module: 'SR',
        action: 'CREATE',
      },
    }),
    // ... 더 많은 권한
  ])

  // 역할 생성
  const adminRole = await prisma.role.create({
    data: {
      roleName: 'SYSTEM_ADMIN',
      description: '시스템 관리자',
    },
  })

  // 역할-권한 매핑
  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      })
    )
  )

  // 테스트 사용자 생성
  const hashedPassword = await bcrypt.hash('password123', 10)

  const testUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash: hashedPassword,
      username: '관리자',
      phone: '010-1234-5678',
      status: 'ACTIVE',
    },
  })

  console.log('Seed data created successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

---

## API 설계

### Server Actions

Server Actions는 Next.js 14의 핵심 기능으로, API 라우트 없이 서버사이드 로직을 실행할 수 있습니다.

**파일 구조**:

```
src/server/actions/
├── auth.ts          # 인증 관련
├── sr.ts            # SR 관련
├── client.ts        # 고객사 관련
├── user.ts          # 사용자 관련
└── file.ts          # 파일 업로드/다운로드
```

**SR Actions 예시 (src/server/actions/sr.ts)**:

```typescript
'use server'

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Validation Schema
const createSRSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(5).max(200),
  description: z.string().min(10),
  serviceCategoryId: z.string().cuid(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
})

export async function createSR(data: z.infer<typeof createSRSchema>) {
  // 1. 인증 확인
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  // 2. 데이터 검증
  const validated = createSRSchema.parse(data)

  // 3. 권한 확인
  const hasPermission = await checkPermission(session.user.id, 'sr:create')
  if (!hasPermission) {
    throw new Error('Forbidden')
  }

  // 4. SR 코드 생성
  const client = await db.client.findUnique({
    where: { id: validated.clientId },
    select: { clientCode: true },
  })

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = await db.sR.count({
    where: {
      srCode: {
        startsWith: `${client?.clientCode}-${today}`,
      },
    },
  })
  const srCode = `${client?.clientCode}-${today}-${String(count + 1).padStart(3, '0')}`

  // 5. SR 생성
  const sr = await db.sR.create({
    data: {
      srCode,
      clientId: validated.clientId,
      requesterId: session.user.id,
      title: validated.title,
      description: validated.description,
      serviceCategoryId: validated.serviceCategoryId,
      priority: validated.priority,
      status: 'REQUESTED',
    },
    include: {
      client: true,
      requester: true,
    },
  })

  // 6. 알림 전송 (Inngest)
  await sendSRCreatedNotification(sr.id)

  // 7. 캐시 무효화
  revalidatePath('/sr')
  revalidatePath(`/sr/${sr.id}`)

  return { success: true, data: sr }
}

export async function updateSRStatus(
  srId: string,
  status: z.infer<typeof SRStatus>,
  reason?: string
) {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  const sr = await db.sR.findUnique({
    where: { id: srId },
    include: { handler: true, requester: true },
  })

  if (!sr) {
    throw new Error('SR not found')
  }

  // 상태 변경 권한 확인
  const canUpdate = await canUpdateSRStatus(session.user.id, sr, status)
  if (!canUpdate) {
    throw new Error('Forbidden')
  }

  // 상태 변경
  const updated = await db.sR.update({
    where: { id: srId },
    data: {
      status,
      ...(status === 'INTAKE' && { intakeAt: new Date() }),
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
      ...(status === 'REJECTED' && { rejectionReason: reason }),
    },
  })

  // 상태 변경 이력 기록
  await db.sRStatusHistory.create({
    data: {
      srId,
      previousStatus: sr.status,
      currentStatus: status,
      changedBy: session.user.id,
      changeReason: reason,
    },
  })

  // 알림 전송
  await sendSRStatusChangedNotification(srId, status)

  revalidatePath('/sr')
  revalidatePath(`/sr/${srId}`)

  return { success: true, data: updated }
}

export async function getSRList(filters?: {
  status?: string
  priority?: string
  clientId?: string
  page?: number
  limit?: number
}) {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  const page = filters?.page || 1
  const limit = filters?.limit || 20
  const skip = (page - 1) * limit

  const where = {
    ...(filters?.status && { status: filters.status as any }),
    ...(filters?.priority && { priority: filters.priority as any }),
    ...(filters?.clientId && { clientId: filters.clientId }),
  }

  const [srs, total] = await Promise.all([
    db.sR.findMany({
      where,
      include: {
        client: { select: { clientName: true, clientCode: true } },
        requester: { select: { username: true, email: true } },
        handler: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.sR.count({ where }),
  ])

  return {
    data: srs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}
```

### Route Handlers

Webhooks나 외부 API 통합을 위한 REST API 엔드포인트

**파일 구조**:

```
src/app/api/
├── auth/[...nextauth]/route.ts   # NextAuth 엔드포인트
├── webhooks/
│   ├── mattermost/route.ts       # Mattermost webhook
│   └── inngest/route.ts          # Inngest webhook
└── upload/route.ts               # 파일 업로드
```

**파일 업로드 API (src/app/api/upload/route.ts)**:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadToSupabase } from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const bucket = formData.get('bucket') as string
    const path = formData.get('path') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 파일 크기 검증 (100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB' },
        { status: 400 }
      )
    }

    // 파일 타입 검증
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      )
    }

    // Supabase Storage에 업로드
    const result = await uploadToSupabase(bucket, path, file)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## 인증 및 보안

### NextAuth.js v5 설정

**src/lib/auth.ts**:

```typescript
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from './db'
import * as bcrypt from 'bcrypt'

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
    error: '/error',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            clientUsers: {
              include: {
                client: true,
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })

        if (!user) {
          throw new Error('User not found')
        }

        if (user.status !== 'ACTIVE') {
          throw new Error('Account is not active')
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isPasswordValid) {
          throw new Error('Invalid password')
        }

        // 마지막 로그인 시간 업데이트
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          image: user.profileImage,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id

        // 사용자 권한 정보 추가
        const userWithPermissions = await db.user.findUnique({
          where: { id: user.id },
          include: {
            clientUsers: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })

        token.permissions = userWithPermissions?.clientUsers.flatMap((cu) =>
          cu.role.rolePermissions.map((rp) => rp.permission.permissionName)
        )
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.permissions = token.permissions as string[]
      }
      return session
    },
  },
})
```

**Middleware (src/middleware.ts)**:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from './lib/auth'

export async function middleware(request: NextRequest) {
  const session = await auth()

  // Public routes
  const publicPaths = ['/login', '/register', '/forgot-password']
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isPublicPath) {
    return NextResponse.next()
  }

  // Protected routes
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rate limiting (Upstash Redis)
  const rateLimitResult = await checkRateLimit(session.user.id)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Rate Limiting

**src/lib/redis.ts**:

```typescript
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 사용자별 Rate Limiting (분당 60 requests)
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
})

export async function checkRateLimit(identifier: string) {
  const { success, limit, remaining, reset } = await ratelimit.limit(
    identifier
  )

  return {
    success,
    limit,
    remaining,
    reset,
  }
}
```

---

## 파일 스토리지

### Supabase Storage 통합

**src/lib/storage.ts**:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const BUCKETS = {
  SR_ATTACHMENTS: 'sr-attachments',
  PROFILE_IMAGES: 'profile-images',
  CLIENT_LOGOS: 'client-logos',
} as const

// 버킷 초기화
export async function initializeBuckets() {
  const buckets = Object.values(BUCKETS)

  for (const bucket of buckets) {
    const { data: exists } = await supabase.storage.getBucket(bucket)

    if (!exists) {
      await supabase.storage.createBucket(bucket, {
        public: bucket === BUCKETS.CLIENT_LOGOS,
        fileSizeLimit: 100 * 1024 * 1024, // 100MB
      })
    }
  }
}

// 파일 업로드
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Buffer,
  options?: {
    contentType?: string
    cacheControl?: string
    upsert?: boolean
  }
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options?.contentType,
      cacheControl: options?.cacheControl || '3600',
      upsert: options?.upsert || false,
    })

  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  return data
}

// 파일 URL 가져오기
export function getFileUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// 서명된 URL 생성 (비공개 파일용)
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`)
  }

  return data.signedUrl
}

// 파일 삭제
export async function deleteFile(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    throw new Error(`Delete failed: ${error.message}`)
  }
}

// 파일 목록 조회
export async function listFiles(bucket: string, path?: string) {
  const { data, error } = await supabase.storage.from(bucket).list(path)

  if (error) {
    throw new Error(`List failed: ${error.message}`)
  }

  return data
}
```

---

## 알림 시스템

### Resend + React Email

**이메일 템플릿 (emails/sr-created.tsx)**:

```typescript
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface SRCreatedEmailProps {
  srCode: string
  title: string
  clientName: string
  requesterName: string
  priority: string
  description: string
  srUrl: string
}

export default function SRCreatedEmail({
  srCode,
  title,
  clientName,
  requesterName,
  priority,
  description,
  srUrl,
}: SRCreatedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>새로운 SR이 등록되었습니다 - {srCode}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>새로운 SR이 등록되었습니다</Heading>

          <Text style={text}>안녕하세요,</Text>

          <Text style={text}>
            새로운 Service Request가 등록되었습니다. 확인 후 접수 처리 부탁드립니다.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>SR 번호:</Text>
            <Text style={infoValue}>{srCode}</Text>

            <Text style={infoLabel}>제목:</Text>
            <Text style={infoValue}>{title}</Text>

            <Text style={infoLabel}>고객사:</Text>
            <Text style={infoValue}>{clientName}</Text>

            <Text style={infoLabel}>신청자:</Text>
            <Text style={infoValue}>{requesterName}</Text>

            <Text style={infoLabel}>우선순위:</Text>
            <Text style={infoValue}>{priority}</Text>

            <Text style={infoLabel}>설명:</Text>
            <Text style={infoValue}>{description}</Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={srUrl}>
              SR 상세 보기
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            🤖 Generated with SR Management System
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
}

const text = {
  color: '#333',
  fontSize: '14px',
  lineHeight: '24px',
  padding: '0 48px',
}

const infoBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '4px',
  margin: '16px 48px',
  padding: '16px',
}

const infoLabel = {
  color: '#71717a',
  fontSize: '12px',
  fontWeight: 'bold',
  margin: '8px 0 4px',
}

const infoValue = {
  color: '#18181b',
  fontSize: '14px',
  margin: '0 0 16px',
}

const buttonContainer = {
  padding: '27px 0 27px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#5469d4',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '15px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '210px',
  padding: '14px 7px',
  margin: '0 auto',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 48px',
  textAlign: 'center' as const,
}
```

**이메일 전송 함수 (src/server/email/send.ts)**:

```typescript
import { Resend } from 'resend'
import { render } from '@react-email/render'
import SRCreatedEmail from '../../../emails/sr-created'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendSRCreatedEmail(data: {
  to: string
  srCode: string
  title: string
  clientName: string
  requesterName: string
  priority: string
  description: string
  srUrl: string
}) {
  const emailHtml = render(
    <SRCreatedEmail
      srCode={data.srCode}
      title={data.title}
      clientName={data.clientName}
      requesterName={data.requesterName}
      priority={data.priority}
      description={data.description}
      srUrl={data.srUrl}
    />
  )

  const result = await resend.emails.send({
    from: 'SR System <noreply@yourdomain.com>',
    to: data.to,
    subject: `[SR#${data.srCode}] 새로운 SR이 등록되었습니다`,
    html: emailHtml,
  })

  return result
}
```

---

## 백그라운드 작업

### Inngest 설정

**src/inngest/client.ts**:

```typescript
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'sr-management-system',
  eventKey: process.env.INNGEST_EVENT_KEY!,
})
```

**Inngest Functions (src/inngest/functions/send-email.ts)**:

```typescript
import { inngest } from '../client'
import { sendSRCreatedEmail } from '@/server/email/send'
import { db } from '@/lib/db'

export const sendSRCreatedNotification = inngest.createFunction(
  { id: 'send-sr-created-notification' },
  { event: 'sr/created' },
  async ({ event, step }) => {
    // Step 1: SR 정보 가져오기
    const sr = await step.run('fetch-sr-data', async () => {
      return await db.sR.findUnique({
        where: { id: event.data.srId },
        include: {
          client: true,
          requester: true,
          handler: true,
        },
      })
    })

    if (!sr) {
      throw new Error('SR not found')
    }

    // Step 2: 담당자에게 이메일 전송
    if (sr.handler) {
      await step.run('send-handler-email', async () => {
        return await sendSRCreatedEmail({
          to: sr.handler.email,
          srCode: sr.srCode,
          title: sr.title,
          clientName: sr.client.clientName,
          requesterName: sr.requester.username,
          priority: sr.priority,
          description: sr.description,
          srUrl: `${process.env.NEXTAUTH_URL}/sr/${sr.id}`,
        })
      })
    }

    // Step 3: Mattermost 알림 전송
    await step.run('send-mattermost-notification', async () => {
      // Mattermost webhook 호출
      const response = await fetch(process.env.MATTERMOST_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🆕 새로운 SR이 등록되었습니다`,
          attachments: [
            {
              color: '#5469d4',
              fields: [
                { short: true, title: 'SR 번호', value: sr.srCode },
                { short: true, title: '고객사', value: sr.client.clientName },
                { short: false, title: '제목', value: sr.title },
                { short: true, title: '우선순위', value: sr.priority },
              ],
            },
          ],
        }),
      })

      return response.ok
    })

    // Step 4: 알림 기록 저장
    await step.run('save-notification-log', async () => {
      return await db.notification.create({
        data: {
          userId: sr.handler?.id || sr.requesterId,
          srId: sr.id,
          notificationType: 'SR_CREATED',
          title: '새로운 SR 등록',
          content: `${sr.srCode} - ${sr.title}`,
          channel: 'BOTH',
          status: 'SENT',
          sentAt: new Date(),
        },
      })
    })

    return { success: true, srId: sr.id }
  }
)

// 장기 미처리 SR 체크 (크론 작업)
export const checkOverdueSRs = inngest.createFunction(
  { id: 'check-overdue-srs' },
  { cron: '0 */6 * * *' }, // 6시간마다 실행
  async ({ step }) => {
    const overdueSRs = await step.run('fetch-overdue-srs', async () => {
      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      return await db.sR.findMany({
        where: {
          status: 'REQUESTED',
          requestedAt: {
            lt: twentyFourHoursAgo,
          },
        },
        include: {
          client: true,
          requester: true,
          handler: true,
        },
      })
    })

    // 각 SR에 대해 알림 전송
    for (const sr of overdueSRs) {
      await step.run(`send-overdue-notification-${sr.id}`, async () => {
        // 담당자에게 알림
        if (sr.handler) {
          await sendOverdueEmail({
            to: sr.handler.email,
            srCode: sr.srCode,
            title: sr.title,
            hoursOverdue: Math.floor(
              (Date.now() - sr.requestedAt.getTime()) / (1000 * 60 * 60)
            ),
          })
        }
      })
    }

    return { checked: overdueSRs.length }
  }
)
```

**API 라우트 (src/app/api/inngest/route.ts)**:

```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { sendSRCreatedNotification, checkOverdueSRs } from '@/inngest/functions/send-email'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    sendSRCreatedNotification,
    checkOverdueSRs,
    // 더 많은 함수들...
  ],
})
```

---

## 프론트엔드 아키텍처

### 컴포넌트 구조

```
src/components/
├── ui/                    # Shadcn UI components
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── dialog.tsx
│   ├── table.tsx
│   └── ...
├── forms/                 # 폼 컴포넌트
│   ├── sr-form.tsx
│   ├── user-form.tsx
│   └── client-form.tsx
├── tables/                # 테이블 컴포넌트
│   ├── sr-table.tsx
│   ├── user-table.tsx
│   └── data-table.tsx
├── charts/                # 차트 컴포넌트
│   ├── sr-stats-chart.tsx
│   └── trend-chart.tsx
├── layouts/               # 레이아웃 컴포넌트
│   ├── header.tsx
│   ├── sidebar.tsx
│   └── footer.tsx
└── providers/             # Context Providers
    ├── session-provider.tsx
    └── query-provider.tsx
```

### SR 폼 예시 (src/components/forms/sr-form.tsx)

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { createSR } from '@/server/actions/sr'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const srSchema = z.object({
  clientId: z.string().min(1, '고객사를 선택해주세요'),
  title: z.string().min(5, '제목은 최소 5자 이상이어야 합니다'),
  description: z.string().min(10, '설명은 최소 10자 이상이어야 합니다'),
  serviceCategoryId: z.string().min(1, '서비스 카테고리를 선택해주세요'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
})

type SRFormData = z.infer<typeof srSchema>

export function SRForm({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SRFormData>({
    resolver: zodResolver(srSchema),
    defaultValues: {
      priority: 'MEDIUM',
    },
  })

  const onSubmit = async (data: SRFormData) => {
    try {
      const result = await createSR(data)

      if (result.success) {
        toast.success('SR이 성공적으로 등록되었습니다')
        router.push(`/sr/${result.data.id}`)
      }
    } catch (error) {
      toast.error('SR 등록 중 오류가 발생했습니다')
      console.error(error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="clientId" className="block text-sm font-medium mb-2">
          고객사 <span className="text-red-500">*</span>
        </label>
        <Select {...register('clientId')}>
          <option value="">고객사 선택</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.clientName}
            </option>
          ))}
        </Select>
        {errors.clientId && (
          <p className="text-red-500 text-sm mt-1">{errors.clientId.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-2">
          제목 <span className="text-red-500">*</span>
        </label>
        <Input
          id="title"
          {...register('title')}
          placeholder="SR 제목을 입력하세요"
        />
        {errors.title && (
          <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">
          설명 <span className="text-red-500">*</span>
        </label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="SR 내용을 상세히 작성해주세요"
          rows={6}
        />
        {errors.description && (
          <p className="text-red-500 text-sm mt-1">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="serviceCategoryId" className="block text-sm font-medium mb-2">
            서비스 카테고리 <span className="text-red-500">*</span>
          </label>
          <Select {...register('serviceCategoryId')}>
            <option value="">카테고리 선택</option>
            <option value="technical">기술 지원</option>
            <option value="billing">요금 문의</option>
            <option value="account">계정 관리</option>
          </Select>
          {errors.serviceCategoryId && (
            <p className="text-red-500 text-sm mt-1">
              {errors.serviceCategoryId.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="priority" className="block text-sm font-medium mb-2">
            우선순위
          </label>
          <Select {...register('priority')}>
            <option value="CRITICAL">긴급</option>
            <option value="HIGH">높음</option>
            <option value="MEDIUM">중간</option>
            <option value="LOW">낮음</option>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : 'SR 등록'}
        </Button>
      </div>
    </form>
  )
}
```

### TanStack Table 예시 (src/components/tables/sr-table.tsx)

```typescript
'use client'

import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface SR {
  id: string
  srCode: string
  title: string
  client: { clientName: string }
  status: string
  priority: string
  requestedAt: Date
}

const columns: ColumnDef<SR>[] = [
  {
    accessorKey: 'srCode',
    header: 'SR 번호',
    cell: ({ row }) => (
      <Link href={`/sr/${row.original.id}`} className="text-blue-600 hover:underline">
        {row.getValue('srCode')}
      </Link>
    ),
  },
  {
    accessorKey: 'title',
    header: '제목',
  },
  {
    accessorKey: 'client.clientName',
    header: '고객사',
  },
  {
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      const statusColors = {
        REQUESTED: 'bg-yellow-100 text-yellow-800',
        INTAKE: 'bg-blue-100 text-blue-800',
        IN_PROGRESS: 'bg-purple-100 text-purple-800',
        COMPLETED: 'bg-green-100 text-green-800',
        REJECTED: 'bg-red-100 text-red-800',
      }
      return (
        <Badge className={statusColors[status as keyof typeof statusColors]}>
          {status}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'priority',
    header: '우선순위',
    cell: ({ row }) => {
      const priority = row.getValue('priority') as string
      const priorityColors = {
        CRITICAL: 'bg-red-500 text-white',
        HIGH: 'bg-orange-500 text-white',
        MEDIUM: 'bg-yellow-500 text-white',
        LOW: 'bg-gray-500 text-white',
      }
      return (
        <Badge className={priorityColors[priority as keyof typeof priorityColors]}>
          {priority}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'requestedAt',
    header: '신청일',
    cell: ({ row }) => {
      const date = row.getValue('requestedAt') as Date
      return new Date(date).toLocaleDateString('ko-KR')
    },
  },
]

export function SRTable({ data }: { data: SR[] }) {
  const [sorting, setSorting] = useState([])
  const [columnFilters, setColumnFilters] = useState([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="검색..."
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button asChild>
          <Link href="/sr/new">SR 등록</Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-gray-50">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          {table.getFilteredRowModel().rows.length}건 중{' '}
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
          -
          {Math.min(
            (table.getState().pagination.pageIndex + 1) *
              table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}
          건 표시
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

## 성능 최적화

### 1. Next.js 캐싱 전략

```typescript
// app/(dashboard)/sr/page.tsx
import { unstable_cache } from 'next/cache'

// 5분간 캐싱
export const revalidate = 300

// 또는 unstable_cache 사용
const getCachedSRStats = unstable_cache(
  async () => {
    return await db.sR.groupBy({
      by: ['status'],
      _count: true,
    })
  },
  ['sr-stats'],
  { revalidate: 300, tags: ['sr-stats'] }
)
```

### 2. React Query 설정

```typescript
// src/app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
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
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

### 3. 이미지 최적화

```typescript
import Image from 'next/image'

<Image
  src={user.profileImage}
  alt={user.username}
  width={40}
  height={40}
  className="rounded-full"
  loading="lazy"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### 4. Code Splitting

```typescript
import dynamic from 'next/dynamic'

const SRChart = dynamic(() => import('@/components/charts/sr-chart'), {
  loading: () => <p>차트를 불러오는 중...</p>,
  ssr: false,
})
```

---

## 테스팅 전략

### Vitest 설정

**vitest.config.ts**:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**tests/setup.ts**:

```typescript
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
```

### 유닛 테스트 예시

**tests/unit/sr-form.test.tsx**:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SRForm } from '@/components/forms/sr-form'

describe('SRForm', () => {
  const mockClients = [
    { id: '1', clientName: 'Test Client' },
  ]

  it('렌더링 확인', () => {
    render(<SRForm clients={mockClients} />)

    expect(screen.getByLabelText(/제목/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/설명/i)).toBeInTheDocument()
  })

  it('필수 필드 검증', async () => {
    render(<SRForm clients={mockClients} />)

    const submitButton = screen.getByRole('button', { name: /SR 등록/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/제목은 최소 5자 이상/i)).toBeInTheDocument()
    })
  })

  it('폼 제출 성공', async () => {
    const mockCreateSR = vi.fn().mockResolvedValue({ success: true, data: { id: '1' } })

    render(<SRForm clients={mockClients} onSubmit={mockCreateSR} />)

    fireEvent.change(screen.getByLabelText(/제목/i), {
      target: { value: 'Test SR Title' },
    })
    fireEvent.change(screen.getByLabelText(/설명/i), {
      target: { value: 'Test SR Description with more than 10 characters' },
    })

    const submitButton = screen.getByRole('button', { name: /SR 등록/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockCreateSR).toHaveBeenCalled()
    })
  })
})
```

### E2E 테스트 (Playwright)

**tests/e2e/sr-workflow.spec.ts**:

```typescript
import { test, expect } from '@playwright/test'

test.describe('SR 워크플로우', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('/login')
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard')
  })

  test('SR 등록 플로우', async ({ page }) => {
    // SR 등록 페이지로 이동
    await page.click('text=SR 등록')
    await expect(page).toHaveURL('/sr/new')

    // 폼 작성
    await page.selectOption('select[name="clientId"]', '1')
    await page.fill('input[name="title"]', 'Test SR')
    await page.fill('textarea[name="description"]', 'Test Description with enough text')
    await page.selectOption('select[name="serviceCategoryId"]', 'technical')

    // 제출
    await page.click('button[type="submit"]')

    // SR 상세 페이지로 리다이렉트 확인
    await expect(page).toHaveURL(/\/sr\/[a-z0-9]+/)
    await expect(page.locator('text=Test SR')).toBeVisible()
  })

  test('SR 상태 변경', async ({ page }) => {
    await page.goto('/sr/test-sr-id')

    // 상태 변경
    await page.click('button:has-text("접수")')

    // 확인 다이얼로그
    await page.click('button:has-text("확인")')

    // 상태가 변경되었는지 확인
    await expect(page.locator('text=INTAKE')).toBeVisible()
  })
})
```

---

## 배포 전략

### Vercel 배포 설정

**vercel.json**:

```json
{
  "buildCommand": "pnpm run build",
  "devCommand": "pnpm run dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["icn1"],
  "env": {
    "DATABASE_URL": "@database-url",
    "DIRECT_URL": "@direct-url",
    "NEXTAUTH_SECRET": "@nextauth-secret"
  }
}
```

### GitHub Actions CI/CD

**.github/workflows/ci.yml**:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Run linter
        run: pnpm run lint

      - name: Run type check
        run: pnpm run type-check

      - name: Run tests
        run: pnpm run test

      - name: Build
        run: pnpm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
```

### 환경별 배포

```bash
# Development
vercel dev

# Preview (PR 생성 시 자동)
vercel

# Production
vercel --prod
```

---

## 모니터링 및 로깅

### Sentry 설정

**sentry.client.config.ts**:

```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay(),
  ],
})
```

**sentry.server.config.ts**:

```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
})
```

### Axiom 로깅

```typescript
import { Axiom } from '@axiomhq/js'

const axiom = new Axiom({
  token: process.env.AXIOM_TOKEN!,
  orgId: process.env.AXIOM_ORG_ID!,
})

export async function logEvent(dataset: string, event: Record<string, any>) {
  await axiom.ingest(dataset, [
    {
      timestamp: new Date().toISOString(),
      ...event,
    },
  ])
}

// 사용 예시
await logEvent('sr-events', {
  type: 'sr_created',
  srId: sr.id,
  userId: session.user.id,
  clientId: sr.clientId,
})
```

---

## 권한 관리 구현 (Permission Management Implementation)

### 권한 체크 유틸리티

**lib/auth/permissions.ts**:

```typescript
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Permission } from '@prisma/client'

export type PermissionAction =
  | 'sr:create' | 'sr:read' | 'sr:update' | 'sr:delete' | 'sr:assign'
  | 'client:create' | 'client:read' | 'client:update' | 'client:delete'
  | 'user:create' | 'user:read' | 'user:update' | 'user:delete'
  | 'role:manage' | 'system:admin'

export async function checkPermission(
  userId: string,
  action: PermissionAction
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: true
            }
          }
        }
      }
    }
  })

  if (!user) return false

  // System Admin has all permissions
  const hasAdminRole = user.roles.some(ur => ur.role.name === 'SYSTEM_ADMIN')
  if (hasAdminRole) return true

  // Check specific permission
  const hasPermission = user.roles.some(ur =>
    ur.role.permissions.some(p => p.resource + ':' + p.action === action)
  )

  return hasPermission
}

export async function requirePermission(action: PermissionAction) {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error('Unauthorized: No session')
  }

  const hasPermission = await checkPermission(session.user.id, action)

  if (!hasPermission) {
    throw new Error(`Forbidden: Missing permission ${action}`)
  }

  return session
}

// SR 소유권 체크
export async function checkSROwnership(userId: string, srId: string): Promise<boolean> {
  const sr = await db.sR.findUnique({
    where: { id: srId },
    select: { requesterId: true, assigneeId: true }
  })

  if (!sr) return false
  return sr.requesterId === userId || sr.assigneeId === userId
}

// 클라이언트 접근 권한 체크
export async function checkClientAccess(userId: string, clientId: string): Promise<boolean> {
  const userClients = await db.userClient.findMany({
    where: { userId },
    select: { clientId: true }
  })

  return userClients.some(uc => uc.clientId === clientId)
}
```

### 역할별 권한 매트릭스

**prisma/seed-permissions.ts**:

```typescript
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

const ROLE_PERMISSIONS: Record<string, Array<{ resource: string; action: string }>> = {
  SYSTEM_ADMIN: [
    { resource: 'system', action: 'admin' },
    { resource: 'user', action: 'create' },
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'user', action: 'delete' },
    { resource: 'role', action: 'manage' },
    { resource: 'client', action: 'create' },
    { resource: 'client', action: 'read' },
    { resource: 'client', action: 'update' },
    { resource: 'client', action: 'delete' },
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' },
    { resource: 'sr', action: 'delete' },
    { resource: 'sr', action: 'assign' },
  ],
  CLIENT_ADMIN: [
    { resource: 'client', action: 'read' },
    { resource: 'client', action: 'update' }, // Own client only
    { resource: 'user', action: 'create' }, // Within client
    { resource: 'user', action: 'read' }, // Within client
    { resource: 'user', action: 'update' }, // Within client
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' }, // Own SR only
  ],
  DEVELOPER: [
    { resource: 'sr', action: 'read' },
    { resource: 'sr', action: 'update' }, // Assigned SR only
  ],
  CLIENT_USER: [
    { resource: 'client', action: 'read' }, // Own client only
    { resource: 'sr', action: 'create' },
    { resource: 'sr', action: 'read' }, // Own SR only
    { resource: 'sr', action: 'update' }, // Own SR only
  ],
}

export async function seedPermissions() {
  // Create roles and permissions
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `${roleName} role with full permissions`,
      },
    })

    // Create permissions for role
    for (const perm of permissions) {
      await db.permission.upsert({
        where: {
          roleId_resource_action: {
            roleId: role.id,
            resource: perm.resource,
            action: perm.action,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          resource: perm.resource,
          action: perm.action,
        },
      })
    }
  }
}
```

### 권한 미들웨어

**lib/middleware/permission-middleware.ts**:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission, PermissionAction } from '@/lib/auth/permissions'

export function withPermission(action: PermissionAction) {
  return async (request: NextRequest) => {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const hasPermission = await checkPermission(session.user.id, action)

    if (!hasPermission) {
      return NextResponse.json(
        { error: `Forbidden: Missing permission ${action}` },
        { status: 403 }
      )
    }

    return NextResponse.next()
  }
}
```

---

## SR 워크플로우 상세 (SR Workflow Details)

### 상태 전이 규칙

**lib/sr/workflow.ts**:

```typescript
import { SRStatus, SRPriority } from '@prisma/client'

export const SR_STATE_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
  INTAKE: ['BACKLOG', 'REJECTED'],
  BACKLOG: ['IN_PROGRESS', 'ON_HOLD', 'REJECTED'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD', 'BACKLOG'],
  ON_HOLD: ['IN_PROGRESS', 'BACKLOG'],
  COMPLETED: ['INTAKE'], // Reopen
  REJECTED: ['INTAKE'], // Reopen
}

export function canTransitionTo(
  currentStatus: SRStatus,
  targetStatus: SRStatus
): boolean {
  return SR_STATE_TRANSITIONS[currentStatus]?.includes(targetStatus) || false
}

export function validateStateTransition(
  currentStatus: SRStatus,
  targetStatus: SRStatus,
  userId: string,
  srData: { requesterId: string; assigneeId: string | null }
): { valid: boolean; error?: string } {
  // Check if transition is allowed
  if (!canTransitionTo(currentStatus, targetStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${targetStatus}`,
    }
  }

  // IN_PROGRESS requires assignee
  if (targetStatus === 'IN_PROGRESS' && !srData.assigneeId) {
    return {
      valid: false,
      error: 'Cannot move to IN_PROGRESS without assignee',
    }
  }

  return { valid: true }
}
```

### 우선순위별 SLA 시간

**lib/sr/sla.ts**:

```typescript
import { SRPriority } from '@prisma/client'

export const SLA_HOURS: Record<SRPriority, number> = {
  CRITICAL: 4,   // 4시간 내 대응
  HIGH: 24,      // 1일 내 대응
  MEDIUM: 72,    // 3일 내 대응
  LOW: 168,      // 7일 내 대응
}

export function calculateSLADeadline(
  priority: SRPriority,
  createdAt: Date = new Date()
): Date {
  const hours = SLA_HOURS[priority]
  const deadline = new Date(createdAt)
  deadline.setHours(deadline.getHours() + hours)
  return deadline
}

export function isSLABreached(
  priority: SRPriority,
  createdAt: Date,
  currentTime: Date = new Date()
): boolean {
  const deadline = calculateSLADeadline(priority, createdAt)
  return currentTime > deadline
}

export function getSLAStatus(
  priority: SRPriority,
  createdAt: Date,
  status: SRStatus,
  currentTime: Date = new Date()
): 'on-track' | 'at-risk' | 'breached' | 'completed' {
  if (status === 'COMPLETED' || status === 'REJECTED') {
    return 'completed'
  }

  const deadline = calculateSLADeadline(priority, createdAt)
  const remaining = deadline.getTime() - currentTime.getTime()
  const total = SLA_HOURS[priority] * 60 * 60 * 1000

  if (remaining < 0) return 'breached'
  if (remaining < total * 0.2) return 'at-risk' // 20% 이하 남음
  return 'on-track'
}

export function getTimeRemaining(
  priority: SRPriority,
  createdAt: Date,
  currentTime: Date = new Date()
): string {
  const deadline = calculateSLADeadline(priority, createdAt)
  const remaining = deadline.getTime() - currentTime.getTime()

  if (remaining < 0) {
    const overdue = Math.abs(remaining)
    const hours = Math.floor(overdue / (1000 * 60 * 60))
    return `${hours}시간 초과`
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}시간 ${minutes}분 남음`
}
```

### SR 재오픈 로직

**app/actions/sr/reopen.ts**:

```typescript
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/auth/permissions'
import { inngest } from '@/lib/inngest/client'

const reopenSRSchema = z.object({
  srId: z.string(),
  reason: z.string().min(10, '재오픈 사유는 최소 10자 이상이어야 합니다'),
})

export async function reopenSR(input: z.infer<typeof reopenSRSchema>) {
  const session = await requirePermission('sr:update')
  const { srId, reason } = reopenSRSchema.parse(input)

  // Verify SR exists and is in completed or rejected state
  const sr = await db.sR.findUnique({
    where: { id: srId },
    include: {
      client: true,
      requester: true,
    },
  })

  if (!sr) {
    throw new Error('SR not found')
  }

  if (sr.status !== 'COMPLETED' && sr.status !== 'REJECTED') {
    throw new Error('Only completed or rejected SRs can be reopened')
  }

  // Create reopen activity
  const updatedSR = await db.sR.update({
    where: { id: srId },
    data: {
      status: 'INTAKE',
      assigneeId: null, // Clear assignee
      activities: {
        create: {
          type: 'REOPENED',
          description: `SR 재오픈됨: ${reason}`,
          userId: session.user.id,
        },
      },
    },
    include: {
      client: true,
      requester: true,
      assignee: true,
    },
  })

  // Trigger notifications
  await inngest.send({
    name: 'sr/reopened',
    data: {
      srId: updatedSR.id,
      srNumber: updatedSR.srNumber,
      title: updatedSR.title,
      reason,
      reopenedBy: session.user.id,
      requesterId: sr.requesterId,
      previousAssigneeId: sr.assigneeId,
    },
  })

  return { success: true, sr: updatedSR }
}
```

### 우선순위 변경 로직

**app/actions/sr/change-priority.ts**:

```typescript
'use server'

import { z } from 'zod'
import { SRPriority } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/auth/permissions'
import { calculateSLADeadline } from '@/lib/sr/sla'
import { inngest } from '@/lib/inngest/client'

const changePrioritySchema = z.object({
  srId: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  reason: z.string().min(10),
})

export async function changeSRPriority(input: z.infer<typeof changePrioritySchema>) {
  const session = await requirePermission('sr:update')
  const { srId, priority, reason } = changePrioritySchema.parse(input)

  const sr = await db.sR.findUnique({
    where: { id: srId },
  })

  if (!sr) {
    throw new Error('SR not found')
  }

  const oldPriority = sr.priority
  const newSLADeadline = calculateSLADeadline(priority as SRPriority, sr.createdAt)

  // Update SR priority
  const updatedSR = await db.sR.update({
    where: { id: srId },
    data: {
      priority: priority as SRPriority,
      activities: {
        create: {
          type: 'PRIORITY_CHANGED',
          description: `우선순위 변경: ${oldPriority} → ${priority} (사유: ${reason})`,
          userId: session.user.id,
        },
      },
    },
    include: {
      client: true,
      requester: true,
      assignee: true,
    },
  })

  // Trigger notifications if priority increased
  if (
    (priority === 'CRITICAL' && oldPriority !== 'CRITICAL') ||
    (priority === 'HIGH' && ['MEDIUM', 'LOW'].includes(oldPriority))
  ) {
    await inngest.send({
      name: 'sr/priority-increased',
      data: {
        srId: updatedSR.id,
        srNumber: updatedSR.srNumber,
        oldPriority,
        newPriority: priority,
        reason,
        slaDeadline: newSLADeadline.toISOString(),
        requesterId: sr.requesterId,
        assigneeId: sr.assigneeId,
      },
    })
  }

  return { success: true, sr: updatedSR }
}
```

---

## 알림 템플릿 라이브러리 (Notification Template Library)

### 이메일 템플릿

**emails/sr-completed.tsx**:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface SRCompletedEmailProps {
  srNumber: string
  title: string
  assigneeName: string
  completedAt: string
  resolution: string
  srUrl: string
}

export default function SRCompletedEmail({
  srNumber,
  title,
  assigneeName,
  completedAt,
  resolution,
  srUrl,
}: SRCompletedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>SR {srNumber} 완료됨</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>SR 완료 알림</Heading>

          <Text style={text}>
            요청하신 SR이 완료되었습니다.
          </Text>

          <Section style={srInfo}>
            <Text style={label}>SR 번호:</Text>
            <Text style={value}>{srNumber}</Text>

            <Text style={label}>제목:</Text>
            <Text style={value}>{title}</Text>

            <Text style={label}>담당자:</Text>
            <Text style={value}>{assigneeName}</Text>

            <Text style={label}>완료 시간:</Text>
            <Text style={value}>{completedAt}</Text>

            <Text style={label}>처리 내용:</Text>
            <Text style={value}>{resolution}</Text>
          </Section>

          <Button style={button} href={srUrl}>
            SR 상세 보기
          </Button>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
}

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
}

const srInfo = {
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
  padding: '24px',
  margin: '24px 0',
}

const label = {
  color: '#6c757d',
  fontSize: '14px',
  fontWeight: '600',
  margin: '8px 0 4px',
}

const value = {
  color: '#333',
  fontSize: '16px',
  margin: '0 0 16px',
}

const button = {
  backgroundColor: '#007bff',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  margin: '24px 0',
}
```

**emails/sr-rejected.tsx**:

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Button,
} from '@react-email/components'

interface SRRejectedEmailProps {
  srNumber: string
  title: string
  rejectedBy: string
  rejectedAt: string
  reason: string
  srUrl: string
}

export default function SRRejectedEmail({
  srNumber,
  title,
  rejectedBy,
  rejectedAt,
  reason,
  srUrl,
}: SRRejectedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>SR {srNumber} 거절됨</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>SR 거절 알림</Heading>

          <Text style={text}>
            요청하신 SR이 거절되었습니다.
          </Text>

          <Section style={srInfo}>
            <Text style={label}>SR 번호:</Text>
            <Text style={value}>{srNumber}</Text>

            <Text style={label}>제목:</Text>
            <Text style={value}>{title}</Text>

            <Text style={label}>거절자:</Text>
            <Text style={value}>{rejectedBy}</Text>

            <Text style={label}>거절 시간:</Text>
            <Text style={value}>{rejectedAt}</Text>

            <Text style={label}>거절 사유:</Text>
            <Text style={value}>{reason}</Text>
          </Section>

          <Button style={button} href={srUrl}>
            SR 상세 보기
          </Button>

          <Text style={footer}>
            문의사항이 있으시면 담당자에게 연락해주세요.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Styles similar to above...
const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '20px 0 48px' }
const h1 = { color: '#333', fontSize: '24px', fontWeight: 'bold', margin: '40px 0' }
const text = { color: '#333', fontSize: '16px', lineHeight: '26px' }
const srInfo = { backgroundColor: '#fff3cd', borderRadius: '4px', padding: '24px', margin: '24px 0' }
const label = { color: '#856404', fontSize: '14px', fontWeight: '600', margin: '8px 0 4px' }
const value = { color: '#333', fontSize: '16px', margin: '0 0 16px' }
const button = { backgroundColor: '#007bff', borderRadius: '4px', color: '#fff', fontSize: '16px', fontWeight: 'bold', textAlign: 'center' as const, display: 'block', padding: '12px 24px', margin: '24px 0' }
const footer = { color: '#6c757d', fontSize: '14px', marginTop: '24px' }
```

**emails/sr-on-hold.tsx**:

```tsx
interface SROnHoldEmailProps {
  srNumber: string
  title: string
  assigneeName: string
  reason: string
  srUrl: string
}

export default function SROnHoldEmail({
  srNumber,
  title,
  assigneeName,
  reason,
  srUrl,
}: SROnHoldEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>SR {srNumber} 보류됨</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>SR 보류 알림</Heading>

          <Text style={text}>
            진행 중이던 SR이 보류되었습니다.
          </Text>

          <Section style={srInfo}>
            <Text style={label}>SR 번호:</Text>
            <Text style={value}>{srNumber}</Text>

            <Text style={label}>제목:</Text>
            <Text style={value}>{title}</Text>

            <Text style={label}>담당자:</Text>
            <Text style={value}>{assigneeName}</Text>

            <Text style={label}>보류 사유:</Text>
            <Text style={value}>{reason}</Text>
          </Section>

          <Button style={button} href={srUrl}>
            SR 상세 보기
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
// Styles...
```

### Mattermost 알림 포맷

**lib/notifications/mattermost.ts**:

```typescript
interface MattermostAttachment {
  fallback: string
  color: string
  pretext?: string
  title: string
  title_link?: string
  text: string
  fields: Array<{
    short: boolean
    title: string
    value: string
  }>
}

export function formatSRCreatedMessage(data: {
  srNumber: string
  title: string
  priority: string
  requesterName: string
  clientName: string
  srUrl: string
}): { text: string; attachments: MattermostAttachment[] } {
  const priorityColor = {
    CRITICAL: '#dc3545',
    HIGH: '#fd7e14',
    MEDIUM: '#ffc107',
    LOW: '#28a745',
  }[data.priority] || '#6c757d'

  const priorityEmoji = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢',
  }[data.priority] || '⚪'

  return {
    text: `### ${priorityEmoji} 새로운 SR 등록`,
    attachments: [
      {
        fallback: `SR ${data.srNumber} 등록: ${data.title}`,
        color: priorityColor,
        title: data.title,
        title_link: data.srUrl,
        text: '새로운 SR이 등록되었습니다.',
        fields: [
          {
            short: true,
            title: 'SR 번호',
            value: data.srNumber,
          },
          {
            short: true,
            title: '우선순위',
            value: data.priority,
          },
          {
            short: true,
            title: '요청자',
            value: data.requesterName,
          },
          {
            short: true,
            title: '고객사',
            value: data.clientName,
          },
        ],
      },
    ],
  }
}

export function formatSRAssignedMessage(data: {
  srNumber: string
  title: string
  assigneeName: string
  priority: string
  slaDeadline: string
  srUrl: string
}): { text: string; attachments: MattermostAttachment[] } {
  return {
    text: `### 👤 SR 할당`,
    attachments: [
      {
        fallback: `SR ${data.srNumber} 할당: ${data.assigneeName}`,
        color: '#007bff',
        title: data.title,
        title_link: data.srUrl,
        text: 'SR이 할당되었습니다.',
        fields: [
          {
            short: true,
            title: 'SR 번호',
            value: data.srNumber,
          },
          {
            short: true,
            title: '담당자',
            value: `@${data.assigneeName}`,
          },
          {
            short: true,
            title: '우선순위',
            value: data.priority,
          },
          {
            short: true,
            title: 'SLA 마감',
            value: data.slaDeadline,
          },
        ],
      },
    ],
  }
}

export function formatSRCompletedMessage(data: {
  srNumber: string
  title: string
  assigneeName: string
  completedAt: string
  srUrl: string
}): { text: string; attachments: MattermostAttachment[] } {
  return {
    text: `### ✅ SR 완료`,
    attachments: [
      {
        fallback: `SR ${data.srNumber} 완료`,
        color: '#28a745',
        title: data.title,
        title_link: data.srUrl,
        text: 'SR이 완료되었습니다.',
        fields: [
          {
            short: true,
            title: 'SR 번호',
            value: data.srNumber,
          },
          {
            short: true,
            title: '담당자',
            value: data.assigneeName,
          },
          {
            short: false,
            title: '완료 시간',
            value: data.completedAt,
          },
        ],
      },
    ],
  }
}

export function formatSLABreachedMessage(data: {
  srNumber: string
  title: string
  priority: string
  assigneeName: string
  overdueDuration: string
  srUrl: string
}): { text: string; attachments: MattermostAttachment[] } {
  return {
    text: `### ⚠️ SLA 위반 경고`,
    attachments: [
      {
        fallback: `SR ${data.srNumber} SLA 위반`,
        color: '#dc3545',
        title: data.title,
        title_link: data.srUrl,
        text: '⚠️ **SLA 시간이 초과되었습니다!**',
        fields: [
          {
            short: true,
            title: 'SR 번호',
            value: data.srNumber,
          },
          {
            short: true,
            title: '우선순위',
            value: data.priority,
          },
          {
            short: true,
            title: '담당자',
            value: `@${data.assigneeName}`,
          },
          {
            short: true,
            title: '초과 시간',
            value: data.overdueDuration,
          },
        ],
      },
    ],
  }
}
```

**lib/notifications/send-mattermost.ts**:

```typescript
export async function sendMattermostNotification(
  webhookUrl: string,
  message: { text: string; attachments?: any[] }
) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      throw new Error(`Mattermost notification failed: ${response.statusText}`)
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to send Mattermost notification:', error)
    throw error
  }
}
```

---

## UI/UX 구현 가이드 (UI/UX Implementation Guide)

### 대시보드 레이아웃

**app/dashboard/page.tsx**:

```tsx
import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardStats } from '@/components/dashboard/stats'
import { RecentSRs } from '@/components/dashboard/recent-srs'
import { SLAAlerts } from '@/components/dashboard/sla-alerts'
import { PriorityChart } from '@/components/dashboard/priority-chart'
import { StatusChart } from '@/components/dashboard/status-chart'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">대시보드</h1>
        <p className="text-muted-foreground">
          SR 관리 현황을 한눈에 확인하세요
        </p>
      </div>

      <Suspense fallback={<StatsLoading />}>
        <DashboardStats userId={session.user.id} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<ChartLoading />}>
          <PriorityChart userId={session.user.id} />
        </Suspense>

        <Suspense fallback={<ChartLoading />}>
          <StatusChart userId={session.user.id} />
        </Suspense>
      </div>

      <Suspense fallback={<AlertsLoading />}>
        <SLAAlerts userId={session.user.id} />
      </Suspense>

      <Suspense fallback={<TableLoading />}>
        <RecentSRs userId={session.user.id} />
      </Suspense>
    </div>
  )
}
```

**components/dashboard/stats.tsx**:

```tsx
import { db } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, CheckCircle, Clock, AlertTriangle } from 'lucide-react'

export async function DashboardStats({ userId }: { userId: string }) {
  const [total, inProgress, completed, breached] = await Promise.all([
    db.sR.count({ where: { requesterId: userId } }),
    db.sR.count({ where: { requesterId: userId, status: 'IN_PROGRESS' } }),
    db.sR.count({ where: { requesterId: userId, status: 'COMPLETED' } }),
    // SLA breached query (complex, simplified here)
    db.sR.count({
      where: {
        requesterId: userId,
        status: { notIn: ['COMPLETED', 'REJECTED'] },
      },
    }),
  ])

  const stats = [
    {
      title: '전체 SR',
      value: total,
      icon: Activity,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: '진행 중',
      value: inProgress,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      title: '완료',
      value: completed,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'SLA 초과',
      value: breached,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

### SR 상세 페이지

**app/srs/[id]/page.tsx**:

```tsx
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { SRHeader } from '@/components/sr/sr-header'
import { SRDetails } from '@/components/sr/sr-details'
import { SRActivities } from '@/components/sr/sr-activities'
import { SRComments } from '@/components/sr/sr-comments'
import { SRAttachments } from '@/components/sr/sr-attachments'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function SRDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const sr = await db.sR.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      requester: true,
      assignee: true,
      activities: {
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      },
      comments: {
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      },
      attachments: true,
    },
  })

  if (!sr) notFound()

  return (
    <div className="space-y-6">
      <SRHeader sr={sr} userId={session.user.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SRDetails sr={sr} />

          <Tabs defaultValue="activities" className="w-full">
            <TabsList>
              <TabsTrigger value="activities">활동 내역</TabsTrigger>
              <TabsTrigger value="comments">
                댓글 ({sr.comments.length})
              </TabsTrigger>
              <TabsTrigger value="attachments">
                첨부파일 ({sr.attachments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activities">
              <SRActivities activities={sr.activities} />
            </TabsContent>

            <TabsContent value="comments">
              <SRComments srId={sr.id} comments={sr.comments} />
            </TabsContent>

            <TabsContent value="attachments">
              <SRAttachments srId={sr.id} attachments={sr.attachments} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {/* Sidebar with SR metadata, actions, etc. */}
        </div>
      </div>
    </div>
  )
}
```

### SR 목록 테이블

**components/sr/sr-table.tsx**:

```tsx
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
import { ArrowUpDown, Search } from 'lucide-react'

type SRWithRelations = SR & {
  client: Client
  requester: User
  assignee: User | null
}

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
  },
  {
    accessorKey: 'title',
    header: '제목',
    cell: ({ row }) => (
      <div className="max-w-[400px] truncate">{row.getValue('title')}</div>
    ),
  },
  {
    accessorKey: 'priority',
    header: '우선순위',
    cell: ({ row }) => {
      const priority = row.getValue('priority') as string
      const colorMap = {
        CRITICAL: 'destructive',
        HIGH: 'orange',
        MEDIUM: 'yellow',
        LOW: 'green',
      }
      return <Badge variant={colorMap[priority]}>{priority}</Badge>
    },
  },
  {
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return <Badge variant="outline">{status}</Badge>
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
    cell: ({ row }) => row.original.assignee?.name || '미할당',
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
      return new Date(row.getValue('createdAt')).toLocaleDateString('ko-KR')
    },
  },
]

export function SRTable({ data }: { data: SRWithRelations[] }) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
    </div>
  )
}
```

---

## 성능 요구사항 및 벤치마크 (Performance Requirements & Benchmarks)

### 성능 목표

| 메트릭 | 목표 값 | 측정 방법 |
|--------|---------|-----------|
| 페이지 로드 시간 (First Contentful Paint) | < 1.5초 | Lighthouse, Web Vitals |
| 페이지 로드 시간 (Largest Contentful Paint) | < 2.5초 | Lighthouse, Web Vitals |
| Time to Interactive (TTI) | < 3.5초 | Lighthouse |
| API 응답 시간 (평균) | < 200ms | Server monitoring |
| API 응답 시간 (P95) | < 500ms | Server monitoring |
| 동시 사용자 수 | 500+ | Load testing |
| Database 쿼리 시간 (평균) | < 50ms | Prisma metrics |
| Database 쿼리 시간 (P95) | < 150ms | Prisma metrics |

### 성능 최적화 전략

**1. Database 최적화**

```typescript
// prisma/schema.prisma - 인덱스 최적화
model SR {
  // ...

  @@index([clientId, status])
  @@index([requesterId, createdAt])
  @@index([assigneeId, status])
  @@index([srNumber])
  @@index([status, priority, createdAt])
}

model SRActivity {
  // ...

  @@index([srId, createdAt])
}

model SRComment {
  // ...

  @@index([srId, createdAt])
}
```

**2. 쿼리 최적화 예시**

```typescript
// Bad - N+1 문제
const srs = await db.sR.findMany()
for (const sr of srs) {
  const client = await db.client.findUnique({ where: { id: sr.clientId } })
}

// Good - Include를 사용한 Eager Loading
const srs = await db.sR.findMany({
  include: {
    client: true,
    requester: { select: { id: true, name: true, email: true } },
    assignee: { select: { id: true, name: true, email: true } },
  },
})
```

**3. 캐싱 전략**

```typescript
// lib/cache.ts
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300 // 5 minutes
): Promise<T> {
  // Try cache first
  const cached = await redis.get<T>(key)
  if (cached) return cached

  // Fetch fresh data
  const data = await fetcher()

  // Cache it
  await redis.setex(key, ttl, data)

  return data
}

// 사용 예시
export async function getDashboardStats(userId: string) {
  return getCachedData(
    `dashboard:stats:${userId}`,
    async () => {
      return {
        total: await db.sR.count({ where: { requesterId: userId } }),
        inProgress: await db.sR.count({ where: { requesterId: userId, status: 'IN_PROGRESS' } }),
        completed: await db.sR.count({ where: { requesterId: userId, status: 'COMPLETED' } }),
      }
    },
    60 // 1 minute cache
  )
}
```

**4. React Query 설정**

```typescript
// lib/react-query.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      cacheTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
```

**5. 이미지 최적화**

```tsx
// Next.js Image 컴포넌트 사용
import Image from 'next/image'

export function UserAvatar({ src, name }: { src?: string; name: string }) {
  return (
    <Image
      src={src || '/default-avatar.png'}
      alt={name}
      width={40}
      height={40}
      className="rounded-full"
      loading="lazy"
    />
  )
}
```

### 부하 테스트

**tests/load/k6-test.js**:

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'],   // Error rate should be below 1%
  },
}

const BASE_URL = 'https://your-app.vercel.app'

export default function () {
  // Test homepage
  let res = http.get(`${BASE_URL}/`)
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in <2s': (r) => r.timings.duration < 2000,
  })

  sleep(1)

  // Test SR list
  res = http.get(`${BASE_URL}/api/srs`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  })
  check(res, {
    'SR list status is 200': (r) => r.status === 200,
    'SR list loads in <500ms': (r) => r.timings.duration < 500,
  })

  sleep(1)
}
```

**실행 방법**:

```bash
# k6 설치
brew install k6  # macOS
# or
choco install k6  # Windows

# 부하 테스트 실행
k6 run tests/load/k6-test.js

# Grafana Cloud로 결과 전송
k6 run --out cloud tests/load/k6-test.js
```

### 모니터링 알림

**lib/monitoring/alerts.ts**:

```typescript
import * as Sentry from '@sentry/nextjs'

export function setupPerformanceMonitoring() {
  // Track slow database queries
  if (typeof window === 'undefined') {
    const originalQuery = db.$queryRaw
    db.$queryRaw = async (...args) => {
      const start = Date.now()
      const result = await originalQuery.apply(db, args)
      const duration = Date.now() - start

      if (duration > 1000) {
        Sentry.captureMessage('Slow database query', {
          level: 'warning',
          extra: {
            duration,
            query: args[0],
          },
        })
      }

      return result
    }
  }
}

// API 라우트에서 사용
export function withPerformanceTracking(handler: any) {
  return async (req: Request) => {
    const start = Date.now()

    try {
      const response = await handler(req)
      const duration = Date.now() - start

      // Log slow API responses
      if (duration > 500) {
        console.warn(`Slow API response: ${req.url} took ${duration}ms`)
      }

      return response
    } catch (error) {
      const duration = Date.now() - start
      Sentry.captureException(error, {
        extra: {
          url: req.url,
          method: req.method,
          duration,
        },
      })
      throw error
    }
  }
}
```

---

## 부록

### package.json

```json
{
  "name": "sr-management-system",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "prisma db seed",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@auth/prisma-adapter": "^1.0.0",
    "@prisma/client": "^5.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "@react-email/components": "^0.0.10",
    "@supabase/supabase-js": "^2.38.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-table": "^8.10.0",
    "@upstash/ratelimit": "^1.0.0",
    "@upstash/redis": "^1.25.0",
    "bcrypt": "^5.1.1",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "inngest": "^3.0.0",
    "next": "14.0.0",
    "next-auth": "^5.0.0-beta",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.48.0",
    "recharts": "^2.10.0",
    "resend": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.22.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@sentry/nextjs": "^7.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/react": "^14.1.0",
    "@types/bcrypt": "^5.0.2",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.54.0",
    "eslint-config-next": "14.0.0",
    "jsdom": "^23.0.0",
    "postcss": "^8.4.0",
    "prettier": "^3.1.0",
    "prisma": "^5.0.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

### 환경 변수 예시 (.env.example)

```bash
# Database
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://[ENDPOINT].upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# Resend
RESEND_API_KEY="re_..."

# Inngest
INNGEST_EVENT_KEY="your-event-key"
INNGEST_SIGNING_KEY="your-signing-key"

# Mattermost
MATTERMOST_WEBHOOK_URL="https://mattermost.example.com/hooks/..."

# Sentry
NEXT_PUBLIC_SENTRY_DSN="https://..."
SENTRY_AUTH_TOKEN="your-auth-token"

# Axiom
AXIOM_TOKEN="your-axiom-token"
AXIOM_ORG_ID="your-org-id"
```

---

**문서 버전 관리:**

| 버전 | 작성자 | 변경 사항 | 작성일 |
|------|--------|-----------|--------|
| 1.0 | Development Team | TRD 초안 작성 | 2025-11-06 |

---

*이 문서는 SR 관리 시스템의 기술적 구현을 위한 상세 가이드입니다. 개발 진행 중 기술적 의사결정이나 변경사항이 발생할 경우 본 문서를 업데이트합니다.*
