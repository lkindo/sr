# 🔍 최종 디버깅 테스트 가이드

**생성일**: 2024-11-08  
**상태**: 완전한 로깅 추가 완료 ✅

---

## ✅ 완료된 작업

### 1. **Prisma 쿼리 검증** ✅
```
✅ 직접 테스트: 모든 쿼리 정상 작동
✅ 데이터: Client 2개, ServiceCategory 5개
```

### 2. **서버 API 로깅** ✅
```typescript
// src/app/api/srs/route.ts
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ✅ admin@example.com
🔍 [GET /api/srs] Prisma 쿼리 실행 중...
🔍 [GET /api/srs] 쿼리 성공! SR 개수: 0
🔍 [GET /api/srs] 200 응답 반환
```

### 3. **클라이언트 로깅** ✅
```typescript
// src/app/(dashboard)/srs/page.tsx
🔍 [Client] fetchSRs 시작
🔍 [Client] fetch /api/srs 호출 중...
🔍 [Client] 응답 받음: { status: 200, ok: true }
🔍 [Client] 데이터 받음: { count: 0 }
✅ [Client] SR 목록 로드 성공!

// src/components/srs/CreateSRDialog.tsx
🔍 [CreateSR] SR 생성 시작
🔍 [CreateSR] 요청 데이터: { title: "...", ... }
🔍 [CreateSR] POST /api/srs 호출 중...
🔍 [CreateSR] 응답 받음: { status: 201, ok: true }
✅ [CreateSR] SR 생성 성공!
```

### 4. **개발 서버** ✅
```
✅ http://localhost:3000 실행 중
```

---

## 🧪 테스트 시작!

### Step 1: 브라우저 개발자 도구 열기

1. **브라우저에서 F12 누르기**
2. **Console 탭 선택**
3. **Console 초기화** (Clear console)

---

### Step 2: 로그인 및 SR 관리 접속

#### 1. http://localhost:3000 접속

#### 2. 로그인
```
이메일: admin@example.com
비밀번호: admin123
```

#### 3. "SR 관리" 클릭

---

### Step 3: 브라우저 콘솔 로그 확인

#### ✅ 정상 시나리오:

**브라우저 콘솔:**
```
🔍 [Client] fetchSRs 시작
🔍 [Client] fetch /api/srs 호출 중...
🔍 [Client] 응답 받음: {status: 200, statusText: "OK", ok: true}
🔍 [Client] 데이터 받음: {count: 0}
✅ [Client] SR 목록 로드 성공!
```

**화면:**
- SR 관리 페이지 로드 완료
- 빈 테이블 표시: "등록된 SR이 없습니다"
- "새 SR 생성" 버튼 표시

---

#### ❌ 에러 시나리오:

**브라우저 콘솔:**
```
🔍 [Client] fetchSRs 시작
🔍 [Client] fetch /api/srs 호출 중...
🔍 [Client] 응답 받음: {status: 500, statusText: "Internal Server Error", ok: false}
❌ [Client] API 에러 응답: {error: "...", details: "..."}
❌ [Client] fetchSRs 에러: Error: ...
```

**화면:**
- Toast 메시지: "SR 목록을 불러오는데 실패했습니다: [에러 메시지]"

**👉 이 에러 메시지를 복사해주세요!**

---

### Step 4: SR 생성 테스트

#### 1. "새 SR 생성" 버튼 클릭

#### 2. 양식 작성
```
고객사: TEST001 (테스트 고객사 A)
서비스 카테고리: 기술 지원
제목: 테스트 SR 제목입니다
설명: 이것은 테스트 SR의 상세 설명입니다.
우선순위: 보통
```

#### 3. "생성" 버튼 클릭

#### 4. 브라우저 콘솔 확인

**✅ 정상 시나리오:**
```
🔍 [CreateSR] SR 생성 시작
🔍 [CreateSR] 요청 데이터: {
  title: "테스트 SR 제목입니다",
  description: "이것은 테스트 SR의 상세 설명입니다.",
  clientId: "...",
  serviceCategoryId: "...",
  priority: "MEDIUM"
}
🔍 [CreateSR] POST /api/srs 호출 중...
🔍 [CreateSR] 응답 받음: {status: 201, statusText: "Created", ok: true}
✅ [CreateSR] SR 생성 성공! {id: "...", srNumber: "SR-20241108-0001", ...}
```

**화면:**
- Toast 메시지: "SR이 생성되었습니다"
- 대화상자 닫힘
- SR 목록 새로고침
- 새로 생성된 SR이 목록에 표시됨

---

**❌ 에러 시나리오:**
```
🔍 [CreateSR] SR 생성 시작
🔍 [CreateSR] 요청 데이터: {...}
🔍 [CreateSR] POST /api/srs 호출 중...
🔍 [CreateSR] 응답 받음: {status: 500, statusText: "Internal Server Error", ok: false}
❌ [CreateSR] API 에러 응답: {error: "...", details: "..."}
❌ [CreateSR] SR 생성 실패: Error: ...
```

**화면:**
- Toast 메시지: "오류: [에러 메시지]"

**👉 이 에러 메시지를 복사해주세요!**

---

## 🔍 서버 로그 확인 (선택적)

### PowerShell 창에서 서버 로그 확인

**정상 흐름:**
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ✅ admin@example.com
🔍 [GET /api/srs] Prisma 쿼리 실행 중... {}
prisma:query SELECT ... FROM "public"."srs" ...
🔍 [GET /api/srs] 쿼리 성공! SR 개수: 0
🔍 [GET /api/srs] 200 응답 반환
```

**에러 흐름:**
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
❌ Error fetching SRs: [에러 타입]
❌ Error details: [에러 메시지]
❌ Error stack: [스택 트레이스]
```

---

## 📊 로그 분석 가이드

### 1. 세션 문제 (401 Unauthorized)

**브라우저 콘솔:**
```
🔍 [Client] 응답 받음: {status: 401, ...}
❌ [Client] API 에러 응답: {error: "Unauthorized"}
```

**원인**: 로그인 안 됨 또는 세션 만료

**해결**:
- 다시 로그인
- 브라우저 쿠키 확인 (F12 → Application → Cookies)
- NextAuth 설정 확인

---

### 2. Prisma 에러 (500 Internal Server Error)

**서버 로그:**
```
🔍 [GET /api/srs] Prisma 쿼리 실행 중...
❌ Error: PrismaClientKnownRequestError
❌ Error details: Foreign key constraint failed
```

**브라우저 콘솔:**
```
❌ [Client] API 에러 응답: {
  error: "SR 목록을 불러오는 중 오류가 발생했습니다.",
  details: "Foreign key constraint failed"
}
```

**원인**: 
- ServiceCategory 데이터 없음
- 관계 필드 문제

**해결**:
```bash
npx prisma db seed
```

---

### 3. serviceCategoryId가 빈 문자열 (SR 생성 시)

**브라우저 콘솔:**
```
🔍 [CreateSR] 요청 데이터: {
  serviceCategoryId: "",  // ❌ 빈 문자열
  ...
}
```

**서버 로그:**
```
🔍 [POST /api/srs] SR 생성 중... { serviceCategoryId: "" }
❌ Error: Foreign key constraint failed
```

**원인**: 프론트엔드에서 카테고리 선택 안 함

**해결**: 카테고리 필수 선택 확인

---

### 4. NextAuth 에러

**서버 로그:**
```
🔍 [GET /api/srs] auth() 호출 중...
❌ Error: Cannot read property 'user' of undefined
```

**원인**: NextAuth 설정 문제 또는 환경 변수 누락

**해결**:
```bash
# .env 파일 확인
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
```

---

## 📋 에러 체크리스트

테스트 중 에러 발생 시 다음 정보를 수집하세요:

### 브라우저 정보
- [ ] 브라우저 콘솔의 모든 🔍 로그
- [ ] 브라우저 콘솔의 모든 ❌ 에러
- [ ] Network 탭의 srs 요청 (Request/Response)
- [ ] Toast 메시지 내용

### 서버 정보 (선택적)
- [ ] PowerShell 창의 서버 로그
- [ ] 🔍 로그 전체
- [ ] ❌ 에러 메시지 전체
- [ ] Prisma 쿼리 로그

---

## 🎯 예상 결과

### ✅ 모든 테스트 통과 시:

1. **SR 관리 페이지**
   - ✅ 페이지 로드 성공
   - ✅ 빈 테이블 표시
   - ✅ 500 에러 없음

2. **SR 생성**
   - ✅ 대화상자 열림
   - ✅ 카테고리 목록 표시
   - ✅ SR 생성 성공
   - ✅ 목록에 새 SR 표시

3. **브라우저 콘솔**
   - ✅ 모든 🔍 로그 표시
   - ✅ ✅ 성공 로그 표시
   - ❌ 에러 없음

---

### ❌ 에러 발생 시:

**다음 정보를 공유해주세요:**

#### 1. 브라우저 콘솔 (전체 복사)
```
(F12 → Console → 모든 로그 복사)
```

#### 2. 에러 메시지
```
(Toast 메시지 또는 콘솔의 ❌ 메시지)
```

#### 3. 서버 로그 (있다면)
```
(PowerShell 창의 에러 로그)
```

#### 4. 상황 설명
```
- 어떤 동작을 했을 때 에러가 발생했나요?
- SR 관리 클릭? SR 생성 클릭?
- 에러가 반복적으로 발생하나요?
```

---

## 💡 빠른 해결 방법

### 방법 1: 캐시 초기화
```
1. Ctrl + Shift + R (강력 새로고침)
2. F12 → Network → Disable cache 체크
3. 페이지 새로고침
```

### 방법 2: 서버 재시작
```powershell
taskkill /F /IM node.exe
pnpm dev
```

### 방법 3: Prisma Client 재생성
```bash
npx prisma generate
pnpm dev
```

### 방법 4: 데이터 재생성
```bash
npx prisma db seed
```

---

## 🚀 현재 상태

| 항목 | 상태 |
|------|------|
| Prisma 쿼리 | ✅ 정상 |
| 데이터베이스 | ✅ 정상 |
| 서버 로깅 | ✅ 추가됨 |
| 클라이언트 로깅 | ✅ 추가됨 |
| 개발 서버 | ✅ 실행 중 |
| 다음 단계 | 🔍 **브라우저 테스트!** |

---

## 📞 도움 요청 시 포함 사항

에러 발생 시 다음 정보를 모두 포함해주세요:

1. **브라우저 콘솔 전체 로그** (🔍와 ❌ 모두)
2. **에러 발생 시점** (SR 관리 클릭? SR 생성?)
3. **Toast 에러 메시지** (정확한 문구)
4. **Network 탭 정보** (F12 → Network → srs 요청)

---

**지금 바로 테스트를 시작하세요!** 🚀

**브라우저에서:**
1. F12 (개발자 도구)
2. Console 탭
3. http://localhost:3000 접속
4. 로그인 → SR 관리 클릭
5. 로그 확인!

**모든 로그가 문제의 정확한 원인을 알려줄 것입니다!** 🔍

