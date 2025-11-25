# Phase 1 구현 완료 보고서

## 개요

**구현 일시:** 2025-11-25
**Phase:** 1 (즉시 해결 필요 - 치명적 모순)
**상태:** ✅ 완료

---

## 🎯 구현된 기능

### 1. SR 상태 전환 규칙 강화 ✅

#### 문제점
- `PATCH /api/srs/[id]`에서 State Machine 검증 없이 직접 상태 변경 가능
- `REQUESTED → IN_PROGRESS` 같은 잘못된 전환 허용
- 필수 필드 없이 상태 전환 가능

#### 해결 방안
**파일:** [src/services/sr.service.ts](../src/services/sr.service.ts#L141-L180)

```typescript
// 상태 전환 검증
if (validated.status && validated.status !== existingSR.status) {
  const { canTransition, getRequiredFields } = await import("@/lib/sr-state-machine");

  // 1. 전환 가능 여부 확인
  if (!canTransition(existingSR.status as any, validated.status as any)) {
    throw new Error(
      `${existingSR.status}에서 ${validated.status}(으)로 직접 전환할 수 없습니다.`
    );
  }

  // 2. 필수 필드 검증
  const requiredFields = getRequiredFields(validated.status as any);
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (field === 'assigneeId') {
      if (!validated.assigneeId && !validated.assignedToId && !existingSR.assigneeId) {
        missingFields.push('담당자(assigneeId)');
      }
    } else if (field === 'resolutionDescription') {
      if (!validated.resolutionDescription && !existingSR.resolutionDescription) {
        missingFields.push('해결 내용(resolutionDescription)');
      }
    } else if (field === 'rejectionReason') {
      if (!validated.rejectionReason && !existingSR.rejectionReason) {
        missingFields.push('거절 사유(rejectionReason)');
      }
    }
  }

  if (missingFields.length > 0) {
    throw new Error(
      `${validated.status} 상태로 전환하려면 다음 필드가 필요합니다: ${missingFields.join(', ')}`
    );
  }
}
```

#### 효과
- ✅ 잘못된 상태 전환 차단
- ✅ 필수 필드 누락 방지
- ✅ 명확한 에러 메시지 제공

---

### 2. 완료된 SR 담당자 변경 차단 ✅

#### 문제점
- `COMPLETED` 또는 `CONFIRMED` 상태의 SR 담당자 변경 가능
- 실제 작업자와 기록상 담당자 불일치
- 성과 측정 부정확

#### 해결 방안
**파일:** [src/services/sr.service.ts](../src/services/sr.service.ts#L182-L190)

```typescript
// 완료/확정 상태에서 담당자 변경 차단
const assigneeId = validated.assigneeId || validated.assignedToId;
if ((existingSR.status === 'COMPLETED' || existingSR.status === 'CONFIRMED') &&
    assigneeId !== undefined && assigneeId !== existingSR.assigneeId) {
  throw new Error(
    "완료되거나 확정된 SR의 담당자는 변경할 수 없습니다. " +
    "변경이 필요한 경우 SR을 다시 열어주세요."
  );
}
```

#### 효과
- ✅ 완료된 SR의 책임자 보호
- ✅ 감사 추적 정확성 향상
- ✅ 재오픈 프로세스 강제

---

### 3. SRPolicy 고객사 검증 강화 ✅

#### 문제점
- 요청자가 고객사 변경 후에도 SR 조회 가능
- CLIENT 사용자가 다른 고객사의 SR 접근 가능

#### 해결 방안

**3-1. 세션에 clientIds 추가**

**파일:** [src/auth.ts](../src/auth.ts#L106-L110)

```typescript
// JWT 토큰에 clientIds 추가
clients: {
  select: {
    clientId: true,
  },
},

// ...

token.clientIds = userWithRoles.clients.map((uc) => uc.clientId);
```

**파일:** [src/auth.ts](../src/auth.ts#L193)

```typescript
// 세션에 clientIds 주입
session.user.clientIds = (token.clientIds as string[]) || [];
```

**3-2. SRPolicy 검증 로직 개선**

**파일:** [src/lib/policies/sr.policy.ts](../src/lib/policies/sr.policy.ts#L15-L19)

```typescript
// 요청자는 본인이 속한 고객사의 SR만 조회 가능
const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;
const isRequester = sr.requesterId === user.id &&
  hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF) &&
  belongsToClient;
```

#### 효과
- ✅ 고객사 기반 접근 제어 강화
- ✅ 요청자의 다른 고객사 SR 조회 차단
- ✅ 데이터 격리 보장

---

## 📊 테스트 결과

### 1. 상태 전환 검증 테스트

```bash
# ❌ 잘못된 전환 (차단됨)
PATCH /api/srs/{id}
{ "status": "IN_PROGRESS" }  # REQUESTED 상태에서

# 응답: 400 Bad Request
{
  "error": "REQUESTED에서 IN_PROGRESS(으)로 직접 전환할 수 없습니다."
}

# ❌ 필수 필드 누락 (차단됨)
PATCH /api/srs/{id}
{ "status": "IN_PROGRESS" }  # assigneeId 없음

# 응답: 400 Bad Request
{
  "error": "IN_PROGRESS 상태로 전환하려면 다음 필드가 필요합니다: 담당자(assigneeId)"
}
```

### 2. 완료된 SR 담당자 변경 테스트

```bash
# ❌ 완료된 SR 담당자 변경 (차단됨)
PATCH /api/srs/{id}
{
  "assigneeId": "new-engineer-id"
}  # SR 상태: COMPLETED

# 응답: 400 Bad Request
{
  "error": "완료되거나 확정된 SR의 담당자는 변경할 수 없습니다. 변경이 필요한 경우 SR을 다시 열어주세요."
}
```

### 3. 고객사 검증 테스트

```bash
# 시나리오: USER A가 삼성전자 소속
# SR-001의 고객사가 LG전자로 변경됨
# USER A가 SR-001 조회 시도

GET /api/srs/SR-001

# 응답: 403 Forbidden
{
  "error": "SR 조회 권한이 없습니다."
}
```

---

## 🔧 변경된 파일

1. ✅ [src/services/sr.service.ts](../src/services/sr.service.ts)
   - 상태 전환 검증 추가
   - 필수 필드 검증 추가
   - 완료된 SR 담당자 변경 차단

2. ✅ [src/auth.ts](../src/auth.ts)
   - JWT 토큰에 clientIds 추가
   - 세션에 clientIds 주입

3. ✅ [src/lib/policies/sr.policy.ts](../src/lib/policies/sr.policy.ts)
   - canRead()에 고객사 검증 추가

---

## 📈 해결된 모순

### Before (Phase 1 이전)
| 모순 | 상태 |
|------|------|
| 상태 전환 규칙 위반 | 🔴 치명적 |
| 담당자 없이 IN_PROGRESS | 🟡 심각 |
| COMPLETED 후 담당자 변경 | 🟢 경미 |
| 요청자의 다른 고객사 SR 조회 | 🔴 치명적 |

### After (Phase 1 완료)
| 모순 | 상태 |
|------|------|
| 상태 전환 규칙 위반 | ✅ 해결 |
| 담당자 없이 IN_PROGRESS | ✅ 해결 |
| COMPLETED 후 담당자 변경 | ✅ 해결 |
| 요청자의 다른 고객사 SR 조회 | ✅ 해결 |

---

## 🎉 결과

- ✅ **치명적 모순 2건 완전 해결**
- ✅ **심각한 모순 1건 해결**
- ✅ **경미한 모순 1건 해결**
- ✅ **총 4건의 모순 해결**

---

## 📋 Next Steps (Phase 2)

1. 비활성 사용자의 SR 할당 처리
2. 비활성 고객사의 SR 생성 차단
3. 고객사 없는 CLIENT 역할 처리
4. CASCADE DELETE 설정
5. 다중 역할 충돌 해결

---

## 관련 문서

- [시스템 모순 분석 전체 문서](./system-contradictions-analysis.md)
- [고객사 할당 제한 정책](./client-assignment-restriction.md)
