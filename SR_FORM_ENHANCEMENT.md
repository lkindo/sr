# 🎨 SR 생성 폼 개선 완료

**날짜**: 2024-11-08  
**상태**: ✅ 완료

---

## 📊 추가된 필드

| 필드명 | 영문명 | 타입 | 필수 여부 | 설명 |
|--------|--------|------|-----------|------|
| 담당자 | assigneeId | String | 선택 | SR 담당자 지정 |
| 마감일 | dueDate | Date | 선택 | SR 처리 마감일 |
| 요청 완료 날짜 | requestedCompletionDate | Date | 선택 | 요청자가 원하는 완료일 |

---

## 🎯 변경 사항

### 1. CreateSRDialog.tsx (프론트엔드)

#### 추가된 State
```typescript
const [dueDate, setDueDate] = useState("");
const [assigneeId, setAssigneeId] = useState("");
const [users, setUsers] = useState<User[]>([]);
```

#### 추가된 함수
```typescript
const fetchUsers = async () => {
  const response = await fetch("/api/users");
  const data = await response.json();
  setUsers(data);
};
```

#### 추가된 UI
```tsx
{/* 담당자 선택 */}
<Select
  value={assigneeId}
  onValueChange={setAssigneeId}
  disabled={loading}
>
  <SelectTrigger>
    <SelectValue placeholder="담당자 선택 (선택사항)" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">선택 안 함</SelectItem>
    {users.map((user) => (
      <SelectItem key={user.id} value={user.id}>
        {user.name} ({user.email})
      </SelectItem>
    ))}
  </SelectContent>
</Select>

{/* 마감일 입력 */}
<Input
  id="dueDate"
  type="date"
  value={dueDate}
  onChange={(e) => setDueDate(e.target.value)}
  disabled={loading}
/>
```

#### 업데이트된 Request Body
```typescript
const requestBody = {
  title,
  description,
  clientId,
  serviceCategoryId: categoryId,
  priority,
  requestedCompletionDate: requestedCompletionDate || undefined,
  dueDate: dueDate || undefined,          // 새로 추가
  assigneeId: assigneeId || undefined,    // 새로 추가
};
```

---

### 2. src/app/api/srs/route.ts (백엔드)

#### 업데이트된 Schema
```typescript
const srSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().min(1, "서비스 카테고리를 선택해주세요."),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
  dueDate: z.string().optional(),        // 새로 추가
  assigneeId: z.string().optional(),     // 새로 추가
});
```

#### 업데이트된 SR 생성
```typescript
const sr = await prisma.sR.create({
  data: {
    srNumber,
    title: validated.title,
    description: validated.description,
    clientId: validated.clientId,
    serviceCategoryId: validated.serviceCategoryId,
    requesterId: session.user.id,
    assigneeId: validated.assigneeId || undefined,  // 새로 추가
    priority: validated.priority,
    status: "REQUESTED",
    expectedCompletionDate: validated.requestedCompletionDate
      ? new Date(validated.requestedCompletionDate)
      : undefined,
    dueDate: validated.dueDate                      // 새로 추가
      ? new Date(validated.dueDate)
      : undefined,
  },
  include: {
    client: { select: { id: true, code: true, name: true } },
    serviceCategory: true,
    requester: { select: { id: true, name: true, email: true } },
    assignee: validated.assigneeId ? {              // 새로 추가
      select: { id: true, name: true, email: true }
    } : undefined,
  },
});
```

---

## 📋 SR 생성 폼 전체 필드

### 필수 필드 (*)
1. **제목** - 최소 5자
2. **설명** - 최소 10자
3. **고객사** - 드롭다운 선택
4. **서비스 카테고리** - 고객사 선택 후 활성화
5. **우선순위** - CRITICAL/HIGH/MEDIUM/LOW

### 선택 필드
6. **담당자** - 사용자 목록에서 선택
7. **요청 완료 날짜** - 요청자가 원하는 완료일
8. **마감일** - SR 처리 마감일

---

## 🎨 UI 레이아웃

```
┌─────────────────────────────────────────────┐
│  새 SR 생성                                  │
├─────────────────────────────────────────────┤
│  [제목 입력 *]                               │
│                                              │
│  [설명 입력 *]                               │
│  (5줄)                                       │
│                                              │
│  [고객사 *]        [서비스 카테고리 *]        │
│                                              │
│  [우선순위 *]      [담당자]                  │
│                                              │
│  [요청 완료 날짜]  [마감일]                  │
│                                              │
│  [취소]                    [생성]            │
└─────────────────────────────────────────────┘
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 최소 필드만 입력
```
1. 제목 입력 (필수)
2. 설명 입력 (필수)
3. 고객사 선택 (필수)
4. 서비스 카테고리 선택 (필수)
5. 우선순위 선택 (필수)
6. "생성" 버튼 클릭
7. ✅ SR 생성 성공
```

### 시나리오 2: 모든 필드 입력
```
1. 제목 입력
2. 설명 입력
3. 고객사 선택
4. 서비스 카테고리 선택
5. 우선순위 선택
6. 담당자 선택 ← 새로 추가
7. 요청 완료 날짜 입력
8. 마감일 입력 ← 새로 추가
9. "생성" 버튼 클릭
10. ✅ SR 생성 성공
11. ✅ 담당자 정보 저장됨
12. ✅ 마감일 저장됨
```

### 시나리오 3: 담당자 변경
```
1. 담당자 "선택 안 함" 선택
2. 다른 담당자 선택
3. "생성" 버튼 클릭
4. ✅ 선택한 담당자로 저장됨
```

---

## 📊 데이터베이스 매핑

| UI 필드 | DB 컬럼 | Prisma 필드명 |
|---------|---------|---------------|
| 제목 | title | title |
| 설명 | description | description |
| 고객사 | client_id | clientId |
| 서비스 카테고리 | service_category_id | serviceCategoryId |
| 우선순위 | priority | priority |
| 담당자 | assignee_id | assigneeId |
| 요청 완료 날짜 | expected_completion_date | expectedCompletionDate |
| 마감일 | due_date | dueDate |
| 요청자 | requester_id | requesterId (자동) |
| SR 번호 | sr_number | srNumber (자동) |
| 상태 | status | status (기본값: REQUESTED) |

---

## 🔄 자동 생성 필드

### 1. SR 번호 (srNumber)
```typescript
// 형식: SR-YYYYMMDD-XXXX
// 예: SR-20241108-0001
const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
const todayCount = await prisma.sR.count({ ... });
const srNumber = `SR-${dateStr}-${String(todayCount + 1).padStart(4, "0")}`;
```

### 2. 요청자 (requesterId)
```typescript
// 현재 로그인한 사용자 (임시로 admin 사용)
requesterId: session.user.id
```

### 3. 상태 (status)
```typescript
// 기본값: REQUESTED
status: "REQUESTED"
```

### 4. 요청일 (requestedAt)
```typescript
// 자동으로 현재 시간
requestedAt: DateTime @default(now())
```

---

## 💡 주요 개선 사항

### 1. 담당자 지정 기능
- SR 생성 시 바로 담당자 지정 가능
- 나중에 변경도 가능 (SR 수정)
- "선택 안 함" 옵션으로 미지정도 가능

### 2. 마감일 설정
- SR 처리 마감일 명시
- 요청 완료 날짜와 구분
- SLA 관리에 활용 가능

### 3. 사용자 친화적 UI
- 2열 그리드 레이아웃
- 명확한 필드 라벨
- 선택사항 표시
- 도움말 텍스트

---

## 🚀 향후 개선 가능 사항

### 1. 첨부파일 업로드
```
SR 생성 후 상세 페이지에서 첨부파일 추가
- 다중 파일 업로드
- 파일 크기 제한
- 파일 타입 제한
```

### 2. 자동 담당자 지정
```
서비스 카테고리별로 기본 담당자 자동 지정
- ServiceCategory에 defaultHandlerId 추가
- 고객사별 담당자 매핑
```

### 3. 마감일 자동 계산
```
SLA 설정에 따른 자동 마감일 계산
- 서비스 카테고리별 SLA 시간
- 업무일 기준 계산
- 휴일 제외
```

### 4. 템플릿 기능
```
자주 사용하는 SR을 템플릿으로 저장
- 제목/설명 템플릿
- 우선순위 프리셋
- 담당자 프리셋
```

---

## 📝 사용자 가이드

### SR 생성 방법

1. **SR 관리 페이지 접속**
   - 사이드바에서 "SR 관리" 클릭

2. **새 SR 생성 버튼 클릭**
   - "새 SR 생성" 버튼 클릭
   - 폼 다이얼로그 열림

3. **필수 정보 입력**
   - 제목: 명확하고 간결하게 (최소 5자)
   - 설명: 상세한 요청 내용 (최소 10자)
   - 고객사: 드롭다운에서 선택
   - 서비스 카테고리: 고객사 선택 후 활성화됨
   - 우선순위: 긴급도에 따라 선택

4. **선택 정보 입력 (필요시)**
   - 담당자: 처리할 담당자 선택
   - 요청 완료 날짜: 요청자가 원하는 완료일
   - 마감일: SR 처리 마감일

5. **생성 완료**
   - "생성" 버튼 클릭
   - 성공 메시지 확인
   - SR 목록에서 생성된 SR 확인

---

## ⚠️ 주의사항

### 1. 날짜 필드
- 과거 날짜도 선택 가능 (검증 없음)
- 마감일과 요청 완료 날짜의 순서 검증 없음
- 향후 개선 필요

### 2. 담당자 선택
- 현재는 모든 사용자 표시
- 실제로는 역할/권한에 따라 필터링 필요
- 고객사별 담당자 매핑 고려

### 3. 서비스 카테고리
- 고객사에 카테고리가 없으면 선택 불가
- 미리 서비스 카테고리 설정 필요

---

## 🎉 완료!

SR 생성 폼이 데이터베이스 스키마와 일치하도록 업데이트되었습니다.

### 테스트 방법
```
1. 브라우저에서 http://localhost:3000 접속
2. 로그인 (admin@example.com / admin123)
3. SR 관리 클릭
4. "새 SR 생성" 버튼 클릭
5. 폼에서 새로운 필드 확인:
   ✅ 담당자 선택 드롭다운
   ✅ 마감일 입력 필드
6. SR 생성 테스트
7. 생성된 SR 상세에서 데이터 확인
```

---

**최종 업데이트**: 2024-11-08  
**상태**: ✅ 완료  
**다음**: 브라우저에서 테스트 및 확인

