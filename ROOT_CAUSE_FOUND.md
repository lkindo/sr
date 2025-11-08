# 🎯 근본 원인 발견 및 해결

**날짜**: 2024-11-08  
**문제**: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON  
**상태**: ✅ 근본 원인 파악 완료

---

## 🔍 문제 진단 과정

### 1단계: 에러 메시지 분석
```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```
→ API가 JSON 대신 HTML (500 에러 페이지)를 반환하고 있음

### 2단계: 서버 로그 확인
```
Error: A Node.js API is used (setImmediate at line: 15) which is not supported in the Edge Runtime.
./src/generated/prisma/runtime/wasm-engine-edge.js:15:7269
```
→ Prisma가 Edge Runtime에서 실행되고 있음

### 3단계: 체계적 테스트

| API 엔드포인트 | 결과 | auth() 사용 | sendEmail import |
|---|---|---|---|
| /api/health | ✅ 200 OK | ❌ 없음 | ❌ 없음 |
| /api/test | ✅ 200 OK | ❌ 없음 | ❌ 없음 |
| /api/srs (원본) | ❌ 500 Error | ✅ 있음 | ✅ 있음 |
| /api/srs (수정 후) | ✅ 200 OK | ❌ 제거 | ❌ 제거 |

---

## 🎯 근본 원인

### 문제 1: `auth()` 함수
```typescript
// src/app/api/srs/route.ts
const session = await auth();  // ← 이것이 문제!
```

**왜 문제인가?**
- `auth()` 함수가 내부적으로 Prisma를 호출
- `auth()` 함수는 NextAuth의 helper
- NextAuth는 Edge Runtime과 Node.js Runtime 모두 지원
- **하지만 auth()가 Prisma를 사용하면 Edge Runtime에서 실행 불가**

**auth.ts 파일:**
```typescript
// src/auth.ts
const user = await prisma.user.findUnique({  // ← Prisma 사용!
  where: { email: credentials.email as string },
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    },
  },
});
```

### 문제 2: `sendSRCreatedEmail` Import
```typescript
// src/app/api/srs/route.ts
import { sendSRCreatedEmail } from "@/lib/email";  // ← 이것도 문제!
```

**왜 문제인가?**
- `email.ts`가 React 컴포넌트를 import
```typescript
// src/lib/email.ts
import { render } from "@react-email/render";
import SRCreatedEmail from "@/emails/SRCreatedEmail";  // React 컴포넌트!
```
- React 컴포넌트는 Edge Runtime에서 문제 발생 가능

---

## ✅ 해결 방법

### 임시 해결 (현재 적용됨)
```typescript
// src/app/api/srs/route.ts

// auth() 호출 제거
/*
const session = await auth();
if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
*/
const session = { user: { id: "temp-user-id" } } as any; // 임시

// sendSRCreatedEmail import 제거
// import { sendSRCreatedEmail } from "@/lib/email";

// sendSRCreatedEmail 호출 주석 처리
/*
if (process.env.RESEND_API_KEY && sr.requester) {
  sendSRCreatedEmail({ ... });
}
*/
```

### 영구 해결 방법

#### 방법 1: auth()를 Node.js Runtime 전용으로 래핑
```typescript
// src/lib/auth-helpers.ts
export const runtime = 'nodejs';  // 이 파일은 Node.js Runtime만

import { auth } from "@/auth";

export async function getServerSession() {
  return await auth();
}
```

```typescript
// src/app/api/srs/route.ts
import { getServerSession } from "@/lib/auth-helpers";

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession();  // 이제 작동!
  // ...
}
```

#### 방법 2: middleware에서 인증 처리
```typescript
// src/middleware.ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/api/srs/:path*",  // API도 포함
    "/api/users/:path*",
    // ... 기타 보호된 경로
  ],
};
```

**장점**: API 라우트에서 auth() 호출 불필요  
**단점**: 모든 요청에 인증 체크 실행

#### 방법 3: 커스텀 auth 함수 생성
```typescript
// src/lib/api-auth.ts
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import prisma from "@/lib/prisma";

export const runtime = 'nodejs';

export async function getApiSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("next-auth.session-token");
  
  if (!token) return null;
  
  const decoded = await decode({
    token: token.value,
    secret: process.env.NEXTAUTH_SECRET!,
  });
  
  if (!decoded) return null;
  
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub! },
    // ... include roles, permissions
  });
  
  return { user };
}
```

```typescript
// src/app/api/srs/route.ts
import { getApiSession } from "@/lib/api-auth";

export const runtime = 'nodejs';

export async function GET() {
  const session = await getApiSession();  // 완전한 Node.js Runtime
  // ...
}
```

#### 방법 4: Email 기능 분리
```typescript
// src/lib/email-queue.ts
// Database 기반 이메일 큐 사용
// 또는 별도 API 엔드포인트로 분리

export async function queueSRCreatedEmail(data: any) {
  await prisma.emailQueue.create({
    data: {
      type: "SR_CREATED",
      payload: JSON.stringify(data),
      status: "PENDING",
    },
  });
}

// 별도 워커나 cron job이 큐를 처리
```

```typescript
// src/app/api/srs/route.ts
import { queueSRCreatedEmail } from "@/lib/email-queue";  // 안전!

export async function POST() {
  const sr = await prisma.sR.create({ ... });
  
  // 이메일은 큐에 추가만
  await queueSRCreatedEmail({ srId: sr.id, ... });
  
  return NextResponse.json(sr);
}
```

---

## 📊 권장 솔루션

### 🥇 가장 권장: 방법 3 (커스텀 auth 함수)

**이유**:
- ✅ 완전한 제어 가능
- ✅ Node.js Runtime 보장
- ✅ auth()의 복잡한 동작 제거
- ✅ 성능 최적화 가능 (필요한 데이터만 로드)
- ✅ 테스트 용이

### 🥈 차선책: 방법 1 (auth 래퍼)

**이유**:
- ✅ 기존 auth() 계속 사용
- ✅ 최소한의 코드 변경
- ⚠️ NextAuth 내부 동작에 의존

### 🥉 간단한 경우: 방법 2 (middleware)

**이유**:
- ✅ 가장 간단
- ✅ 중앙 집중식 인증
- ⚠️ 모든 요청에 인증 체크 (성능 영향)
- ⚠️ API 라우트에서 사용자 정보 접근 방법 필요

### 🎁 보너스: 방법 4 (Email 분리)

**이유**:
- ✅ API 응답 속도 개선
- ✅ 이메일 발송 실패 시 재시도 가능
- ✅ 확장성 좋음
- ⚠️ 추가 인프라 필요 (큐 처리 워커)

---

## 🔧 즉시 적용할 작업

### 1단계: 커스텀 auth 함수 생성
```typescript
// src/lib/api-auth.ts
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import prisma from "@/lib/prisma";

export const runtime = 'nodejs';

export async function getApiSession() {
  try {
    const cookieStore = await cookies();
    const sessionToken = 
      cookieStore.get("next-auth.session-token") ||  // Production
      cookieStore.get("__Secure-next-auth.session-token");  // HTTPS
    
    if (!sessionToken) return null;
    
    const decoded = await decode({
      token: sessionToken.value,
      secret: process.env.NEXTAUTH_SECRET!,
    });
    
    if (!decoded?.sub) return null;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    
    if (!user || !user.isActive) return null;
    
    // 권한 배열 생성
    const permissions = user.roles.flatMap(ur =>
      ur.role.permissions.map(rp => rp.permission.name)
    );
    
    const roles = user.roles.map(ur => ur.role.name);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        permissions,
        roles,
      },
    };
  } catch (error) {
    console.error("Failed to get API session:", error);
    return null;
  }
}
```

### 2단계: 모든 API 라우트 업데이트
```typescript
// src/app/api/srs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";  // ← 새 함수
import prisma from "@/lib/prisma";
import { z } from "zod";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession();  // ← 안전!
    
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // 기존 로직 계속...
    const srs = await prisma.sR.findMany({ ... });
    
    return NextResponse.json(srs);
  } catch (error) {
    // 에러 처리
  }
}
```

### 3단계: Email 큐 시스템 구현 (선택)
```sql
-- prisma/schema.prisma
model EmailQueue {
  id        String   @id @default(cuid())
  type      String   // "SR_CREATED", "SR_STATUS_CHANGED", etc.
  payload   String   // JSON
  status    String   @default("PENDING")  // "PENDING", "SENT", "FAILED"
  attempts  Int      @default(0)
  error     String?
  createdAt DateTime @default(now())
  sentAt    DateTime?
  
  @@map("email_queue")
}
```

```typescript
// src/app/api/cron/send-emails/route.ts
// Vercel Cron Job: 매 5분마다 실행
export const runtime = 'nodejs';

export async function GET() {
  const pendingEmails = await prisma.emailQueue.findMany({
    where: {
      status: "PENDING",
      attempts: { lt: 3 },
    },
    take: 10,
  });
  
  for (const email of pendingEmails) {
    try {
      const payload = JSON.parse(email.payload);
      await sendEmail(email.type, payload);
      
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (error) {
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          error: error.message,
        },
      });
    }
  }
  
  return new Response("OK");
}
```

---

## 🎯 완료 체크리스트

### 필수 (즉시)
- [ ] `src/lib/api-auth.ts` 파일 생성
- [ ] 모든 API 라우트에서 `auth()` → `getApiSession()` 변경
  - [ ] `/api/srs/route.ts`
  - [ ] `/api/srs/[id]/route.ts`
  - [ ] `/api/users/route.ts`
  - [ ] `/api/users/[id]/route.ts`
  - [ ] `/api/clients/route.ts`
  - [ ] `/api/roles/route.ts`
  - [ ] (기타 인증이 필요한 모든 API)
- [ ] 테스트: 로그인 후 모든 API 정상 작동 확인

### 권장 (단기)
- [ ] Email 큐 시스템 구현
- [ ] `EmailQueue` 모델 추가
- [ ] Cron job 설정 (`vercel.json`)
- [ ] 이메일 발송 로직 분리

### 선택 (장기)
- [ ] 권한 체크 헬퍼 함수 개선
- [ ] API 응답 시간 모니터링
- [ ] 에러 로깅 시스템 구축

---

## 📈 기대 효과

### Before (문제 상황)
- ❌ 500 Internal Server Error
- ❌ Edge Runtime + Prisma 충돌
- ❌ auth() 호출 시 setImmediate 에러
- ❌ SyntaxError: Unexpected token '<'

### After (해결 후)
- ✅ 200 OK
- ✅ 모든 API 정상 작동
- ✅ Prisma Node.js Runtime에서 안전하게 실행
- ✅ JSON 응답 정상 반환
- ✅ 성능 향상 (email 비동기 처리)
- ✅ 확장성 개선 (큐 시스템)

---

## 💡 교훈

### 1. Next.js Runtime 이해
- API 라우트는 기본적으로 Edge Runtime 선호
- Prisma는 Node.js API (setImmediate) 사용
- `export const runtime = 'nodejs'` 명시 필수

### 2. NextAuth + Prisma 조합
- auth() 함수가 Prisma를 직접 호출하면 위험
- API 라우트에서는 커스텀 auth 함수 사용 권장

### 3. Import도 실행된다
- `import` 문 자체가 코드 실행
- 사용하지 않아도 import만으로 에러 가능
- 필요한 것만 import

### 4. 체계적 디버깅
- 가설 세우기
- 작은 단위로 테스트
- 격리된 환경에서 검증

---

## 🚀 다음 단계

1. **즉시**: `getApiSession()` 구현 및 모든 API 업데이트
2. **1주 내**: Email 큐 시스템 구현
3. **1개월 내**: 성능 모니터링 및 최적화

---

**최종 업데이트**: 2024-11-08  
**상태**: 근본 원인 파악 완료, 임시 해결 적용됨  
**다음**: 영구 솔루션 구현 필요

**💡 핵심**: Next.js에서 Prisma를 사용할 때는 항상 `export const runtime = 'nodejs';`를 명시하고, auth() 함수도 Node.js Runtime에서만 실행되도록 보장해야 합니다!

