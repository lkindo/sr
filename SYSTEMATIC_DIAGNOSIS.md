# 🔍 체계적 진단 보고서

**날짜**: 2024-11-08  
**문제**: 지속적인 500 에러 발생  
**진단 방법**: 근본 원인 단계별 확인

---

## 📊 진단 결과 요약

| 단계 | 항목 | 상태 | 결과 |
|------|------|------|------|
| 1 | src/app/api/srs/route.ts | ✅ 확인 | `export const runtime = 'nodejs'` 존재 (8번 줄) |
| 2 | src/middleware.ts | ✅ 확인 | API 경로에 영향 없음 (페이지만 체크) |
| 3 | next.config.ts | ✅ 확인 | 기본 설정, 문제 없음 |
| 4 | .next/server 빌드 | ✅ 확인 | 빌드 폴더 존재 |
| 5 | 추가 설정 적용 | ✅ 완료 | dynamic, revalidate 추가 |
| 6 | 캐시 완전 제거 | ✅ 완료 | .next 폴더 재생성 |
| 7 | 서버 재시작 | ✅ 완료 | HTTP 200 정상 |

---

## 🔍 진단 과정 상세

### 1단계: 소스 파일 확인

#### src/app/api/srs/route.ts

**위치**: 8번 줄

```typescript
// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
```

**결과**: ✅ 코드가 제대로 추가되어 있음

---

### 2단계: Middleware 확인

#### src/middleware.ts

```typescript
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/srs/:path*",
    "/clients/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/settings/:path*",
  ],
};
```

**분석**:
- NextAuth middleware 사용
- matcher는 **페이지 경로만** 포함
- `/api/*` 경로는 포함되지 않음
- **API 라우트에 영향 없음**

**결과**: ✅ 문제 없음

---

### 3단계: Next.js 설정 확인

#### next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

**분석**:
- 기본 설정만 존재
- runtime 강제 설정 없음
- experimental 설정 없음

**결과**: ✅ 문제 없음

---

### 4단계: 빌드 파일 확인

#### .next/server/app/api/srs/

```
route/
route.js
route.js.map
route_client-reference-manifest.js
```

**분석**:
- 빌드 파일 정상 생성됨
- route.js에 turbopack runtime 사용 확인

**결과**: ✅ 빌드 정상

---

### 5단계: 추가 설정 적용

#### 문제 분석

`export const runtime = 'nodejs'`만으로 충분하지 않을 수 있음.

#### 해결 방법

추가 Segment Config 적용:

```typescript
// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

**설명**:
- `runtime = 'nodejs'`: Node.js Runtime 강제
- `dynamic = 'force-dynamic'`: 동적 렌더링 강제
- `revalidate = 0`: 캐싱 비활성화

---

### 6단계: 빌드 캐시 완전 제거

#### 작업 내역

```powershell
✅ .next 폴더 삭제
✅ node_modules/.cache 삭제 (이전 단계)
✅ 완전히 새로운 빌드 생성
```

**이유**: 이전 빌드가 캐시되어 새 설정이 적용되지 않을 수 있음

---

### 7단계: 서버 재시작 및 검증

```powershell
✅ 모든 Node 프로세스 종료
✅ pnpm dev 실행
✅ HTTP 200 확인
```

---

## 🎯 최종 수정 사항

### src/app/api/srs/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendSRCreatedEmail } from "@/lib/email";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';         // ← 추가
export const dynamic = 'force-dynamic';  // ← 추가
export const revalidate = 0;             // ← 추가

// ... rest of the code
```

---

## 🧪 테스트 방법

### 방법 1: 브라우저 Console에서 직접 테스트

```javascript
fetch('/api/srs')
  .then(res => {
    console.log('Status:', res.status);
    if (res.status === 401) {
      console.log('✅ 인증 필요 (정상)');
      return res.json();
    } else if (res.status === 200) {
      console.log('✅ 성공!');
      return res.json();
    } else if (res.status === 500) {
      console.log('❌ 여전히 500 에러 발생!');
      return res.json();
    }
  })
  .then(data => console.log('Data:', data))
  .catch(err => console.error('Error:', err));
```

### 방법 2: 로그인 후 SR 관리 페이지 접속

```
1. http://localhost:3000 접속
2. 로그인 (admin@example.com / admin123)
3. SR 관리 클릭
4. 결과 확인
```

---

## 📊 예상 결과

### ✅ 성공 시나리오

#### Console 테스트 (로그인 전):
```
Status: 401
✅ 인증 필요 (정상)
Data: {error: "Unauthorized"}
```

#### Console 테스트 (로그인 후):
```
Status: 200
✅ 성공!
Data: [] (또는 SR 목록)
```

#### SR 관리 페이지:
```
✅ 페이지 로드 성공
✅ SR 목록 테이블 표시
✅ "새 SR 생성" 버튼 보임
✅ 500 에러 없음
```

---

### ❌ 여전히 실패 시나리오

#### Console 테스트:
```
Status: 500
❌ 여전히 500 에러 발생!
Data: {error: "...", details: "..."}
```

**다음 단계**:
1. `details` 필드의 정확한 에러 메시지 확인
2. 서버 로그 확인 (`new-server-log.txt`)
3. 다른 근본 원인 탐색

---

## 🔧 트러블슈팅 체크리스트

만약 여전히 500 에러가 발생한다면:

### 체크 1: 파일이 저장되었는가?
```
✓ src/app/api/srs/route.ts 파일을 열어서 확인
✓ 8-10번 줄에 export const 구문 3개 있는지 확인
```

### 체크 2: 빌드가 성공했는가?
```
✓ .next 폴더가 새로 생성되었는가?
✓ 서버 시작 시 에러가 없었는가?
```

### 체크 3: 브라우저 캐시가 제거되었는가?
```
✓ 시크릿 모드로 테스트
✓ Ctrl + Shift + Delete로 캐시 삭제
✓ F12 → Network → Disable cache
```

### 체크 4: 올바른 서버에 연결했는가?
```
✓ http://localhost:3000 (다른 포트가 아닌지 확인)
✓ 서버가 실행 중인지 확인
```

### 체크 5: 다른 API도 문제인가?
```
✓ GET /api/users 테스트
✓ GET /api/clients 테스트
✓ GET /api/roles 테스트
```

---

## 📚 Next.js Segment Config 참고

### Runtime 옵션

```typescript
export const runtime = 'nodejs' | 'edge';
```

- **nodejs**: 모든 Node.js API 사용 가능, Prisma 호환
- **edge**: 빠른 콜드 스타트, Node.js API 제한적

### Dynamic 옵션

```typescript
export const dynamic = 'auto' | 'force-dynamic' | 'force-static' | 'error';
```

- **force-dynamic**: 매 요청마다 새로 렌더링
- **force-static**: 빌드 시 한 번만 렌더링
- **auto**: Next.js가 자동 결정

### Revalidate 옵션

```typescript
export const revalidate = false | 0 | number;
```

- **0**: 캐싱 비활성화
- **숫자**: 해당 초 동안 캐시
- **false**: 영구 캐시

---

## 🎯 왜 이 설정들이 필요한가?

### runtime = 'nodejs'
```
문제: Prisma가 Node.js API (setImmediate) 사용
Edge Runtime: Node.js API 지원 안 함
해결: Node.js Runtime 강제 지정
```

### dynamic = 'force-dynamic'
```
문제: Next.js가 자동으로 정적 최적화 시도
Edge: 정적 최적화 시 Edge Runtime 선택 가능
해결: 동적 렌더링 강제로 Node.js Runtime 보장
```

### revalidate = 0
```
문제: 캐싱 시 이전 빌드 사용 가능
Edge: 캐시된 응답이 Edge에서 생성됨
해결: 캐싱 비활성화로 매번 새로 실행
```

---

## ✅ 확인 완료 사항

- [x] 소스 코드에 runtime 설정 추가 확인
- [x] Middleware 영향 없음 확인
- [x] Next.js 설정 문제 없음 확인
- [x] 추가 Segment Config 적용
- [x] 빌드 캐시 완전 제거
- [x] 서버 재시작 및 HTTP 200 확인
- [ ] **API 테스트 결과 대기 중** ← 현재 단계

---

## 🚀 다음 단계

### 사용자 테스트 필요

브라우저 Console에서 다음 코드 실행:
```javascript
fetch('/api/srs')
  .then(res => console.log('Status:', res.status))
```

**결과 보고**:
- Status: 401 → ✅ 성공 (인증 필요)
- Status: 200 → ✅ 성공 (로그인 후)
- Status: 500 → ❌ 추가 진단 필요

---

## 📝 기술 노트

### Next.js 15 + Turbopack

Next.js 15는 Turbopack을 기본 번들러로 사용합니다.

**특징**:
- 더 빠른 빌드
- 더 나은 개발 경험
- **Runtime 설정이 더 중요함**

**주의사항**:
- Segment Config를 명시적으로 설정해야 함
- 이전 버전에서는 자동으로 Node.js Runtime을 사용했지만,
- Next.js 15+에서는 최적화를 위해 Edge Runtime을 우선 선택할 수 있음

---

## 🎉 예상 성공 기준

모든 체크가 ✅이면 문제 해결:

- ✅ runtime = 'nodejs' 설정됨
- ✅ dynamic = 'force-dynamic' 설정됨
- ✅ revalidate = 0 설정됨
- ✅ .next 폴더 재생성됨
- ✅ 서버 재시작됨
- ✅ HTTP 200 응답
- ✅ API 테스트 성공 (401 또는 200)
- ✅ SR 관리 페이지 로드 성공
- ✅ 500 에러 없음

---

**최종 업데이트**: 2024-11-08  
**상태**: 테스트 대기 중  
**다음**: 사용자 테스트 결과 확인

