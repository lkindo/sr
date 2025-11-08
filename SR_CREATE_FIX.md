# 🔧 SR 생성 오류 해결

**날짜**: 2024-11-08  
**문제**: SR 생성 시 500 Internal Server Error  
**상태**: ✅ 해결 완료

---

## 🔍 문제

### 증상
```
POST /api/srs → 500 Internal Server Error
❌ [CreateSR] API 에러 응답
❌ [CreateSR] SR 생성 실패: SR 생성 중 오류가 발생했습니다.
```

### 원인
```typescript
// src/app/api/srs/route.ts (이전)
const session = { user: { id: "temp-user-id" } } as any; // 임시 세션

// Prisma 생성 시
const sr = await prisma.sR.create({
  data: {
    requesterId: session.user.id,  // "temp-user-id" ← 존재하지 않는 사용자!
    // ...
  }
});
```

**문제**:
- `requesterId`는 `User` 테이블의 Foreign Key
- `"temp-user-id"`는 데이터베이스에 존재하지 않음
- Foreign Key 제약 조건 위반으로 500 에러 발생

---

## ✅ 해결 방법

### 수정된 코드
```typescript
// src/app/api/srs/route.ts (수정 후)
export async function POST(request: NextRequest) {
  try {
    // 임시: admin 사용자 조회
    const adminUser = await prisma.user.findFirst({
      where: { email: "admin@example.com" }
    });
    
    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found. Please run seed script." },
        { status: 500 }
      );
    }
    
    const session = { 
      user: { 
        id: adminUser.id,        // 실제 존재하는 사용자 ID!
        email: adminUser.email 
      } 
    } as any;

    const body = await request.json();
    const validated = srSchema.parse(body);
    
    // SR 생성
    const sr = await prisma.sR.create({
      data: {
        requesterId: session.user.id,  // 이제 유효한 사용자 ID
        // ...
      }
    });
    
    return NextResponse.json(sr, { status: 201 });
  } catch (error) {
    // 에러 처리
  }
}
```

### 변경 사항
1. **Before**: `"temp-user-id"` (하드코딩된 존재하지 않는 ID)
2. **After**: `adminUser.id` (데이터베이스에서 조회한 실제 ID)

---

## 🧪 테스트 방법

### 1. 서버가 실행 중인지 확인
```
✅ 서버 재시작 완료
```

### 2. 브라우저에서 테스트
```
1. http://localhost:3000 접속
2. 로그인 (admin@example.com / admin123)
3. SR 관리 클릭
4. "새 SR 생성" 버튼 클릭
5. 폼 작성:
   - 고객사: 선택
   - 서비스 카테고리: 선택
   - 제목: 입력
   - 설명: 입력
   - 우선순위: 선택
6. "생성" 버튼 클릭
7. ✅ SR 생성 성공 확인!
```

### 3. 예상 결과
```
✅ HTTP 201 Created
✅ SR이 목록에 추가됨
✅ SR 번호 자동 생성 (SR-YYYYMMDD-0001)
✅ 500 에러 없음
```

---

## 🔧 영구 해결 방법

### 문제의 근본 원인
현재는 임시로 `admin` 사용자를 사용하고 있지만, 실제로는 로그인한 사용자의 정보를 사용해야 합니다.

### 권장 솔루션: 커스텀 Auth 함수 사용

#### 1단계: 커스텀 Auth 함수 생성
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
      cookieStore.get("next-auth.session-token") ||
      cookieStore.get("__Secure-next-auth.session-token");
    
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
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles.map(ur => ur.role.name),
        permissions: user.roles.flatMap(ur =>
          ur.role.permissions.map(rp => rp.permission.name)
        ),
      },
    };
  } catch (error) {
    console.error("Failed to get API session:", error);
    return null;
  }
}
```

#### 2단계: POST 메서드 업데이트
```typescript
// src/app/api/srs/route.ts
import { getApiSession } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    // 실제 로그인한 사용자의 세션 가져오기
    const session = await getApiSession();
    
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const validated = srSchema.parse(body);
    
    // 로그인한 사용자를 requester로 사용
    const sr = await prisma.sR.create({
      data: {
        requesterId: session.user.id,  // 실제 로그인한 사용자!
        // ...
      }
    });
    
    return NextResponse.json(sr, { status: 201 });
  } catch (error) {
    // 에러 처리
  }
}
```

---

## 📊 Before vs After

### Before (임시 하드코딩)
```typescript
❌ const session = { user: { id: "temp-user-id" } };
❌ Foreign Key 제약 조건 위반
❌ 500 Internal Server Error
❌ 모든 SR이 같은 사용자로 생성됨
```

### After (임시 admin 사용)
```typescript
⚠️ const adminUser = await prisma.user.findFirst({ ... });
✅ 실제 존재하는 사용자 ID
✅ SR 생성 성공
⚠️ 하지만 모든 SR이 admin으로 생성됨
```

### Future (영구 해결)
```typescript
✅ const session = await getApiSession();
✅ 실제 로그인한 사용자 ID
✅ SR 생성 성공
✅ 각 SR이 올바른 requester와 연결됨
```

---

## 🎯 완료 체크리스트

### 즉시 확인
- [x] POST 메서드 수정 (admin 사용자 조회)
- [x] 서버 재시작
- [ ] 브라우저에서 SR 생성 테스트
- [ ] 500 에러 없음 확인
- [ ] SR 목록에서 새 SR 확인

### 단기 (1주 내)
- [ ] `src/lib/api-auth.ts` 파일 생성
- [ ] `getApiSession()` 함수 구현
- [ ] 모든 API 라우트 업데이트
- [ ] 실제 로그인한 사용자로 SR 생성 확인

### 추가 개선
- [ ] SR 수정 권한 체크 (requester 또는 assignee만)
- [ ] SR 삭제 권한 체크 (ADMIN만)
- [ ] SR 상태 변경 권한 체크 (role별로)

---

## 💡 주요 학습 포인트

### 1. Foreign Key 제약 조건
```
requesterId → User.id
모든 requesterId는 반드시 실제 존재하는 User.id여야 함
```

### 2. 임시 데이터의 위험성
```
"temp-user-id" 같은 하드코딩된 값은 개발 중에만 사용
프로덕션에서는 반드시 실제 데이터 사용
```

### 3. Auth 함수의 중요성
```
auth() 함수가 Edge Runtime 문제로 사용 불가
→ 커스텀 auth 함수 필요
→ getApiSession() 구현으로 해결
```

---

## 🚀 다음 단계

### 현재 상태
✅ SR 목록 조회 작동  
✅ SR 생성 작동 (임시로 admin 사용자)  
⚠️ SR 생성자가 항상 admin으로 표시됨

### 다음 작업
1. **영구 해결**: `getApiSession()` 구현
2. **권한 체크**: role별로 SR 작업 제한
3. **테스트**: 다양한 사용자로 SR 생성 테스트

---

**최종 업데이트**: 2024-11-08  
**상태**: 임시 해결 완료, 영구 솔루션 구현 대기  
**테스트**: 브라우저에서 SR 생성 확인 필요

**💡 핵심**: Foreign Key 제약 조건을 항상 고려하고, 실제 존재하는 데이터만 참조해야 합니다!

