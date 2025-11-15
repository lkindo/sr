# SR 접수 화면 수정 처리 방안

## 📋 현재 구조 분석

### 현재 구현 상태

1. **접수 화면**: `src/app/(dashboard)/srs/[id]/intake/page.tsx`
   - 접수 모드 (`REQUESTED` 상태): 새로 접수 처리
   - 수정 모드 (`IN_PROGRESS` 상태): 기존 접수 정보 수정

2. **API 엔드포인트**:
   - `POST /api/srs/[id]/intake`: 접수 처리 (REQUESTED → IN_PROGRESS)
   - `GET /api/srs/[id]/intake`: 접수 정보 조회
   - `PATCH /api/srs/[id]`: 일반 SR 수정 (수정 모드에서 사용 중)

3. **현재 문제점**:
   - 수정 모드에서 일반 SR 수정 API를 사용하여 접수 정보 수정에 특화되지 않음
   - 접수 정보 수정 시 이력 추적이 명확하지 않음
   - 접수 정보 수정 시 SLA 재계산 로직이 분산되어 있음

---

## 🎯 권장 방안: 전용 접수 수정 API 추가

### 방안 1: PATCH 엔드포인트 추가 (권장) ⭐

**구조**:
```
POST /api/srs/[id]/intake     → 접수 처리
GET  /api/srs/[id]/intake     → 접수 정보 조회
PATCH /api/srs/[id]/intake    → 접수 정보 수정 (신규)
```

**장점**:
- ✅ 접수 정보 수정에 특화된 로직 구현 가능
- ✅ 접수 수정 이력 추적 명확
- ✅ SLA 재계산 로직 통합 관리
- ✅ 코드 가독성 및 유지보수성 향상
- ✅ 접수 관련 로직이 한 곳에 집중

**단점**:
- ⚠️ API 엔드포인트 하나 추가 필요

**구현 예시**:
```typescript
// src/app/api/srs/[id]/intake/route.ts
export const PATCH = withAuthAndRateLimit(async (request, { session, params }) => {
  const { id } = await params;
  const body = await request.json();
  const validated = intakeUpdateSchema.parse(body);

  // 1. SR 조회 및 상태 확인
  const sr = await prisma.sR.findUnique({
    where: { id },
    include: { serviceCategory: true }
  });

  if (!sr) throw new NotFoundError("SR을 찾을 수 없습니다");
  if (sr.status !== "IN_PROGRESS") {
    throw new BadRequestError("진행 중인 SR만 수정할 수 있습니다");
  }

  // 2. SLA 재계산 (우선순위 변경 시)
  let dueDate = sr.dueDate;
  if (validated.actualPriority && validated.actualPriority !== sr.actualPriority) {
    const priorityMultiplier = { CRITICAL: 0.5, HIGH: 0.75, MEDIUM: 1.0, LOW: 1.5 };
    const adjustedHours = sr.serviceCategory.slaHours * priorityMultiplier[validated.actualPriority];
    dueDate = new Date(sr.intakeAt || new Date());
    dueDate.setHours(dueDate.getHours() + adjustedHours);
  }

  // 3. SR 업데이트
  const updatedSR = await prisma.sR.update({
    where: { id },
    data: {
      actualPriority: validated.actualPriority,
      estimatedHours: validated.estimatedHours,
      estimatedCompletionDate: validated.estimatedCompletionDate,
      dueDate,
      intakeNotes: validated.intakeNotes,
      assignee: validated.assigneeId ? { connect: { id: validated.assigneeId } } : undefined,
    }
  });

  // 4. 수정 이력 생성
  await prisma.sRActivity.create({
    data: {
      srId: id,
      userId: session.user.id,
      type: "INTAKE_UPDATED",
      description: "접수 정보가 수정되었습니다",
      metadata: {
        previousValues: {
          actualPriority: sr.actualPriority,
          estimatedHours: sr.estimatedHours,
          assigneeId: sr.assigneeId,
        },
        newValues: {
          actualPriority: validated.actualPriority,
          estimatedHours: validated.estimatedHours,
          assigneeId: validated.assigneeId,
        }
      }
    }
  });

  return NextResponse.json({ success: true, sr: updatedSR });
}, { preset: 'strict' });
```

---

### 방안 2: 기존 PATCH 엔드포인트 개선

**구조**:
```
POST /api/srs/[id]/intake     → 접수 처리
GET  /api/srs/[id]/intake     → 접수 정보 조회
PATCH /api/srs/[id]           → SR 수정 (접수 정보 포함)
```

**장점**:
- ✅ 추가 엔드포인트 불필요
- ✅ 기존 구조 유지

**단점**:
- ⚠️ 접수 정보 수정 로직이 일반 SR 수정 로직과 혼재
- ⚠️ 접수 수정 이력 추적이 불명확
- ⚠️ 코드 복잡도 증가

---

### 방안 3: Server Action 사용

**구조**:
```
POST /api/srs/[id]/intake     → 접수 처리
GET  /api/srs/[id]/intake     → 접수 정보 조회
Server Action: updateIntakeAction() → 접수 정보 수정
```

**장점**:
- ✅ Next.js App Router 패턴 준수
- ✅ 타입 안정성 향상
- ✅ 클라이언트-서버 간 통신 간소화

**단점**:
- ⚠️ 기존 API 패턴과 불일치
- ⚠️ 일관성 유지 필요

---

## 📊 비교 분석

| 항목 | 방안 1 (PATCH 추가) | 방안 2 (기존 개선) | 방안 3 (Server Action) |
|------|-------------------|------------------|----------------------|
| **명확성** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **유지보수성** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **이력 추적** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **구현 복잡도** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **일관성** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **권장도** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 🎯 최종 권장 방안

### ✅ **방안 1: PATCH /api/srs/[id]/intake 엔드포인트 추가**

**이유**:
1. **명확한 책임 분리**: 접수 관련 로직이 한 곳에 집중
2. **이력 추적 명확**: 접수 수정 이력을 별도로 추적 가능
3. **유지보수 용이**: 접수 관련 변경 시 한 파일만 수정
4. **확장성**: 향후 접수 관련 기능 추가 시 확장 용이

**구현 단계**:
1. `PATCH /api/srs/[id]/intake` 엔드포인트 추가
2. 접수 수정 전용 스키마 정의 (`intakeUpdateSchema`)
3. 접수 수정 이력 추적 로직 추가
4. 클라이언트 코드에서 수정 모드 시 PATCH 엔드포인트 사용

---

## 🔧 구현 상세

### 1. 스키마 정의

```typescript
// src/lib/schemas.ts
export const intakeUpdateSchema = z.object({
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  estimatedHours: z.number().positive().max(1000).optional(),
  estimatedCompletionDate: z.string().optional(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1).optional(),
});
```

### 2. API 엔드포인트 구현

```typescript
// src/app/api/srs/[id]/intake/route.ts
export const PATCH = withAuthAndRateLimit(async (request, { session, params }) => {
  // ... 구현 내용 (위 예시 참조)
}, { preset: 'strict' });
```

### 3. 클라이언트 코드 수정

```typescript
// src/app/(dashboard)/srs/[id]/intake/page.tsx
const onSubmit = async (values: IntakeFormValues) => {
  // ...
  const url = isEditMode
    ? `/api/srs/${id}/intake`  // 수정: PATCH 엔드포인트 사용
    : `/api/srs/${id}/intake`;  // 접수: POST 엔드포인트 사용

  const method = isEditMode ? "PATCH" : "POST";
  // ...
};
```

---

## 📝 추가 고려사항

### 1. 권한 관리
- 접수 수정 권한: MANAGER, ADMIN만 허용
- 담당자 변경 시 알림 발송

### 2. 이력 추적
- 접수 수정 이력을 별도 Activity 타입으로 관리
- 변경 전/후 값 비교 및 기록

### 3. SLA 재계산
- 우선순위 변경 시 자동 재계산
- 예상 완료일 변경 시 마감일 재계산

### 4. 알림 발송
- 담당자 변경 시 새 담당자에게 알림
- 우선순위 변경 시 요청자에게 알림 (선택)

---

## 🎯 결론

**권장 방안**: **방안 1 (PATCH /api/srs/[id]/intake 엔드포인트 추가)**

이 방안이 가장 효과적인 이유:
1. ✅ 접수 관련 로직이 한 곳에 집중되어 유지보수 용이
2. ✅ 접수 수정 이력 추적이 명확
3. ✅ 코드 가독성 및 확장성 향상
4. ✅ RESTful API 패턴 준수

**구현 우선순위**:
1. PATCH 엔드포인트 추가
2. 접수 수정 이력 추적
3. SLA 재계산 로직 통합
4. 알림 발송 로직 추가


