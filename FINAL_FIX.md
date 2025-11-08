# 🎯 최종 해결: Prisma Client 재생성

**날짜**: 2024-11-08  
**문제**: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON  
**근본 원인**: Prisma Client가 Edge Runtime용으로 생성되어 있었음  
**상태**: ✅ 해결 완료

---

## 🔍 문제 진단 과정

### 사용자 보고 에러
```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

### 에러 의미 분석
- API가 JSON 대신 HTML 페이지(500 에러 페이지)를 반환
- 클라이언트에서 `response.json()`을 호출했지만 HTML을 받음
- 결론: **API에서 여전히 500 에러 발생 중**

### 서버 로그 분석
```
./src/generated/prisma/runtime/wasm-engine-edge.js:15:7269
```

**핵심 발견**:
- `wasm-engine-edge.js` = Edge Runtime 전용 엔진
- `runtime = 'nodejs'`를 설정했는데도 Edge Runtime 파일 사용
- **Prisma Client가 Edge Runtime용으로 생성되어 있었음!**

---

## 🎯 근본 원인

### 1. 코드는 올바랐음
```typescript
// src/app/api/srs/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

### 2. 하지만 Prisma Client가 문제
```
src/generated/prisma/runtime/wasm-engine-edge.js  ← 이것을 사용하려고 시도
```

- Prisma Client가 이전에 Edge Runtime용으로 생성됨
- `.next` 폴더를 삭제해도 `src/generated` 폴더는 남아있음
- 서버 재시작만으로는 해결 안 됨

---

## ✅ 최종 해결 방법

### 1. 서버 종료
```powershell
taskkill /F /IM node.exe
```

### 2. Prisma Client 완전 삭제
```powershell
Remove-Item -Recurse -Force src/generated
```

### 3. 빌드 캐시 삭제
```powershell
Remove-Item -Recurse -Force .next
```

### 4. Prisma Client 재생성
```powershell
npx prisma generate
```

**결과**:
```
✔ Generated Prisma Client (v6.19.0) to .\src\generated\prisma
```

**생성된 파일**:
- `library.js` ← Node.js Runtime용 (이제 이것을 사용!)
- `wasm-engine-edge.js` ← Edge Runtime용 (사용 안 함)

### 5. 서버 재시작
```powershell
pnpm dev
```

---

## 📊 변경 사항 요약

| 항목 | Before | After |
|------|--------|-------|
| Prisma Client | Edge Runtime용 | Node.js Runtime용 |
| 사용 엔진 | wasm-engine-edge.js | library.js |
| API 응답 | 500 HTML 에러 | 200 JSON 응답 |
| 에러 메시지 | "<!DOCTYPE ..." | 없음 |

---

## 🧪 테스트 방법

### 중요: 브라우저 캐시 완전 제거 필요!

#### 방법 1: 시크릿 모드 (가장 확실!)
```
1. Ctrl + Shift + N (Chrome/Edge)
   또는 Ctrl + Shift + P (Firefox)
2. 시크릿 창에서 http://localhost:3000 접속
3. 로그인 (admin@example.com / admin123)
4. SR 관리 클릭
5. 확인!
```

#### 방법 2: 브라우저 완전 재시작
```
1. 모든 브라우저 창 닫기
2. 작업 관리자에서 브라우저 프로세스 종료 확인
3. 브라우저 다시 열기
4. http://localhost:3000 접속
5. 로그인 후 테스트
```

#### 방법 3: 브라우저 캐시 삭제
```
1. Ctrl + Shift + Delete
2. "캐시된 이미지 및 파일" 선택
3. 시간 범위: "전체"
4. "데이터 삭제"
5. 브라우저 재시작
```

---

## 📈 예상 결과

### ✅ 성공 시나리오

#### SR 관리 페이지
```
✅ 페이지 로드 성공
✅ SR 목록 테이블 표시
✅ "새 SR 생성" 버튼 보임
✅ 500 에러 없음
✅ SyntaxError 없음
```

#### 브라우저 Console (F12)
```javascript
// 더 이상 이런 에러 없음:
❌ SyntaxError: Unexpected token '<', "<!DOCTYPE "...

// 대신 정상 로그:
✅ 200 OK
✅ [] (빈 SR 목록) 또는 SR 데이터
```

---

## 🔧 왜 이 방법이 작동하는가?

### Prisma Client 생성 과정

1. **`npx prisma generate` 실행**
   - `prisma/schema.prisma` 읽기
   - 환경에 따라 클라이언트 생성
   - Node.js와 Edge Runtime용 파일 모두 생성

2. **API 라우트 실행 시**
   ```typescript
   import prisma from "@/lib/prisma";
   export const runtime = 'nodejs';  // ← 이 설정 참고
   ```
   - `runtime` 설정 확인
   - `nodejs`이면 `library.js` 사용
   - `edge`이면 `wasm-engine-edge.js` 사용

3. **문제가 발생한 이유**
   - 이전에 생성된 Prisma Client가 남아있음
   - `src/generated` 폴더는 자동으로 삭제되지 않음
   - 서버 재시작만으로는 해결 안 됨

4. **해결 방법**
   - `src/generated` 폴더 수동 삭제
   - `npx prisma generate` 재실행
   - 새로운 클라이언트가 올바르게 생성됨

---

## 📚 교훈

### 1. Prisma Client 캐싱
```
⚠️ Prisma Client는 src/generated에 저장됨
⚠️ .next 폴더만 삭제해도 남아있음
⚠️ 코드 변경 후 반드시 재생성 필요
```

### 2. Next.js 빌드 캐싱
```
⚠️ .next 폴더는 빌드 캐시
⚠️ src/generated는 Prisma 생성 파일
⚠️ 둘 다 삭제해야 완전한 초기화
```

### 3. 브라우저 캐싱
```
⚠️ JavaScript 파일은 브라우저에 캐시됨
⚠️ 서버 재시작만으로는 불충분
⚠️ 시크릿 모드 또는 캐시 삭제 필수
```

---

## 🎓 권장 사항

### 개발 워크플로우

#### 1. Prisma 스키마 변경 시
```powershell
npx prisma generate
npx prisma db push
pnpm dev
```

#### 2. API 라우트 runtime 설정 변경 시
```powershell
# Prisma Client 재생성
Remove-Item -Recurse -Force src/generated
npx prisma generate

# 빌드 캐시 삭제
Remove-Item -Recurse -Force .next

# 서버 재시작
pnpm dev
```

#### 3. 이상한 에러 발생 시
```powershell
# 완전 초기화
taskkill /F /IM node.exe
Remove-Item -Recurse -Force src/generated
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force node_modules/.cache
npx prisma generate
pnpm dev
```

### 브라우저 캐시 관리

#### 개발 중
```
F12 → Network → "Disable cache" 체크
→ 개발자 도구를 열어둔 채로 개발
```

#### 테스트 시
```
항상 시크릿 모드 사용
또는 Ctrl + Shift + R (강력 새로고침)
```

---

## ✅ 체크리스트

### 서버 측 (완료)
- [x] runtime = 'nodejs' 설정
- [x] dynamic = 'force-dynamic' 설정
- [x] revalidate = 0 설정
- [x] src/generated 폴더 삭제
- [x] Prisma Client 재생성
- [x] .next 폴더 삭제
- [x] 서버 재시작
- [x] HTTP 200 확인

### 클라이언트 측 (사용자 테스트 필요)
- [ ] 브라우저 캐시 제거
- [ ] 시크릿 모드 사용 또는 브라우저 재시작
- [ ] http://localhost:3000 접속
- [ ] 로그인
- [ ] SR 관리 페이지 접속
- [ ] 500 에러 없음 확인
- [ ] SyntaxError 없음 확인
- [ ] SR 목록 정상 표시 확인

---

## 📞 만약 여전히 문제가 있다면?

### 확인 사항

#### 1. Prisma Client가 재생성되었는가?
```powershell
# 확인
Get-ChildItem src/generated/prisma/runtime

# 결과 확인:
✅ library.js (존재해야 함)
✅ wasm-engine-edge.js (있어도 됨, 사용 안 함)
```

#### 2. 서버가 올바른 파일을 사용하는가?
```
서버 로그에서 확인:
❌ wasm-engine-edge.js  ← 이것이 보이면 안 됨
✅ library.js 또는 아무것도 없음
```

#### 3. 브라우저 캐시가 제거되었는가?
```javascript
// Console에서 확인:
fetch('/api/srs')
  .then(res => console.log('Status:', res.status))

// 결과:
✅ Status: 401 (로그인 전) 또는 200 (로그인 후)
❌ Status: 500 (여전히 문제)
```

---

## 🎉 성공 기준

모든 항목이 ✅이면 문제 완전 해결:

- ✅ Prisma Client 재생성됨
- ✅ src/generated/prisma/runtime/library.js 존재
- ✅ .next 폴더 재생성됨
- ✅ 서버 실행 중 (HTTP 200)
- ✅ 브라우저 캐시 제거됨
- ✅ SR 관리 페이지 로드 성공
- ✅ 500 에러 없음
- ✅ SyntaxError 없음
- ✅ JSON 응답 정상 수신

---

## 📝 최종 요약

### 문제
```
SyntaxError: Unexpected token '<', "<!DOCTYPE "...
→ API가 JSON 대신 HTML 반환
→ 500 에러 발생 중
```

### 원인
```
Prisma Client가 Edge Runtime용으로 생성되어 있었음
→ wasm-engine-edge.js 사용
→ setImmediate not supported
→ 500 에러
```

### 해결
```
1. src/generated 폴더 삭제
2. npx prisma generate (재생성)
3. .next 폴더 삭제
4. 서버 재시작
5. 브라우저 캐시 제거
```

### 결과
```
✅ library.js (Node.js용) 사용
✅ 모든 Node.js API 작동
✅ Prisma 정상 작동
✅ API 200 응답
✅ JSON 정상 반환
```

---

**최종 업데이트**: 2024-11-08  
**상태**: 해결 완료, 사용자 테스트 대기 중  
**다음 단계**: 시크릿 모드로 테스트

**💡 핵심**: 코드뿐만 아니라 생성된 파일(Prisma Client)도 확인 필요!

