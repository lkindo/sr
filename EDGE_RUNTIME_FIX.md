# Edge Runtime 오류 수정 완료

## 🔧 문제 원인

**에러**: `A Node.js API is used (process.cwd) which is not supported in the Edge Runtime`

**원인**: 
- Next.js 미들웨어는 **Edge Runtime**에서 실행됨
- Edge Runtime은 Node.js API(`process.cwd()`, `fs` 등)를 지원하지 않음
- `src/lib/prisma.ts`에서 `dotenv`의 `config()` 함수가 내부적으로 `process.cwd()` 사용

---

## ✅ 수정 완료

### 변경 사항: `src/lib/prisma.ts`

**수정 전**:
```typescript
import { config } from 'dotenv'
import { PrismaClient } from '@/generated/prisma'

// Force override environment variables from .env file
config({ override: true })

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}
```

**수정 후**:
```typescript
import { PrismaClient } from '@/generated/prisma'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}
```

### 변경 이유

1. **dotenv 제거**: Next.js는 자동으로 `.env` 파일을 로드하므로 `dotenv` 패키지 불필요
2. **datasources 제거**: Prisma는 `schema.prisma`에 정의된 `env("DATABASE_URL")`을 자동으로 사용
3. **Edge Runtime 호환**: Node.js API를 사용하지 않으므로 Edge Runtime에서 정상 작동

---

## 🚀 개발 서버 재시작

### 1. 현재 서버 종료

PowerShell에서 실행 중인 서버를 종료합니다:

```bash
# Ctrl+C 또는
taskkill /F /IM node.exe
```

### 2. 빌드 캐시 삭제 (권장)

```bash
Remove-Item -Path ".next" -Recurse -Force
```

### 3. 개발 서버 재시작

```bash
pnpm dev
```

---

## 📝 포트 설정

### 현재 상태
- 서버가 **3000번 포트**에서 실행 중
- `.env` 파일의 `NEXTAUTH_URL`은 `3001`로 설정됨

### 해결 방법 (둘 중 하나 선택)

#### 방법 1: 포트를 3001로 변경 (권장)

`.env` 파일은 그대로 두고 Next.js 포트만 변경:

```bash
# package.json의 dev 스크립트 수정
"dev": "next dev --port 3001"
```

또는 실행 시 포트 지정:

```bash
pnpm dev -- --port 3001
```

#### 방법 2: NEXTAUTH_URL을 3000으로 변경

`.env` 파일 수정:

```env
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

서버 재시작 후 [http://localhost:3000](http://localhost:3000) 접속

---

## ✅ 확인 사항

수정 후 다음을 확인하세요:

- [ ] 에러 없이 서버 시작
- [ ] 메인 페이지 접속 가능
- [ ] 로그인 페이지 접속 가능
- [ ] 회원가입 페이지 접속 가능

---

## 🔍 추가 정보

### Edge Runtime이란?

- Next.js 미들웨어와 일부 API Routes에서 사용
- 빠른 시작 시간과 낮은 메모리 사용
- Node.js의 모든 API를 지원하지 않음
- 브라우저 호환 API만 사용 가능

### 지원되지 않는 API

- `fs` (파일 시스템)
- `path.resolve()`, `process.cwd()`
- Node.js 네이티브 모듈
- `child_process`

### 지원되는 대안

- 환경 변수: `process.env.VARIABLE_NAME` (읽기만 가능)
- Web API: `fetch`, `Response`, `Request` 등
- Next.js 내장 기능 사용

---

## 📚 참고 자료

- [Next.js Edge Runtime](https://nextjs.org/docs/api-reference/edge-runtime)
- [Next.js 환경 변수](https://nextjs.org/docs/basic-features/environment-variables)
- [Prisma with Next.js](https://www.prisma.io/docs/guides/database/using-prisma-with-planetscale#add-prisma-to-the-nextjs-app)

---

**수정 완료 시간**: 2025-11-08  
**상태**: ✅ Edge Runtime 호환성 문제 해결


