# 권한 시스템 구현 가이드

## 📋 목차
1. [개요](#개요)
2. [구현된 기능](#구현된-기능)
3. [권한 체계](#권한-체계)
4. [사용 방법](#사용-방법)
5. [테스트 시나리오](#테스트-시나리오)

---

## 개요

SR Management System의 권한 시스템이 완전히 구현되었습니다. 이제 사용자의 역할(Role)과 권한(Permission)에 따라 UI와 기능이 제한됩니다.

### 주요 특징
- ✅ 세션 기반 권한 관리
- ✅ 역할(Role) 기반 접근 제어 (RBAC)
- ✅ 페이지 레벨 권한 체크
- ✅ 컴포넌트 레벨 권한 체크
- ✅ 사이드바 메뉴 필터링
- ✅ 버튼/액션 숨김 처리

---

## 구현된 기능

### 1. 세션에 권한 정보 포함 ✅

**파일**: `src/auth.ts`, `src/types/next-auth.d.ts`

로그인 시 사용자의 역할과 권한이 JWT 토큰에 포함되며, 세션을 통해 클라이언트에서 접근 가능합니다.

```typescript
session.user = {
  id: "...",
  email: "...",
  name: "...",
  roles: ["ADMIN", "MANAGER"],
  permissions: ["SR.CREATE", "SR.READ", "CLIENT.READ", ...]
}
```

### 2. 권한 체크 훅 ✅

**파일**: `src/hooks/use-permissions.ts`

클라이언트 컴포넌트에서 권한을 쉽게 체크할 수 있는 커스텀 훅입니다.

```typescript
const { 
  hasPermission,
  hasRole,
  isAdmin,
  permissions,
  roles
} = usePermissions();

// 사용 예시
if (hasPermission("SR", "CREATE")) {
  // SR 생성 권한이 있는 경우
}

if (hasRole("ADMIN")) {
  // ADMIN 역할인 경우
}
```

### 3. 권한 가드 컴포넌트 ✅

**파일**: `src/components/auth/PermissionGuard.tsx`

특정 권한이나 역할이 있는 사용자에게만 UI를 표시합니다.

```typescript
<PermissionGuard resource="SR" action="CREATE">
  <Button>새 SR 생성</Button>
</PermissionGuard>

<PermissionGuard role="ADMIN">
  <Button>역할 관리</Button>
</PermissionGuard>

<PermissionGuard roles={["ADMIN", "MANAGER"]}>
  <Button>사용자 비활성화</Button>
</PermissionGuard>
```

### 4. 사이드바 메뉴 필터링 ✅

**파일**: `src/components/layout/Sidebar.tsx`

사용자의 권한에 따라 사이드바 메뉴가 동적으로 표시됩니다.

| 메뉴 | 필요 권한/역할 |
|------|--------------|
| Dashboard | 모든 사용자 |
| SR 관리 | `SR.READ` 권한 |
| 고객사 관리 | `CLIENT.READ` 권한 |
| 사용자 관리 | `ADMIN` 또는 `MANAGER` 역할 |
| 역할 관리 | `ADMIN` 역할 |
| 설정 | 모든 사용자 |

### 5. 페이지별 권한 적용 ✅

#### 사용자 관리 페이지 (`/users`)
- **"새 사용자 추가" 버튼**: `ADMIN` 역할만 표시
- **"역할 관리" 버튼**: `ADMIN` 역할만 표시
- **"활성화/비활성화" 버튼**: `ADMIN` 또는 `MANAGER` 역할만 표시

#### SR 관리 페이지 (`/srs`)
- **"새 SR 생성" 버튼**: `SR.CREATE` 권한이 있는 사용자만 표시

---

## 권한 체계

### 역할(Role) 정의

| 역할 | 설명 | 주요 권한 |
|------|------|----------|
| **ADMIN** | 시스템 관리자 | 모든 권한 |
| **MANAGER** | 팀 관리자 | SR 관리, 사용자 조회, 일부 관리 기능 |
| **VIEWER** | 조회 전용 | 읽기 전용 권한 |

### 권한(Permission) 형식

권한은 `RESOURCE.ACTION` 형식입니다:

- `SR.CREATE` - SR 생성 권한
- `SR.READ` - SR 조회 권한
- `SR.UPDATE` - SR 수정 권한
- `SR.DELETE` - SR 삭제 권한
- `CLIENT.READ` - 고객사 조회 권한
- `CLIENT.CREATE` - 고객사 생성 권한
- `USER.READ` - 사용자 조회 권한

### 권한 할당 흐름

```
User (사용자)
  ↓
UserRole (사용자-역할 매핑)
  ↓
Role (역할)
  ↓
RolePermission (역할-권한 매핑)
  ↓
Permission (권한)
```

---

## 사용 방법

### 1. 새 페이지에 권한 적용

```typescript
// 페이지 컴포넌트
"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function MyPage() {
  const { hasPermission, hasRole } = usePermissions();

  return (
    <div>
      <h1>My Page</h1>
      
      {/* 특정 권한이 있는 사용자만 버튼 표시 */}
      <PermissionGuard resource="RESOURCE" action="CREATE">
        <Button>생성</Button>
      </PermissionGuard>

      {/* 특정 역할이 있는 사용자만 섹션 표시 */}
      <PermissionGuard role="ADMIN">
        <AdminSection />
      </PermissionGuard>

      {/* 조건부 로직 */}
      {hasPermission("RESOURCE", "UPDATE") && (
        <EditForm />
      )}
    </div>
  );
}
```

### 2. 사이드바에 메뉴 추가

`src/components/layout/Sidebar.tsx` 파일의 `sidebarItems` 배열에 추가:

```typescript
{
  title: "새 메뉴",
  href: "/new-menu",
  icon: NewIcon,
  permission: { resource: "RESOURCE", action: "READ" }, // 권한 기반
  // 또는
  role: "ADMIN", // 역할 기반
  // 또는
  roles: ["ADMIN", "MANAGER"], // 여러 역할 중 하나
}
```

### 3. API 라우트에서 권한 체크

```typescript
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 권한 체크
  const canCreate = await hasPermission(session.user.id, "SR", "CREATE");
  if (!canCreate) {
    return NextResponse.json(
      { error: "권한이 없습니다." },
      { status: 403 }
    );
  }

  // 로직 실행
  // ...
}
```

---

## 테스트 시나리오

### 시나리오 1: ADMIN 사용자

1. **로그인**: `admin@example.com` / `admin123`
2. **예상 결과**:
   - ✅ 모든 사이드바 메뉴 표시
   - ✅ "새 SR 생성" 버튼 표시
   - ✅ "새 사용자 추가" 버튼 표시
   - ✅ "역할 관리" 버튼 표시
   - ✅ 모든 기능 접근 가능

### 시나리오 2: MANAGER 사용자

1. **준비**: 
   - 새 사용자 생성 (`manager@example.com`)
   - `MANAGER` 역할 할당
   - `SR.READ`, `SR.CREATE`, `CLIENT.READ` 권한 부여

2. **로그인**: `manager@example.com` / (설정한 비밀번호)

3. **예상 결과**:
   - ✅ Dashboard, SR 관리, 고객사 관리, 사용자 관리, 설정 메뉴 표시
   - ❌ 역할 관리 메뉴 숨김 (ADMIN 전용)
   - ✅ "새 SR 생성" 버튼 표시 (SR.CREATE 권한)
   - ❌ "새 사용자 추가" 버튼 숨김 (ADMIN 전용)
   - ❌ "역할 관리" 버튼 숨김 (ADMIN 전용)
   - ✅ "활성화/비활성화" 버튼 표시 (MANAGER 권한)

### 시나리오 3: VIEWER 사용자

1. **준비**:
   - 새 사용자 생성 (`viewer@example.com`)
   - `VIEWER` 역할 할당
   - `SR.READ`, `CLIENT.READ` 권한 부여

2. **로그인**: `viewer@example.com` / (설정한 비밀번호)

3. **예상 결과**:
   - ✅ Dashboard, SR 관리, 고객사 관리, 설정 메뉴 표시
   - ❌ 사용자 관리, 역할 관리 메뉴 숨김
   - ❌ "새 SR 생성" 버튼 숨김 (SR.CREATE 권한 없음)
   - ❌ 모든 수정/삭제 버튼 숨김 (조회 전용)

### 시나리오 4: 역할 없는 사용자

1. **준비**:
   - 새 사용자 생성 (`noRole@example.com`)
   - 역할 할당하지 않음

2. **로그인**: `noRole@example.com` / (설정한 비밀번호)

3. **예상 결과**:
   - ✅ Dashboard, 설정 메뉴만 표시
   - ❌ 다른 모든 메뉴 숨김
   - ❌ 모든 액션 버튼 숨김

---

## 권한 설정 방법

### 1. 역할 생성

1. ADMIN 계정으로 로그인
2. **역할 관리** 페이지 접속 (`/roles`)
3. **"새 역할"** 버튼 클릭
4. 역할 이름 및 설명 입력
5. **"권한 관리"** 버튼으로 권한 할당

### 2. 사용자에게 역할 할당

1. ADMIN 계정으로 로그인
2. **사용자 관리** 페이지 접속 (`/users`)
3. 대상 사용자의 **"역할 관리"** 버튼 클릭
4. 역할 선택 (복수 선택 가능)
5. **"저장"** 클릭

---

## 주요 파일 목록

```
src/
├── auth.ts                                  # NextAuth 설정 (권한 정보 포함)
├── types/
│   └── next-auth.d.ts                      # NextAuth 타입 정의
├── hooks/
│   └── use-permissions.ts                  # 권한 체크 훅
├── components/
│   ├── auth/
│   │   └── PermissionGuard.tsx            # 권한 가드 컴포넌트
│   └── layout/
│       └── Sidebar.tsx                     # 권한 기반 사이드바
├── lib/
│   └── permissions.ts                      # 서버 사이드 권한 유틸리티
└── app/
    └── (dashboard)/
        ├── users/page.tsx                  # 권한 적용 예시
        └── srs/page.tsx                    # 권한 적용 예시
```

---

## 🎉 완료!

권한 시스템이 완전히 구현되었습니다! 이제 사용자의 역할과 권한에 따라 시스템 기능이 제한됩니다.

### 다음 단계
1. 각 역할별 테스트 사용자 생성
2. 역할에 적절한 권한 할당
3. 기능별 권한 체크 확인
4. 추가 페이지/기능에 권한 적용

**작업 완료 일시**: 2024-11-08

