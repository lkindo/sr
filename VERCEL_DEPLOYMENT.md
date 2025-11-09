# Vercel 배포 가이드

이 문서는 SR Management 시스템을 Vercel에 배포하는 방법을 설명합니다.

## 근본 문제 해결 완료 ✅

### 배포 실패의 3가지 근본 원인과 해결책:

#### 1. Prisma 커스텀 출력 경로 문제
**문제:**
- `prisma/schema.prisma`의 `output = "../src/generated/prisma"`가 Vercel 빌드 실패의 주 원인
- 커스텀 경로는 로컬에서는 작동하지만 Vercel 환경에서 경로 충돌 발생

**해결:**
- Prisma 기본 경로 사용 (`node_modules/@prisma/client`)
- 모든 import를 `@prisma/client`로 변경
- `postinstall` 스크립트로 자동 생성 보장

#### 2. vercel.json 과도한 설정
**문제:**
- 불필요한 `buildCommand`, `installCommand` 설정이 Vercel 기본 빌드와 충돌
- `postinstall` 스크립트와 중복 실행으로 문제 발생

**해결:**
- vercel.json을 최소화 (framework, regions만)
- Vercel의 자동 감지 및 최적화 기능 활용
- 빌드 명령은 Next.js 기본값 사용

#### 3. pnpm 캐싱 최적화 부재
**문제:**
- 803개 패키지를 매번 처음부터 다운로드
- 빌드 시간이 과도하게 길어짐

**해결:**
- `.npmrc` 추가로 pnpm 설정 최적화
- Vercel 캐시 활용 설정

## 배포 전 준비사항

### 1. 환경 변수 설정

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

#### 필수 환경 변수

```bash
# Database (Supabase)
DATABASE_URL=postgresql://user:password@host:6543/database?pgbouncer=true
DIRECT_URL=postgresql://user:password@host:5432/database

# NextAuth
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://your-domain.vercel.app

# Vercel Blob (파일 업로드 사용 시)
BLOB_READ_WRITE_TOKEN=your-blob-token
```

#### 선택적 환경 변수

```bash
# Email (Resend)
RESEND_API_KEY=your-resend-key

# Redis (Upstash - 세션/캐싱)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
NEXT_PUBLIC_AXIOM_TOKEN=your-axiom-token

# Notifications
MATTERMOST_WEBHOOK_URL=your-mattermost-webhook
```

### 2. Vercel 프로젝트 설정

Vercel 대시보드에서:
1. GitHub 저장소 연결
2. Framework Preset: **Next.js** (자동 감지됨)
3. Root Directory: `./` (기본값)
4. Build Command: 비워두기 (자동: `pnpm build`)
5. Install Command: 비워두기 (자동: `pnpm install`)

## 핵심 설정 파일

### 1. prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
  // 커스텀 output 경로 사용 안 함 (Vercel 호환성)
  // output = "../src/generated/prisma" ❌
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 2. vercel.json (최소 설정)

```json
{
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

**설정 설명:**
- `framework`: Next.js 명시 (자동 최적화)
- `regions`: 서울 리전 (한국 사용자 최적화)
- buildCommand/installCommand 제거 (자동 감지)

### 3. .npmrc (pnpm 최적화)

```
auto-install-peers=true
strict-peer-dependencies=false
enable-pre-post-scripts=true
shamefully-hoist=false
store-dir=~/.pnpm-store
```

### 4. package.json

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "build": "next build",
    "start": "next start"
  }
}
```

**중요:** `postinstall`은 의존성 설치 후 자동으로 Prisma 클라이언트를 생성합니다.

### 5. next.config.ts

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // Vercel 최적화
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prisma를 외부 모듈로 처리
      config.externals.push({
        '@prisma/client': 'commonjs @prisma/client',
        'prisma': 'commonjs prisma'
      });
    }
    return config;
  },
};
```

## 배포 프로세스

### 자동 배포 (추천)

1. 변경사항을 main 브랜치에 푸시
```bash
git add .
git commit -m "fix: Vercel 배포 설정 완료"
git push origin main
```

2. Vercel이 자동으로:
   - 소스 코드 감지
   - 의존성 설치 (`pnpm install`)
   - Prisma 클라이언트 생성 (`postinstall`)
   - Next.js 빌드 (`next build`)
   - 배포

3. 배포 상태 확인:
   - Vercel 대시보드 → Deployments
   - 실시간 빌드 로그 확인

### 수동 배포 (CLI)

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 연결
vercel link

# 프리뷰 배포
vercel

# 프로덕션 배포
vercel --prod
```

## 트러블슈팅

### 1. Prisma Client 생성 실패

**증상:**
```
Error: @prisma/client did not initialize yet
```

**해결:**
1. `package.json`에 `postinstall` 스크립트 확인
2. Vercel 환경 변수에 `DATABASE_URL` 설정 확인
3. `prisma/schema.prisma`에 커스텀 output 경로 없는지 확인

### 2. 빌드 시간 초과

**증상:**
```
Build exceeded maximum time limit
```

**해결:**
1. `.vercelignore` 파일로 불필요한 파일 제외
2. `.npmrc` 설정 확인
3. `node_modules` 삭제 후 재설치

### 3. 환경 변수 누락

**증상:**
```
Environment variable not found: DATABASE_URL
```

**해결:**
1. Vercel 대시보드 → Settings → Environment Variables
2. Production, Preview, Development 환경별로 설정
3. 재배포 (Redeploy)

### 4. Module not found

**증상:**
```
Module not found: Can't resolve '@/generated/prisma'
```

**해결:**
1. 모든 Prisma import를 `@prisma/client`로 변경
```typescript
// ❌ 잘못된 import
import { PrismaClient } from '@/generated/prisma'

// ✅ 올바른 import
import { PrismaClient } from '@prisma/client'
```

2. 로컬에서 재생성
```bash
rm -rf src/generated
pnpm prisma generate
```

## 배포 후 확인사항

### 1. 기본 동작 확인
- [ ] 사이트 접속 가능
- [ ] 로그인 페이지 로드
- [ ] 정적 리소스 로드 (CSS, JS, 이미지)

### 2. 데이터베이스 연결
- [ ] Prisma 쿼리 정상 작동
- [ ] 데이터 CRUD 테스트

### 3. 인증 시스템
- [ ] 로그인/로그아웃 테스트
- [ ] 세션 관리 확인

### 4. 성능 확인
- [ ] Lighthouse 스코어 확인
- [ ] Core Web Vitals 확인
- [ ] 로딩 속도 테스트

## 성능 최적화 팁

### 1. Edge Functions 활용
자주 호출되는 API는 Edge Runtime 사용:
```typescript
export const runtime = 'edge';
```

### 2. 이미지 최적화
Next.js Image 컴포넌트 사용:
```tsx
import Image from 'next/image'

<Image
  src="/image.jpg"
  alt="Description"
  width={500}
  height={300}
  priority  // LCP 최적화
/>
```

### 3. 캐싱 전략
- Static Generation (SSG) 우선 사용
- Incremental Static Regeneration (ISR) 활용
- SWR/React Query로 클라이언트 캐싱

## 모니터링

### Vercel Analytics
프로젝트 설정 → Analytics 탭에서 활성화

### Speed Insights
실시간 성능 모니터링 활성화

### 로그 확인
Vercel 대시보드 → Logs에서 실시간 서버 로그 확인

## 추가 리소스

- [Vercel 공식 문서](https://vercel.com/docs)
- [Next.js 배포 가이드](https://nextjs.org/docs/deployment)
- [Prisma on Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [Supabase + Vercel 통합](https://supabase.com/docs/guides/platform/vercel)
