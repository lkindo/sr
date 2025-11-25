# 고객사 할당 제한 정책

## 개요

시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 모든 고객사의 SR을 조회할 수 있는 권한을 가지고 있습니다. 따라서 이들에게 특정 고객사를 할당하는 것은 권한 로직의 혼란을 야기하며, 데이터 무결성에도 문제가 발생할 수 있습니다.

이 문서는 방안 1(역할별 고객사 할당 제한)을 구현한 내용을 설명합니다.

## 문제점

### 1. 권한 로직의 혼란
- ADMIN/MANAGER/ENGINEER는 모든 SR을 조회할 수 있는데, 특정 고객사에 할당되면 의미가 불명확함
- `userClientIds`가 채워져 있지만 사용되지 않음
- 고객사 할당의 의미가 "제한"인지 "연관"인지 모호함

### 2. UI/UX 혼란
- ENGINEER가 고객사에 할당되면 "고객사 담당자"로 표시됨
- 역할은 ENGINEER인데 유형이 "고객사 담당자"인 모순 발생

### 3. SR 생성 로직 문제
- ENGINEER가 고객사에 할당되면 SR 생성 시 해당 고객사가 자동 선택됨
- 다른 고객사의 SR을 생성하기 어려워짐

## 구현된 해결 방안

### 1. API 레벨 검증

#### 고객사 할당 API (`/api/users/[id]/client`)

**파일:** [src/app/api/users/[id]/client/route.ts](../src/app/api/users/[id]/client/route.ts)

```typescript
// 대상 사용자의 역할 확인 - 시스템 운영팀은 고객사 할당 불가
const targetUserRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true }
});

const isSystemTeam = targetUserRoles.some((ur: any) =>
    ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
);

if (isSystemTeam) {
    const systemRoles = targetUserRoles
        .filter((ur: any) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name))
        .map((ur: any) => ur.role.name)
        .join(', ');

    return NextResponse.json(
        {
            error: "시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다",
            details: `현재 역할: ${systemRoles}`
        },
        { status: 400 }
    );
}
```

#### Repository 레벨 검증

**파일:** [src/repositories/user.repository.ts](../src/repositories/user.repository.ts)

```typescript
async updateClientAssociations(userId: string, clientIds: string[]): Promise<void> {
    // 시스템 운영팀(ADMIN, MANAGER, ENGINEER) 사용자는 고객사 할당 불가
    const userRoles = await this.model.findUnique({
        where: { id: userId },
        select: {
            roles: {
                include: { role: true }
            }
        }
    });

    if (userRoles) {
        const isSystemTeam = userRoles.roles.some((ur: any) =>
            ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
        );

        if (isSystemTeam && clientIds.length > 0) {
            const systemRoles = userRoles.roles
                .filter((ur: any) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name))
                .map((ur: any) => ur.role.name)
                .join(', ');

            throw new Error(
                `시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다. 현재 역할: ${systemRoles}`
            );
        }
    }
    // ... 기존 로직
}
```

### 2. UI 레벨 개선

#### 사용자 목록 - 개별 할당 UI

**파일:** [src/app/(dashboard)/users/page.tsx](../src/app/(dashboard)/users/page.tsx)

시스템 운영팀에게는 고객사 할당 드롭다운/배지 대신 "할당 불가" 배지를 표시:

```typescript
{(() => {
    // 시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사 할당 불가
    const isSystemTeam = user.roles.some((ur) =>
        ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
    );

    if (isSystemTeam) {
        return (
            <Badge variant="secondary" className="text-xs text-muted-foreground">
                할당 불가
            </Badge>
        );
    }

    // CLIENT 역할만 할당 가능
    return user.clients.length === 0 ? (
        <ClientAssignDropdown ... />
    ) : (
        user.clients.map((uc) => (
            <ClientBadgeWithActions ... />
        ))
    );
})()}
```

#### 일괄 할당 기능

시스템 운영팀이 선택되었을 때 경고 표시 및 버튼 비활성화:

```typescript
{selectedUserIds.size > 0 && (() => {
    // 선택된 사용자 중 시스템 운영팀 체크
    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
    const systemTeamCount = selectedUsers.filter((u) =>
        u.roles.some((ur) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name))
    ).length;
    const clientUserCount = selectedUsers.length - systemTeamCount;

    return (
        <>
            <Badge variant="secondary" className="text-sm">
                {selectedUserIds.size}명 선택됨
            </Badge>
            {systemTeamCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                    ⚠️ 시스템 운영팀 {systemTeamCount}명 포함 (할당 불가)
                </Badge>
            )}
            <Button
                size="sm"
                onClick={handleBulkAssign}
                disabled={!bulkAssignClientId || clientUserCount === 0}
                title={clientUserCount === 0 ? '할당 가능한 사용자가 없습니다' : ''}
            >
                할당 ({clientUserCount}명)
            </Button>
        </>
    );
})()}
```

일괄 할당 시 상세한 오류 메시지 표시:

```typescript
const handleBulkAssign = async () => {
    // ... API 호출

    if (failResults.length > 0) {
        // 시스템 운영팀 할당 오류 메시지 확인
        const systemTeamErrors = failResults.filter((r: any) =>
            r.error?.includes('시스템 운영팀')
        );

        if (systemTeamErrors.length > 0) {
            toast({
                title: "할당 제한",
                description: `${systemTeamErrors.length}명은 시스템 운영팀(ADMIN, MANAGER, ENGINEER)이므로 고객사를 할당할 수 없습니다.`,
                variant: "destructive",
            });
        }
    }
};
```

### 3. 역할 할당 API 검증 (양방향 보호)

**파일:** [src/app/api/users/[id]/roles/route.ts](../src/app/api/users/[id]/roles/route.ts)

역할 할당 순서에 따른 문제를 방지하기 위해 역할 할당 시 고객사 할당 상태를 검증합니다.

#### 문제 시나리오
1. **CLIENT → ADMIN**: 사용자가 고객사에 할당되어 있는데 ADMIN 역할을 받음
2. **역할 없음 → ENGINEER**: 고객사 할당 후 ENGINEER 역할을 받음

#### 해결 방법
```typescript
// 시스템 운영팀 역할(ADMIN, MANAGER, ENGINEER)을 할당하려는 경우
// 기존 고객사 할당이 있으면 차단
if (validated.roleIds.length > 0) {
    const roles = await prisma.role.findMany({
        where: { id: { in: validated.roleIds } },
        select: { id: true, name: true }
    });

    const hasSystemTeamRole = roles.some(role =>
        ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role.name)
    );

    if (hasSystemTeamRole && user.clients.length > 0) {
        return NextResponse.json({
            error: "시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다",
            details: `사용자는 현재 다음 고객사에 할당되어 있습니다: ${clientNames}`,
            suggestion: "먼저 고객사 할당을 해제한 후 시스템 운영팀 역할을 부여하세요.",
            assignedClients: [...]
        }, { status: 400 });
    }
}
```

**UI 개선:** [src/components/users/AssignRolesDialog.tsx](../src/components/users/AssignRolesDialog.tsx)

상세한 오류 메시지를 8초간 표시:
- 할당된 고객사 목록
- 해결 방법 제안

```typescript
if (error.assignedClients && error.assignedClients.length > 0) {
    const clientNames = error.assignedClients.map((c: any) => c.name).join(', ');
    toast({
        title: "역할 할당 제한",
        description: (
            <div className="space-y-2">
                <p>{error.error}</p>
                <p className="text-sm">
                    <strong>할당된 고객사:</strong> {clientNames}
                </p>
                <p className="text-sm text-muted-foreground">{error.suggestion}</p>
            </div>
        ),
        variant: "destructive",
        duration: 8000,
    });
}
```

### 4. 데이터 정리 스크립트

**파일:** [scripts/cleanup-system-team-clients.ts](../scripts/cleanup-system-team-clients.ts)

기존에 잘못 할당된 데이터를 정리하는 마이그레이션 스크립트:

```bash
# Dry-run (실제 삭제하지 않고 확인만)
pnpm cleanup:system-team-clients:dry-run

# 실제 정리 실행
pnpm cleanup:system-team-clients
```

스크립트 기능:
- 시스템 운영팀(ADMIN, MANAGER, ENGINEER) 사용자 조회
- 고객사가 할당된 시스템 운영팀 사용자 필터링
- 삭제될 UserClient 관계 상세 정보 출력
- Dry-run 모드 지원

## 영향 범위

### 제한되는 역할
- ❌ ADMIN
- ❌ MANAGER
- ❌ ENGINEER

### 허용되는 역할
- ✅ CLIENT_ADMIN
- ✅ CLIENT_USER
- ✅ 역할이 없는 사용자 (기본적으로 CLIENT로 간주)

## 테스트 시나리오

### 1. API 테스트
```bash
# ADMIN에게 고객사 할당 시도 (실패해야 함)
curl -X PATCH http://localhost:3000/api/users/{admin-user-id}/client \
  -H "Content-Type: application/json" \
  -d '{"clientId": "some-client-id"}'

# 응답 예시:
{
  "error": "시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다",
  "details": "현재 역할: ADMIN"
}
```

### 2. UI 테스트
1. 사용자 목록 페이지 접속
2. ADMIN/MANAGER/ENGINEER 사용자의 고객사 열 확인
   - "할당 불가" 배지가 표시되어야 함
   - 드롭다운이나 할당 버튼이 없어야 함

3. 일괄 할당 테스트
   - ADMIN과 CLIENT 사용자를 함께 선택
   - "⚠️ 시스템 운영팀 X명 포함 (할당 불가)" 배지 확인
   - 할당 버튼에 CLIENT 사용자 수만 표시됨

### 3. 역할 할당 테스트 (양방향 검증)

```bash
# CLIENT 역할 사용자가 "삼성전자" 고객사에 할당된 상태에서
# ADMIN 역할을 부여하려는 경우 (실패해야 함)
curl -X POST http://localhost:3000/api/users/{user-id}/roles \
  -H "Content-Type: application/json" \
  -d '{"roleIds": ["admin-role-id"]}'

# 응답 예시:
{
  "error": "시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다",
  "details": "사용자는 현재 다음 고객사에 할당되어 있습니다: 삼성전자",
  "suggestion": "먼저 고객사 할당을 해제한 후 시스템 운영팀 역할을 부여하세요.",
  "systemRoles": "ADMIN",
  "assignedClients": [
    { "id": "...", "name": "삼성전자" }
  ]
}
```

**UI 테스트:**
1. 역할 할당 다이얼로그 오픈
2. 고객사 할당된 사용자에게 ADMIN/MANAGER/ENGINEER 역할 선택
3. "저장" 버튼 클릭
4. 상세한 오류 메시지 토스트 확인 (8초간 표시):
   - "역할 할당 제한" 제목
   - 할당된 고객사 목록
   - 해결 방법 제안

### 4. 데이터 정리 테스트

```bash
# Dry-run으로 확인
pnpm cleanup:system-team-clients:dry-run

# 출력 예시:
# ============================================================
# 시스템 운영팀 고객사 할당 정리 스크립트
# ============================================================
# 모드: DRY-RUN (실제 삭제 안함)
#
# 1️⃣  시스템 운영팀 사용자 조회 중...
#    ✓ 총 4명의 시스템 운영팀 사용자 발견
#
# ✅ 정리가 필요한 데이터가 없습니다.
```

## 향후 개선 사항

### 옵션 1: 역할 간 상호 배타성 강화
현재는 한 사용자가 ADMIN과 CLIENT 역할을 동시에 가질 수 있습니다. 이를 방지하기 위해 역할 할당 시 검증 로직을 추가할 수 있습니다.

### 옵션 2: 감사 로그 추가
고객사 할당 시도(성공/실패)를 감사 로그에 기록하여 추적 가능하게 할 수 있습니다.

### 옵션 3: 세션에 clientIds 추가
현재 세션에 `clientIds`가 포함되지 않습니다. CLIENT 사용자의 경우 세션에 포함시켜 클라이언트 사이드에서도 활용할 수 있도록 개선할 수 있습니다.

## 관련 파일

- [src/app/api/users/[id]/client/route.ts](../src/app/api/users/[id]/client/route.ts) - 고객사 할당 API
- [src/repositories/user.repository.ts](../src/repositories/user.repository.ts) - Repository 검증
- [src/app/(dashboard)/users/page.tsx](../src/app/(dashboard)/users/page.tsx) - UI 개선
- [scripts/cleanup-system-team-clients.ts](../scripts/cleanup-system-team-clients.ts) - 데이터 정리 스크립트
- [package.json](../package.json) - 스크립트 명령어
