# Stage 1: Dependency 설치
FROM node:24-slim AS deps
WORKDIR /app

# Corepack 활성화하여 pnpm 사용 준비
RUN corepack enable && corepack prepare pnpm@latest --activate

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/

# 의존성 설치 (CI 모드, 네트워크 지연에 의한 pnpm 10+ 공급망 검증 오류 해결)
ENV PNPM_VERIFY_STORE_INTEGRITY=false
ENV PNPM_VERIFY_SIGNATURES=false
ENV PNPM_MINIMUM_RELEASE_AGE=0
RUN pnpm install --frozen-lockfile

# Stage 2: Application 빌드
FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js 빌드 (standalone 설정이 next.config.ts에 포함되어 있어야 함)
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx prisma generate
RUN pnpm run build

# Stage 3: Runner
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 시스템 종속성 설치 (OpenSSL 등 Prisma 실행에 필요)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 권한 설정
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs nextjs

# 홈 디렉토리 및 작업 디렉토리 권한 설정
RUN mkdir -p /home/nextjs && chown -R nextjs:nodejs /home/nextjs
RUN mkdir -p /app && chown -R nextjs:nodejs /app
ENV HOME=/home/nextjs

# 빌드 결과물 복사 (Standalone 모드)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# entrypoint 스크립트 복사 및 실행 권한 부여
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
