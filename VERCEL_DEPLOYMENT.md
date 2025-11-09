# Vercel 배포 가이드

이 문서는 SR Management 시스템을 Vercel에 배포하는 방법을 설명합니다.

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

# Vercel Blob
BLOB_READ_WRITE_TOKEN=your-blob-token
```

#### 선택적 환경 변수

```bash
# Email (Resend)
RESEND_API_KEY=your-resend-key

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
NEXT_PUBLIC_AXIOM_TOKEN=your-axiom-token

# Notifications
MATTERMOST_WEBHOOK_URL=your-mattermost-webhook

# Inngest
INNGEST_EVENT_KEY=your-inngest-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

### 2. Vercel 프로젝트 설정

1. **Vercel CLI 설치** (선택사항)
   ```bash
   pnpm add -g vercel
   ```

2. **프로젝트 연결**
   ```bash
   vercel link
   ```

3. **환경 변수 설정**
   - Vercel 대시보드 → Settings → Environment Variables
   - 또는 CLI를 통해: `vercel env add`

## 배포 설정 파일

### vercel.json

```json
{
  "buildCommand": "pnpm prisma generate && pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "nextjs",
  "regions": ["icn1"],
  "env": {
    "DATABASE_URL": "@database_url",
    "DIRECT_URL": "@direct_url",
    "NEXTAUTH_SECRET": "@nextauth_secret",
    "NEXTAUTH_URL": "@nextauth_url"
  }
}
```

**설정 설명:**
- `buildCommand`: Prisma 클라이언트를 생성한 후 Next.js 빌드
- `installCommand`: 정확한 버전으로 의존성 설치 (보안 및 재현성)
- `framework`: Next.js 프레임워크 명시
- `regions`: 서울 리전 (icn1) 사용으로 한국 사용자에게 최적화

### next.config.ts

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // Vercel 최적화
  swcMinify: true,       // 번들 크기 최소화

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prisma를 외부 모듈로 처리하여 번들 크기 감소
      config.externals.push({
        '@prisma/client': 'commonjs @prisma/client',
        'prisma': 'commonjs prisma'
      });
    }
    return config;
  },
};
```

### package.json

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

**중요:** `postinstall` 스크립트는 의존성 설치 후 자동으로 Prisma 클라이언트를 생성합니다.

## 배포 프로세스

### 자동 배포 (추천)

GitHub와 Vercel을 연결하면 자동으로 배포됩니다:

1. main 브랜치에 푸시
2. Vercel이 자동으로 빌드 및 배포
3. 배포 상태는 Vercel 대시보드에서 확인

### 수동 배포

```bash
# 프로덕션 배포
vercel --prod

# 프리뷰 배포
vercel
```

## 배포 후 확인사항

### 1. 데이터베이스 연결 확인

배포된 애플리케이션에서 다음을 확인:
- 데이터베이스 연결 성공
- Prisma 쿼리 정상 작동

### 2. 인증 시스템 확인

- NextAuth 로그인/로그아웃 테스트
- 세션 관리 정상 작동

### 3. 파일 업로드 확인

- Vercel Blob 연동 정상 작동
- 파일 업로드/다운로드 테스트

## 트러블슈팅

### 빌드 실패: Prisma Client 에러

**증상:**
```
Error: @prisma/client did not initialize yet
```

**해결방법:**
1. `postinstall` 스크립트가 [package.json:11](package.json#L11)에 있는지 확인
2. Vercel 환경 변수에 `DATABASE_URL`이 설정되었는지 확인
3. 빌드 커맨드가 `pnpm prisma generate && pnpm build`인지 확인

### 빌드 시간 초과

**증상:**
```
Build exceeded maximum time limit
```

**해결방법:**
1. [.vercelignore](.vercelignore) 파일로 불필요한 파일 제외
2. 의존성 캐싱 활성화 (`--frozen-lockfile` 사용)
3. 테스트 파일 및 개발 도구 제외

### 환경 변수 누락

**증상:**
```
Error: Environment variable not found
```

**해결방법:**
1. Vercel 대시보드 → Settings → Environment Variables
2. 모든 필수 환경 변수 설정 확인
3. Production/Preview/Development 환경별로 설정

### 데이터베이스 연결 실패

**증상:**
```
Can't reach database server
```

**해결방법:**
1. Supabase에서 Vercel IP 허용 확인
2. `DATABASE_URL`과 `DIRECT_URL` 설정 확인
3. Supabase의 Pooler 연결 문자열 사용 (`?pgbouncer=true`)

## 성능 최적화

### 1. 이미지 최적화

Next.js Image 컴포넌트 사용:
```tsx
import Image from 'next/image'

<Image
  src="/image.jpg"
  alt="Description"
  width={500}
  height={300}
  priority
/>
```

### 2. 번들 크기 최적화

```bash
# 번들 분석
pnpm add -D @next/bundle-analyzer
```

### 3. 캐싱 전략

- Static Generation (SSG) 우선 사용
- Incremental Static Regeneration (ISR) 활용
- SWR/React Query로 클라이언트 캐싱

### 4. Edge Functions

자주 사용되는 API는 Edge Functions로 배포:
```typescript
export const runtime = 'edge';
```

## 모니터링

### Vercel Analytics

프로젝트 설정에서 Analytics 활성화

### Sentry 통합

환경 변수 설정:
```bash
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### Axiom 로깅

환경 변수 설정:
```bash
NEXT_PUBLIC_AXIOM_TOKEN=your-axiom-token
```

## 배포 체크리스트

- [ ] 환경 변수 모두 설정
- [ ] Supabase 데이터베이스 연결 확인
- [ ] Prisma 스키마 마이그레이션 완료
- [ ] NextAuth 설정 완료
- [ ] Vercel Blob 설정 완료
- [ ] 빌드 로컬에서 성공 확인 (`pnpm build`)
- [ ] 타입 체크 통과 (`pnpm type-check`)
- [ ] Git 푸시 및 자동 배포 확인
- [ ] 배포된 사이트 기능 테스트
- [ ] 모니터링 도구 연동 확인

## 추가 리소스

- [Vercel 문서](https://vercel.com/docs)
- [Next.js 배포 가이드](https://nextjs.org/docs/deployment)
- [Prisma on Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [Supabase + Vercel](https://supabase.com/docs/guides/platform/vercel)
