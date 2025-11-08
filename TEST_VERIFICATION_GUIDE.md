# 🧪 SR 관리 오류 해결 검증 가이드

**생성일**: 2024-11-08  
**목적**: SR 관리 500 에러 해결 여부 확인

---

## ✅ 완료된 작업

1. ✅ **Prisma 스키마 복원** - Git으로 원래 스키마 복구
2. ✅ **Prisma Client 재생성** - 올바른 타입으로 생성 확인
3. ✅ **개발 서버 재시작** - 새 프로세스로 시작

### 확인 사항
```typescript
✅ prisma.sR.findMany() - 올바른 메서드 존재
✅ SR 모델 타입 export됨
✅ 개발 서버 HTTP 200 응답
```

---

## 🔍 현재 상황

### API 테스트 결과
```
✅ GET http://localhost:3000        → 200 OK
❌ GET http://localhost:3000/api/srs → 500 Internal Server Error
```

### 가능한 원인
1. **인증 문제** - auth() 함수 호출 실패
2. **데이터베이스 연결** - Supabase 연결 끊김
3. **데이터 부족** - ServiceCategory 또는 Client 데이터 없음

---

## 📋 수동 검증 절차

### Step 1: 개발 서버 로그 확인

개발 서버 창(별도로 열린 PowerShell)을 확인하세요:

```
예상되는 로그:
- ▲ Next.js 15.x
- Local:        http://localhost:3000
- ✓ Compiled /api/srs in XXXms

에러가 있다면:
❌ PrismaClientKnownRequestError: ...
❌ TypeError: Cannot read property ...
❌ Error: ...
```

**👉 에러 로그가 보이면 여기에 복사해주세요!**

---

### Step 2: 브라우저 테스트 (로그인 후)

#### 1. 로그인
```
1. 브라우저에서 http://localhost:3000 접속
2. "로그인" 탭 클릭
3. 이메일: admin@example.com
4. 비밀번호: admin123
5. "로그인" 버튼 클릭
```

#### 2. SR 관리 페이지 접근
```
1. 로그인 후 자동으로 대시보드로 이동
2. 왼쪽 사이드바에서 "SR 관리" 클릭
3. 페이지 로딩 확인
```

#### 3. 브라우저 콘솔 확인 (F12)
```
✅ 정상:
   - SR 목록이 표시됨 (데이터가 없어도 빈 테이블 표시)
   - Console에 에러 없음

❌ 에러:
   - GET /api/srs 500 (Internal Server Error)
   - 빨간색 에러 메시지
```

---

### Step 3: Prisma Studio로 데이터 확인

Prisma Studio가 자동으로 열렸습니다 (http://localhost:5555)

#### 확인할 테이블
```
1. Client (고객사)
   ✅ TEST001, TEST002 존재 확인

2. ServiceCategory (서비스 카테고리)
   ✅ 5개 존재 확인
   - 기술 지원 (TEST001)
   - 버그 수정 (TEST001)
   - 기능 개선 (TEST001)
   - 시스템 문의 (TEST002)
   - 데이터 처리 (TEST002)

3. User (사용자)
   ✅ admin@example.com 존재 확인
   ✅ isActive = true 확인

4. SR (서비스 요청)
   ℹ️ 데이터가 없어도 정상 (아직 생성 안 함)
```

---

## 🐛 디버깅 시나리오별 해결

### 시나리오 1: ServiceCategory 데이터 없음

**증상**: Prisma Studio에서 ServiceCategory 테이블이 비어있음

**해결**:
```bash
npx prisma db seed
```

---

### 시나리오 2: 데이터베이스 연결 끊김

**증상**: 서버 로그에 "Can't reach database server" 또는 "Connection timeout"

**해결**:
```bash
# .env 파일의 DATABASE_URL 확인
# Supabase 대시보드에서 연결 정보 확인
# 네트워크 연결 확인
```

---

### 시나리오 3: auth() 함수 에러

**증상**: 서버 로그에 "auth is not defined" 또는 "Cannot read property of undefined"

**해결**:
```bash
# auth.ts 파일 확인
# NextAuth 설정 검증
```

---

### 시나리오 4: Prisma Client 캐시 문제

**증상**: "Unknown argument" 또는 "Type error"

**해결**:
```bash
# 1. Node 프로세스 모두 종료
taskkill /F /IM node.exe

# 2. Prisma Client 재생성
npx prisma generate

# 3. .next 폴더 삭제 (캐시 제거)
Remove-Item -Recurse -Force .next

# 4. 서버 재시작
pnpm dev
```

---

## 📊 체크리스트

테스트를 진행하면서 아래 항목을 체크하세요:

### 환경 확인
- [ ] 개발 서버 실행 중 (http://localhost:3000)
- [ ] Prisma Studio 실행 중 (http://localhost:5555)
- [ ] Node 프로세스 버전 확인 (node --version)
- [ ] .env 파일 존재 및 DATABASE_URL 설정 확인

### 데이터 확인
- [ ] Client 테이블에 데이터 있음
- [ ] ServiceCategory 테이블에 데이터 있음
- [ ] User 테이블에 admin 계정 있음
- [ ] UserRole에 admin 역할 할당됨

### API 테스트
- [ ] 메인 페이지 접속 (200 OK)
- [ ] 로그인 성공 (대시보드로 이동)
- [ ] SR 관리 페이지 접속 시도
- [ ] 브라우저 콘솔 에러 확인
- [ ] 개발 서버 로그 에러 확인

### SR 생성 테스트 (선택적)
- [ ] "새 SR 생성" 버튼 표시
- [ ] 고객사 선택 가능
- [ ] 서비스 카테고리 선택 가능
- [ ] SR 생성 성공

---

## 🎯 다음 단계

### ✅ 모든 테스트 통과 시
**SR 관리 오류가 완전히 해결되었습니다!**

### ❌ 여전히 500 에러 발생 시

**개발 서버 로그의 정확한 에러 메시지를 공유해주세요:**

```
예시:
Error: PrismaClientValidationError: 
Invalid `prisma.sR.findMany()` invocation:
Unknown argument `serviceCategory`. Did you mean `serviceCategoryId`?
```

**브라우저 콘솔의 Network 탭 정보도 공유해주세요:**
1. F12 → Network 탭
2. "srs" 요청 클릭
3. Response 탭의 에러 메시지 복사

---

## 💡 추가 디버깅 팁

### 1. 상세 로그 활성화

`src/lib/prisma.ts`에서:
```typescript
log: ['query', 'info', 'warn', 'error']  // 모든 쿼리 로그 출력
```

### 2. API 라우트에 직접 로그 추가

`src/app/api/srs/route.ts`에:
```typescript
export async function GET(request: NextRequest) {
  console.log("=== SR API GET 호출됨 ===");
  try {
    const session = await auth();
    console.log("세션:", session?.user?.email);
    
    const srs = await prisma.sR.findMany({...});
    console.log("조회된 SR 개수:", srs.length);
    
    return NextResponse.json(mappedSrs);
  } catch (error) {
    console.error("❌ SR API 에러:", error);
    console.error("스택:", error.stack);
    return NextResponse.json(...);
  }
}
```

### 3. 브라우저에서 직접 API 호출

개발자 도구 Console에서:
```javascript
// 로그인 후 실행
fetch('/api/srs')
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

---

**현재 시간**: 2024-11-08  
**테스트 담당자**: [이름]  
**결과 기록**: [아래에 작성]

---

## 📝 테스트 결과 기록

### 개발 서버 로그
```
(여기에 에러 로그 붙여넣기)
```

### 브라우저 콘솔 로그
```
(여기에 에러 로그 붙여넣기)
```

### Prisma Studio 확인 결과
```
Client: X개
ServiceCategory: X개
User: X개
SR: X개
```

### 최종 판정
- [ ] ✅ 해결됨 - SR 관리 정상 작동
- [ ] ❌ 미해결 - 추가 조치 필요
- [ ] ⚠️ 부분 해결 - 일부 기능만 작동

---

**작성 완료일**: _______________

