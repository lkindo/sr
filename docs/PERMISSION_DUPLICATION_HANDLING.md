# 권한 중복 부여 처리 방식

## 📋 현재 시스템의 권한 중복 처리 방식

### 🔍 핵심 원리: **중복 제거 (Deduplication)**

현재 시스템은 한 사용자가 여러 역할을 가질 수 있으며, 여러 역할에 동일한 권한이 있을 경우 **자동으로 중복을 제거**하여 하나의 권한만 유지합니다.

---

## 🔧 구현 세부사항

### 1. **JWT/Session 처리** (`src/auth.ts`)

```typescript
// permissions 배열 생성 (중복 제거)
const permissionsSet = new Set<string>();
userWithRoles.roles.forEach((ur) => {
  ur.role.permissions.forEach((rp) => {
    const permission = `${rp.permission.resource}.${rp.permission.action}`;
    permissionsSet.add(permission);  // Set은 자동으로 중복 제거
  });
});
token.permissions = Array.from(permissionsSet);
```

**처리 방식**:
- `Set<string>`을 사용하여 중복 제거
- 권한은 `"resource.action"` 형식의 문자열로 저장 (예: `"SR.CREATE"`)
- 같은 권한이 여러 역할에 있어도 Set에 한 번만 추가됨

**결과**: 
- ✅ 중복 권한은 자동으로 제거되어 하나만 유지
- ✅ 사용자는 최종적으로 고유한 권한 목록만 가지게 됨

---

### 2. **권한 체크 로직** (`src/lib/permissions.ts`)

```typescript
export async function hasPermission(
  userId: string,
  resource: string,
  action: string
): Promise<boolean> {
  // 사용자의 모든 역할에서 권한 확인
  for (const userRole of userWithPermissions.roles) {
    for (const rolePermission of userRole.role.permissions) {
      const permission = rolePermission.permission;
      if (permission.resource === resource && permission.action === action) {
        return true;  // 하나라도 있으면 즉시 true 반환
      }
    }
  }
  return false;
}
```

**처리 방식**:
- 모든 역할을 순회하며 권한을 확인
- 하나의 역할이라도 해당 권한을 가지고 있으면 `true` 반환 (OR 로직)
- 여러 역할에 같은 권한이 있어도 첫 번째로 찾은 권한에서 즉시 반환

**결과**:
- ✅ 여러 역할에 같은 권한이 있어도 정상적으로 권한 체크 통과
- ✅ 중복 권한이 있어도 성능에 영향 없음 (조기 반환)

---

### 3. **권한 목록 조회** (`src/lib/permissions.ts`)

```typescript
export async function getUserPermissions(userId: string) {
  const permissions: Array<{ resource: string; action: string }> = [];
  const seen = new Set<string>();

  for (const userRole of userWithPermissions.roles) {
    for (const rolePermission of userRole.role.permissions) {
      const permission = rolePermission.permission;
      const key = `${permission.resource}.${permission.action}`;
      
      if (!seen.has(key)) {  // 중복 체크
        seen.add(key);
        permissions.push({
          resource: permission.resource,
          action: permission.action,
        });
      }
    }
  }

  return permissions;
}
```

**처리 방식**:
- `Set<string>`을 사용하여 이미 본 권한 추적
- `"resource.action"` 형식의 키로 중복 체크
- 중복되지 않은 권한만 배열에 추가

**결과**:
- ✅ 사용자는 고유한 권한 목록만 받게 됨
- ✅ 중복 권한은 자동으로 제거됨

---

### 4. **PermissionService** (`src/services/permission.service.ts`)

```typescript
async getUserPermissions(userId: string): Promise<Permission[]> {
  const permissionsSet = new Map<string, Permission>();
  user.roles.forEach(ur => {
    ur.role.permissions.forEach(rp => {
      permissionsSet.set(rp.permission.id, rp.permission);  // ID 기준 중복 제거
    });
  });
  return Array.from(permissionsSet.values());
}
```

**처리 방식**:
- `Map<string, Permission>`을 사용하여 권한 ID 기준으로 중복 제거
- 같은 권한 ID가 여러 역할에 있어도 Map에 한 번만 저장

**결과**:
- ✅ 권한 객체는 ID 기준으로 중복 제거됨
- ✅ 최종적으로 고유한 권한 객체만 반환

---

## 📊 예시 시나리오

### 시나리오: 사용자가 여러 역할을 가진 경우

**사용자**: 홍길동
- **역할 1**: MANAGER
  - 권한: `SR.CREATE`, `SR.READ`, `SR.UPDATE`, `USER.READ`
- **역할 2**: ENGINEER
  - 권한: `SR.READ`, `SR.UPDATE`, `SR.STATUS_CHANGE`, `COMMENT.CREATE`

**중복 권한**:
- `SR.READ`: MANAGER와 ENGINEER 둘 다 가짐
- `SR.UPDATE`: MANAGER와 ENGINEER 둘 다 가짐

**최종 적용 결과**:
```typescript
// 중복 제거 후 최종 권한 목록
[
  "SR.CREATE",        // MANAGER에서만
  "SR.READ",          // 중복 제거됨 (하나만 유지)
  "SR.UPDATE",        // 중복 제거됨 (하나만 유지)
  "SR.STATUS_CHANGE", // ENGINEER에서만
  "USER.READ",        // MANAGER에서만
  "COMMENT.CREATE"    // ENGINEER에서만
]
```

**권한 체크 결과**:
- `hasPermission(userId, "SR", "READ")` → ✅ `true` (하나의 역할에만 있어도 통과)
- `hasPermission(userId, "SR", "UPDATE")` → ✅ `true` (여러 역할에 있어도 통과)
- `hasPermission(userId, "SR", "DELETE")` → ❌ `false` (어떤 역할에도 없음)

---

## ✅ 결론

### 현재 시스템의 권한 중복 처리 방식

1. **중복 제거**: 여러 역할에 같은 권한이 있어도 자동으로 중복 제거되어 하나만 유지
2. **OR 로직**: 권한 체크 시 하나의 역할이라도 권한을 가지고 있으면 통과
3. **성능 최적화**: Set/Map을 사용하여 효율적인 중복 제거
4. **일관성**: 모든 권한 처리 로직에서 동일한 방식으로 중복 제거

### 장점

- ✅ **명확성**: 사용자는 최종적으로 고유한 권한 목록만 가지게 됨
- ✅ **성능**: 중복 권한이 있어도 성능에 영향 없음
- ✅ **안정성**: 권한 체크 로직이 단순하고 예측 가능함
- ✅ **유지보수**: 중복 권한 관리가 자동으로 처리됨

### 주의사항

- ⚠️ **역할 제거 시**: 한 역할에서 권한을 제거해도 다른 역할에 같은 권한이 있으면 계속 유지됨
- ⚠️ **권한 수정 시**: 한 역할의 권한을 수정해도 다른 역할의 권한에는 영향 없음
- ⚠️ **최소 권한 원칙**: 여러 역할에 같은 권한이 있어도 실제로는 하나만 적용되므로, 역할 구조를 단순하게 유지하는 것이 좋음

---

## 🔄 권장 사항

### 1. **역할 구조 최적화**
- 역할 간 권한 중복을 최소화
- 각 역할은 명확한 책임과 권한을 가지도록 설계

### 2. **권한 모니터링**
- 정기적으로 사용자의 실제 권한 목록을 확인
- 불필요한 중복 권한이 있는지 점검

### 3. **문서화**
- 각 역할의 권한을 명확히 문서화
- 권한 중복이 의도적인지 확인

