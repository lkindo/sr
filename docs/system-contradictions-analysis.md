# SR 관리 시스템 모순 사례 분석

## 개요

SR 관리 시스템에서 발생할 수 있는 모든 데이터 및 로직 모순을 체계적으로 분석하고, 각 모순에 대한 해결 방안을 제시합니다.

**분석 일시:** 2025-11-25
**시스템 버전:** v0.1.0
**분석 범위:** 전체 프로세스 (사용자, 역할, 고객사, SR 생명주기)

---

## 📊 모순 분류 체계

### 🔴 치명적 (Critical)
시스템의 핵심 비즈니스 로직을 파괴하는 모순

### 🟡 심각 (Major)
데이터 무결성에 영향을 주는 모순

### 🟢 경미 (Minor)
사용자 경험에 혼란을 주는 모순

---

## 1. 사용자 & 역할 & 고객사 관계 모순

### 🔴 1.1 시스템 운영팀 + 고객사 할당 모순 **[해결됨 ✅]**

**모순 내용:**
- ADMIN/MANAGER/ENGINEER 역할을 가진 사용자가 특정 고객사에 할당됨
- 이들은 모든 고객사의 SR을 조회할 수 있는 권한이 있는데, 특정 고객사에만 할당되는 것은 논리적 모순

**발생 시나리오:**
```typescript
// 시나리오 A: 고객사 할당 → 시스템 역할 부여
1. 사용자가 CLIENT 역할로 "삼성전자"에 할당됨
2. 관리자가 해당 사용자에게 ADMIN 역할 부여
3. 결과: ADMIN + 삼성전자 할당 = 모순

// 시나리오 B: 시스템 역할 → 고객사 할당
1. 사용자가 ENGINEER 역할 보유
2. 관리자가 해당 사용자를 "LG전자"에 할당
3. 결과: ENGINEER + LG전자 할당 = 모순
```

**영향:**
- 권한 로직 혼란 (모든 SR 조회 vs 특정 고객사)
- UI/UX 모순 (ENGINEER가 "고객사 담당자"로 표시)
- SR 생성 시 고객사 자동 선택 오류

**해결 방안:** ✅ **구현 완료**
- API 레벨 양방향 검증 ([src/app/api/users/[id]/client/route.ts](../src/app/api/users/[id]/client/route.ts#L131-L154), [src/app/api/users/[id]/roles/route.ts](../src/app/api/users/[id]/roles/route.ts#L49-L84))
- Repository 레벨 검증 ([src/repositories/user.repository.ts](../src/repositories/user.repository.ts#L319-L358))
- UI 레벨 차단 및 경고 ([src/app/(dashboard)/users/page.tsx](../src/app/(dashboard)/users/page.tsx))

---

### 🟡 1.2 다중 역할 충돌 모순 **[미해결 ⚠️]**

**모순 내용:**
- 한 사용자가 CLIENT_ADMIN과 ENGINEER 역할을 동시에 가질 수 있음
- 역할 간 권한과 책임이 명확하게 분리되지 않음

**발생 시나리오:**
```typescript
1. 사용자가 CLIENT_ADMIN 역할 보유 (특정 고객사 관리자)
2. 동시에 ENGINEER 역할 부여 (시스템 운영팀)
3. 결과: 두 역할의 권한이 충돌
   - CLIENT_ADMIN: 본인 고객사만 조회 가능해야 함
   - ENGINEER: 모든 고객사 조회 가능
```

**영향:**
- 권한 판별 로직 복잡도 증가
- 사용자 본인도 자신의 권한 범위 파악 어려움
- 감사 로그 추적 시 혼란

**현재 동작:**
- 역할 우선순위: ADMIN > MANAGER > ENGINEER > CLIENT_ADMIN > CLIENT_USER
- 더 높은 권한이 우선 적용됨 (의도된 동작인지 불명확)

**해결 방안:**
1. **옵션 A: 역할 상호 배타성 강제** (권장)
   ```typescript
   const EXCLUSIVE_ROLE_GROUPS = [
     ['ADMIN', 'MANAGER', 'ENGINEER'],  // 시스템 운영팀
     ['CLIENT_ADMIN', 'CLIENT_USER']     // 고객사 팀
   ];

   // 역할 할당 시 검증
   if (다른 그룹의 역할이 이미 존재) {
     throw new Error("시스템 운영팀과 고객사 팀 역할을 동시에 가질 수 없습니다");
   }
   ```

2. **옵션 B: 명시적 우선순위 문서화**
   - 현재 동작 방식을 명확히 문서화
   - UI에서 사용자에게 주 역할 표시

---

### 🟡 1.3 비활성 사용자의 SR 할당 모순 **[미해결 ⚠️]**

**모순 내용:**
- `isActive: false` 상태의 사용자가 SR 담당자로 남아있음
- 비활성 사용자에게 새로운 SR이 할당될 수 있음

**발생 시나리오:**
```typescript
1. ENGINEER A가 SR-001의 담당자로 배정됨
2. ENGINEER A가 퇴사하여 isActive = false 처리됨
3. SR-001은 여전히 ENGINEER A에게 할당된 상태
4. 새로운 SR 접수 시 담당자 목록에 ENGINEER A가 포함됨
```

**영향:**
- 비활성 사용자에게 메일 발송 (실패 또는 불필요한 발송)
- SR 진행 불가능 (담당자가 시스템 접근 불가)
- 대시보드 통계 왜곡

**해결 방안:**
1. **사용자 비활성화 시 자동 재할당**
   ```typescript
   async deactivateUser(userId: string) {
     // 1. 진행 중인 SR 조회
     const activeSRs = await prisma.sR.findMany({
       where: {
         assigneeId: userId,
         status: { in: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD'] }
       }
     });

     // 2. 재할당 필요 알림 또는 자동 해제
     if (activeSRs.length > 0) {
       // 옵션 A: 오류 반환
       throw new Error(`${activeSRs.length}개의 진행 중인 SR이 있습니다. 먼저 재할당하세요.`);

       // 옵션 B: 자동 해제 (권장하지 않음)
       await prisma.sR.updateMany({
         where: { assigneeId: userId },
         data: { assigneeId: null }
       });
     }

     // 3. 사용자 비활성화
     await prisma.user.update({
       where: { id: userId },
       data: { isActive: false }
     });
   }
   ```

2. **담당자 선택 시 활성 사용자만 표시**
   ```typescript
   const activeUsers = await prisma.user.findMany({
     where: {
       isActive: true,
       roles: {
         some: {
           role: {
             name: { in: ['ENGINEER', 'MANAGER'] }
           }
         }
       }
     }
   });
   ```

---

## 2. SR 상태 전환 모순

### 🔴 2.1 상태 전환 규칙 위반 **[부분 해결 ✅]**

**모순 내용:**
- SR 상태 전환이 정의된 State Machine을 위반할 수 있음

**현재 State Machine:**
```typescript
const VALID_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
  REQUESTED: ["INTAKE", "REJECTED"],
  INTAKE: ["IN_PROGRESS", "ON_HOLD", "REJECTED"],
  IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
  ON_HOLD: ["IN_PROGRESS", "REJECTED"],
  COMPLETED: ["CONFIRMED", "IN_PROGRESS"],  // Reopen
  CONFIRMED: [],  // Terminal
  REJECTED: ["REQUESTED"],  // Re-request
};
```

**발생 가능한 모순:**
```typescript
// ❌ 잘못된 전환
REQUESTED → IN_PROGRESS (INTAKE를 거치지 않음)
INTAKE → COMPLETED (IN_PROGRESS를 거치지 않음)
COMPLETED → REQUESTED (비정상적인 역행)
```

**현재 보호 수준:**
- [src/lib/sr-state-machine.ts](../src/lib/sr-state-machine.ts): State Machine 정의 ✅
- [src/app/api/srs/[id]/intake/route.ts](../src/app/api/srs/[id]/intake/route.ts#L73-L75): INTAKE 전환 검증 ✅
- **일반 상태 변경 API 검증 누락** ❌

**해결 방안:**
```typescript
// src/app/api/srs/[id]/status/route.ts 개선 필요
import { canTransition } from '@/lib/sr-state-machine';

async updateStatus(srId: string, newStatus: SRStatus) {
  const sr = await prisma.sR.findUnique({ where: { id: srId } });

  // 상태 전환 검증
  if (!canTransition(sr.status, newStatus)) {
    throw new BadRequestError(
      `${sr.status}에서 ${newStatus}(으)로 직접 전환할 수 없습니다.`
    );
  }

  // 필수 필드 검증
  const requiredFields = getRequiredFields(newStatus);
  // ... 검증 로직
}
```

---

### 🟡 2.2 담당자 없이 IN_PROGRESS 전환 **[미해결 ⚠️]**

**모순 내용:**
- IN_PROGRESS 상태로 전환하려면 담당자(assigneeId)가 필수
- 하지만 API에서 이를 강제하지 않을 수 있음

**발생 시나리오:**
```typescript
// State Machine 규칙
REQUIRED_FIELDS = {
  IN_PROGRESS: ["assigneeId"],
  COMPLETED: ["resolutionDescription"],
  REJECTED: ["rejectionReason"],
};

// 하지만 직접 업데이트 시 검증 누락 가능
await prisma.sR.update({
  where: { id },
  data: {
    status: 'IN_PROGRESS',
    // assigneeId 누락!
  }
});
```

**영향:**
- 담당자 없는 SR이 진행 중 상태로 표시됨
- 알림 발송 실패
- 대시보드에서 "담당자: 미배정" 표시

**해결 방안:**
```typescript
// SR 업데이트 API에서 검증 추가
if (newStatus === 'IN_PROGRESS' && !sr.assigneeId && !updateData.assigneeId) {
  throw new BadRequestError(
    "IN_PROGRESS 상태로 전환하려면 담당자를 먼저 배정해야 합니다."
  );
}
```

---

### 🟢 2.3 COMPLETED 후 담당자 변경 **[미해결 ⚠️]**

**모순 내용:**
- SR이 COMPLETED 상태인데 담당자가 변경될 수 있음
- 완료된 작업의 책임자가 불명확해짐

**발생 시나리오:**
```typescript
1. SR-001이 ENGINEER A에 의해 COMPLETED 처리됨
2. MANAGER B가 SR-001의 담당자를 ENGINEER C로 변경
3. 결과: 실제 작업자(A)와 기록상 담당자(C) 불일치
```

**영향:**
- 성과 측정 부정확
- 책임 소재 불명확
- 감사 추적 혼란

**해결 방안:**
```typescript
// 완료/확정 상태에서는 담당자 변경 차단
if ((sr.status === 'COMPLETED' || sr.status === 'CONFIRMED') &&
    assigneeId !== sr.assigneeId) {
  throw new BadRequestError(
    "완료된 SR의 담당자는 변경할 수 없습니다. " +
    "변경이 필요한 경우 SR을 다시 열어주세요."
  );
}
```

---

## 3. 권한 및 접근 제어 모순

### 🔴 3.1 요청자의 다른 고객사 SR 조회 **[부분 해결 ✅]**

**모순 내용:**
- CLIENT_USER가 자신이 생성한 SR은 조회 가능 (정상)
- 하지만 고객사가 변경된 경우의 처리가 불명확

**발생 시나리오:**
```typescript
1. USER A가 "삼성전자"에 소속되어 SR-001 생성
2. ADMIN이 SR-001의 고객사를 "LG전자"로 변경 (오류 수정)
3. USER A는 더 이상 SR-001을 조회할 수 있어야 하나?
```

**현재 SRPolicy 로직:**
```typescript
canRead(user: AuthenticatedUser, sr: SR): boolean {
  const isAdmin = user.roles.includes("ADMIN");
  const isRequester = sr.requesterId === user.id &&
    hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF);
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.SR.READ);
  return isAdmin || canViewAll || isRequester;
}
```

**분석:**
- `isRequester`는 고객사와 무관하게 요청자이면 조회 가능 ✅
- 하지만 SR 목록 필터링에서는 고객사 기준으로 필터링됨 ❌

**해결 방안:**
```typescript
// 옵션 A: 요청자는 항상 조회 가능 (현재 방식)
// 장점: 사용자가 본인이 만든 SR을 항상 추적 가능
// 단점: 고객사 변경 시 다른 고객사의 SR을 볼 수 있음

// 옵션 B: 고객사 기준 강제
canRead(user: AuthenticatedUser, sr: SR): boolean {
  const isAdmin = user.roles.includes("ADMIN");
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.SR.READ);

  // 고객사 일치 여부 확인
  const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;
  const isRequester = sr.requesterId === user.id && belongsToClient;

  return isAdmin || canViewAll || isRequester;
}
```

---

### 🟡 3.2 고객사 없는 사용자의 SR 생성 **[미해결 ⚠️]**

**모순 내용:**
- CLIENT 역할 사용자가 고객사에 할당되지 않은 경우
- SR 생성 시 clientId를 어떻게 결정하나?

**발생 시나리오:**
```typescript
1. USER A가 CLIENT_USER 역할 보유
2. 하지만 UserClient 테이블에 레코드 없음 (할당되지 않음)
3. USER A가 SR 생성 시도
4. clientId를 어디서 가져오나?
```

**현재 동작:**
- [src/components/srs/CreateSRDialog.tsx:79-82](../src/components/srs/CreateSRDialog.tsx#L79-L82)
- 첫 번째 할당된 고객사를 자동 선택
- **고객사가 없으면?** → UI에서 고객사 선택 필수

**문제점:**
- CLIENT 역할인데 고객사 없는 상태 자체가 모순
- 이런 사용자는 SR을 생성할 수 없어야 함

**해결 방안:**
1. **예방: 역할 할당 시 검증**
   ```typescript
   // CLIENT 역할 부여 시 고객사 필수
   if (roleNames.includes('CLIENT_ADMIN') || roleNames.includes('CLIENT_USER')) {
     if (!user.clients || user.clients.length === 0) {
       throw new Error(
         "CLIENT 역할은 고객사가 할당된 사용자에게만 부여할 수 있습니다."
       );
     }
   }
   ```

2. **탐지: SR 생성 시 검증**
   ```typescript
   async createSR(data, user) {
     if (user.roles.includes('CLIENT_ADMIN') || user.roles.includes('CLIENT_USER')) {
       const userClients = await prisma.userClient.findMany({
         where: { userId: user.id }
       });

       if (userClients.length === 0) {
         throw new Error(
           "고객사가 할당되지 않았습니다. 관리자에게 문의하세요."
         );
       }
     }
   }
   ```

---

## 4. 고객사 관리 모순

### 🟡 4.1 비활성 고객사의 SR 생성 **[미해결 ⚠️]**

**모순 내용:**
- `client.isActive = false`인 고객사에 SR을 생성할 수 있음
- 계약 종료된 고객사에 새로운 SR이 접수됨

**발생 시나리오:**
```typescript
1. "삼성전자" 고객사의 계약이 종료됨 (isActive = false)
2. USER A(삼성전자 소속)가 여전히 isActive = true
3. USER A가 SR을 생성 시도
4. 비활성 고객사에 SR이 생성됨
```

**영향:**
- 계약 종료 고객에게 서비스 제공
- SLA 계산 오류
- 과금 문제

**해결 방안:**
```typescript
async createSR(data, user) {
  const client = await prisma.client.findUnique({
    where: { id: data.clientId },
    select: { isActive: true, contractEndDate: true }
  });

  if (!client.isActive) {
    throw new BadRequestError(
      "비활성 고객사에는 SR을 생성할 수 없습니다. 관리자에게 문의하세요."
    );
  }

  if (client.contractEndDate && client.contractEndDate < new Date()) {
    throw new BadRequestError(
      "계약이 종료된 고객사입니다. 계약 갱신 후 SR을 생성하세요."
    );
  }
}
```

---

### 🟢 4.2 고객사 변경 시 UserClient 불일치 **[미해결 ⚠️]**

**모순 내용:**
- SR의 고객사를 변경해도 관련 사용자의 UserClient는 변경되지 않음
- 요청자가 원래 소속되지 않은 고객사의 SR을 보유하게 됨

**발생 시나리오:**
```typescript
1. USER A(삼성전자 소속)가 SR-001 생성
2. ADMIN이 SR-001의 clientId를 "LG전자"로 변경 (잘못 입력 수정)
3. USER A는 여전히 삼성전자에만 소속
4. SR-001은 LG전자 SR이지만 삼성전자 사용자가 생성함
```

**영향:**
- 고객사별 통계 부정확
- 사용자의 "내 SR" 목록에서 다른 고객사 SR 표시

**해결 방안:**
```typescript
// 옵션 A: 고객사 변경 차단
if (sr.status !== 'REQUESTED' && data.clientId !== sr.clientId) {
  throw new BadRequestError(
    "접수된 SR의 고객사는 변경할 수 없습니다."
  );
}

// 옵션 B: 고객사 변경 시 요청자 확인
if (data.clientId !== sr.clientId) {
  const requesterBelongsToNewClient = await prisma.userClient.findFirst({
    where: {
      userId: sr.requesterId,
      clientId: data.clientId
    }
  });

  if (!requesterBelongsToNewClient) {
    throw new BadRequestError(
      "요청자가 새 고객사에 속하지 않습니다. " +
      "고객사를 변경하려면 요청자도 함께 변경하세요."
    );
  }
}
```

---

## 5. 데이터 무결성 모순

### 🟡 5.1 CASCADE DELETE 누락 **[확인 필요 ⚠️]**

**모순 내용:**
- 고객사 삭제 시 관련 SR이 남아있을 수 있음
- 참조 무결성 위반 가능

**Prisma Schema 확인:**
```prisma
model SR {
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  // onDelete 설정 없음!
}
```

**해결 방안:**
```prisma
model SR {
  clientId String
  client   Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // Restrict: 고객사에 SR이 있으면 삭제 불가
}
```

---

### 🟢 5.2 중복 SR 번호 생성 경쟁 조건 **[부분 해결 ✅]**

**모순 내용:**
- 동시에 여러 SR 생성 시 동일한 srNumber가 생성될 수 있음

**현재 보호:**
- [src/services/sr.service.ts:49-98](../src/services/sr.service.ts#L49-L98)
- 재시도 로직 구현 ✅
- 최대 10회 재시도 ✅

**개선 방안:**
- 데이터베이스 레벨 시퀀스 사용 (추천)
- 또는 Redis INCR 사용

---

## 요약 및 우선순위

### ✅ 해결 완료 (2건)
1. 시스템 운영팀 + 고객사 할당 모순
2. SR 상태 전환 규칙 (부분)

### 🔴 치명적 - 즉시 해결 필요 (2건)
1. 상태 전환 규칙 위반 (일반 업데이트 API)
2. 요청자의 다른 고객사 SR 조회

### 🟡 심각 - 단기 해결 필요 (7건)
1. 다중 역할 충돌
2. 비활성 사용자의 SR 할당
3. 담당자 없이 IN_PROGRESS 전환
4. 고객사 없는 사용자의 SR 생성
5. 비활성 고객사의 SR 생성
6. CASCADE DELETE 누락
7. 중복 SR 번호 생성

### 🟢 경미 - 중장기 개선 (3건)
1. COMPLETED 후 담당자 변경
2. 고객사 변경 시 UserClient 불일치
3. UI/UX 개선 사항

---

## 권장 조치 순서

1. **Phase 1 (즉시)**: 상태 전환 검증 강화
2. **Phase 2 (1주)**: 비활성 사용자/고객사 처리
3. **Phase 3 (2주)**: 역할 충돌 해결
4. **Phase 4 (1개월)**: 데이터 무결성 강화

---

## 관련 파일

- **Policy**: [src/lib/policies/sr.policy.ts](../src/lib/policies/sr.policy.ts)
- **Service**: [src/services/sr.service.ts](../src/services/sr.service.ts)
- **State Machine**: [src/lib/sr-state-machine.ts](../src/lib/sr-state-machine.ts)
- **Schema**: [prisma/schema.prisma](../prisma/schema.prisma)
- **이전 해결**: [docs/client-assignment-restriction.md](./client-assignment-restriction.md)
