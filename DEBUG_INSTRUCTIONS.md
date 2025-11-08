# 🔍 SR 관리 500 에러 디버깅 가이드

**생성일**: 2024-11-08  
**상태**: 디버깅 로그 추가 완료 ✅

---

## ✅ 완료된 작업

### 1. **Prisma 쿼리 검증** ✅
```bash
node test-api.mjs 실행 결과:
✅ Client: 2개
✅ ServiceCategory: 5개
✅ User: 8개
✅ SR 쿼리: 정상 작동
```

**결론**: Prisma와 데이터베이스는 100% 정상!

### 2. **API 라우트에 디버깅 로그 추가** ✅
```typescript
// GET /api/srs에 추가된 로그:
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ✅ admin@example.com
🔍 [GET /api/srs] Prisma 쿼리 실행 중...
🔍 [GET /api/srs] 쿼리 성공! SR 개수: 0
🔍 [GET /api/srs] 200 응답 반환

// POST /api/srs에도 동일하게 추가됨
```

### 3. **개발 서버 실행** ✅
```
✅ http://localhost:3000 실행 중
```

---

## 🧪 테스트 절차

### Step 1: 브라우저에서 로그인

1. **브라우저 열기**
   ```
   http://localhost:3000
   ```

2. **로그인**
   ```
   이메일: admin@example.com
   비밀번호: admin123
   ```

3. **"SR 관리" 클릭**
   - 왼쪽 사이드바에서 "SR 관리" 메뉴 클릭

---

### Step 2: 서버 로그 확인

#### 정상인 경우:
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ✅ admin@example.com
🔍 [GET /api/srs] Prisma 쿼리 실행 중... { where: {} }
🔍 [GET /api/srs] 쿼리 성공! SR 개수: 0
🔍 [GET /api/srs] 200 응답 반환
```

#### 에러가 발생하는 경우:
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
❌ Error: [에러 메시지]
❌ Error details: [상세 내용]
❌ Error stack: [스택 트레이스]
```

**👉 위 로그를 복사해주세요!**

---

### Step 3: SR 생성 테스트

1. **"새 SR 생성" 버튼 클릭**

2. **양식 작성**
   - 고객사: TEST001 또는 TEST002
   - 서비스 카테고리: (고객사 선택 후 표시됨)
   - 제목: "테스트 SR 제목" (최소 5자)
   - 설명: "테스트 설명입니다" (최소 10자)
   - 우선순위: 보통

3. **"생성" 버튼 클릭**

#### 서버 로그 확인 (정상):
```
🔍 [POST /api/srs] 요청 시작
🔍 [POST /api/srs] auth() 호출 중...
🔍 [POST /api/srs] 세션: ✅ admin@example.com
🔍 [POST /api/srs] 요청 바디: { title: "...", ... }
🔍 [POST /api/srs] 유효성 검사 통과
🔍 [POST /api/srs] SR 번호 생성: SR-20241108-0001
🔍 [POST /api/srs] SR 생성 중... { serviceCategoryId: "...", ... }
🔍 [POST /api/srs] SR 생성 성공! ID: ...
🔍 [POST /api/srs] Activity 로그 생성 중...
```

---

## 🐛 에러 시나리오별 해결

### 시나리오 1: auth() 호출 시 에러

**로그**:
```
🔍 [GET /api/srs] auth() 호출 중...
❌ Error: Cannot read property ...
```

**원인**: NextAuth 설정 문제

**해결**:
```bash
# auth.ts 파일 확인
# NEXTAUTH_SECRET 환경 변수 확인
```

---

### 시나리오 2: Prisma 쿼리 시 에러

**로그**:
```
🔍 [GET /api/srs] Prisma 쿼리 실행 중...
❌ PrismaClientKnownRequestError: ...
```

**원인**: 
- Foreign key constraint 문제
- 관계 필드 설정 문제

**해결**:
```bash
# Prisma Client 재생성
npx prisma generate

# 마이그레이션 확인
npx prisma migrate status
```

---

### 시나리오 3: serviceCategoryId가 빈 문자열

**로그**:
```
🔍 [POST /api/srs] 요청 바디: {
  "serviceCategoryId": "",  // ❌ 빈 문자열
  ...
}
❌ Error: Foreign key constraint failed
```

**원인**: 프론트엔드에서 빈 문자열 전송

**해결**:
```typescript
// CreateSRDialog.tsx 수정 필요
// serviceCategoryId 필드 검증 추가
```

---

### 시나리오 4: 세션이 없음 (401)

**로그**:
```
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ❌ 없음
🔍 [GET /api/srs] 401 반환
```

**원인**: 로그인 안 됨 또는 세션 만료

**해결**:
- 다시 로그인
- 브라우저 쿠키 확인

---

## 📊 현재 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| Prisma 쿼리 | ✅ 정상 | 직접 테스트 성공 |
| 데이터베이스 데이터 | ✅ 정상 | Client, Category 모두 존재 |
| Prisma Client | ✅ 정상 | prisma.sR 메서드 존재 |
| 개발 서버 | ✅ 실행 중 | HTTP 200 |
| 디버깅 로그 | ✅ 추가됨 | 모든 단계 로깅 |
| API 테스트 | 🔍 대기 중 | 브라우저 테스트 필요 |

---

## 🎯 다음 단계

### 1. 브라우저에서 테스트 (지금 바로!)

```
http://localhost:3000
↓
로그인 (admin@example.com)
↓
SR 관리 클릭
↓
서버 로그 확인
```

### 2. 로그 캡처

**정상 작동하는 경우**:
```
✅ SR 목록 페이지가 로드됨
✅ 빈 테이블이 표시됨
✅ 500 에러 없음
```

**에러 발생하는 경우**:
```
❌ 서버 로그의 에러 메시지 복사
❌ 브라우저 콘솔 (F12)의 에러 복사
```

### 3. 결과 공유

**다음 정보를 공유해주세요**:

1. **브라우저 상태**
   - [ ] SR 관리 페이지가 로드되었나요?
   - [ ] 500 에러가 표시되나요?

2. **서버 로그**
   ```
   (여기에 로그 붙여넣기)
   ```

3. **브라우저 콘솔 (F12 → Console)**
   ```
   (여기에 에러 붙여넣기)
   ```

---

## 💡 추가 디버깅 도구

### 1. 서버 로그를 파일로 저장

PowerShell에서:
```powershell
# 서버 재시작 + 로그 저장
pnpm dev > server-log.txt 2>&1
```

### 2. 네트워크 탭 확인

브라우저 (F12 → Network):
1. "srs" 요청 클릭
2. **Request** 탭: 요청 헤더 확인
3. **Response** 탭: 응답 내용 확인
4. **Preview** 탭: 에러 메시지 확인

### 3. Prisma Studio로 실시간 데이터 확인

```bash
npx prisma studio
# http://localhost:5555
```

---

## 📝 체크리스트

테스트하면서 아래 항목을 체크하세요:

### 환경
- [x] 서버 실행 중 (http://localhost:3000)
- [x] 데이터베이스 연결 정상
- [x] Prisma Client 최신 버전
- [x] 디버깅 로그 추가됨

### 로그인
- [ ] 로그인 성공
- [ ] 대시보드로 이동
- [ ] 세션 쿠키 확인 (F12 → Application → Cookies)

### SR 관리 페이지
- [ ] 사이드바에 "SR 관리" 메뉴 표시
- [ ] "SR 관리" 클릭 가능
- [ ] 페이지 로딩 시작
- [ ] 서버 로그에 🔍 표시

### 에러 발생 시
- [ ] 정확한 에러 메시지 캡처
- [ ] 에러 타입 확인 (PrismaClient, TypeError 등)
- [ ] 스택 트레이스 복사
- [ ] 요청/응답 데이터 확인

---

## 🚀 예상 결과

### ✅ 성공 시나리오

**브라우저**:
```
SR 관리 페이지 로드 완료
빈 테이블 표시: "등록된 SR이 없습니다"
"새 SR 생성" 버튼 표시
```

**서버 로그**:
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
🔍 [GET /api/srs] 세션: ✅ admin@example.com
🔍 [GET /api/srs] Prisma 쿼리 실행 중... {}
🔍 [GET /api/srs] 쿼리 성공! SR 개수: 0
🔍 [GET /api/srs] 200 응답 반환
```

### ❌ 실패 시나리오

**브라우저**:
```
GET /api/srs 500 (Internal Server Error)
페이지 로딩 실패 또는 에러 메시지
```

**서버 로그**:
```
🔍 [GET /api/srs] 요청 시작
🔍 [GET /api/srs] auth() 호출 중...
❌ Error: [정확한 에러 메시지]
❌ Error details: [상세 내용]
❌ Error stack: [스택 트레이스]
```

**👉 이 정확한 에러 메시지를 복사해주시면 해결할 수 있습니다!**

---

## 🔗 관련 파일

### 수정된 파일
- `src/app/api/srs/route.ts` - 디버깅 로그 추가
- `test-api.mjs` - Prisma 쿼리 직접 테스트 스크립트

### 참고 문서
- `ROOT_CAUSE_ANALYSIS.md` - 근본 원인 분석
- `TEST_VERIFICATION_GUIDE.md` - 검증 가이드
- `QUICK_FIX_API_ERROR.md` - 빠른 해결 가이드

---

**현재 시각**: 2024-11-08  
**서버 상태**: ✅ 실행 중  
**다음 단계**: 브라우저에서 테스트 및 로그 확인

**지금 바로 테스트해주세요!** 🚀

