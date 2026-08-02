# Stage 1: Dependency 설치
FROM node:22 AS deps
WORKDIR /app

# Corepack 활성화하여 pnpm 사용 준비.
#
# `pnpm@latest` 를 고정하지 않는다 — package.json 의 `packageManager` 필드가 버전을
# 결정하게 둔다. 예전에는 Docker(`latest`) / CI(`10`) / 로컬이 각각 다른 pnpm 을 써서
# 같은 커밋의 빌드가 시점에 따라 달라졌고, `.npmrc` 설정이 실제로 적용되는지도
# 환경마다 달랐다(감사 4.6). `latest` 는 언젠가 pnpm 11 로 넘어가 빌드를 깨뜨린다.
RUN corepack enable

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma/

# 의존성 설치 (CI 모드, 라이프사이클 스크립트 실행 우회로 husky/pnpm 보안 에러 방지)
ENV PNPM_VERIFY_STORE_INTEGRITY=false
ENV PNPM_VERIFY_SIGNATURES=false
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
RUN pnpm config set registry https://registry.npmjs.org/ && pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Application 빌드
FROM node:22 AS builder
WORKDIR /app

# 버전은 package.json 의 packageManager 가 결정한다(위 deps 스테이지 주석 참고).
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js 빌드 (standalone 설정이 next.config.ts에 포함되어 있어야 함)
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx prisma generate
RUN pnpm run build

# 기준 데이터 시드를 단일 JS 파일로 번들한다.
#
# 왜 필요한가(감사 3.4): 깨끗한 DB 로 배포하면 마이그레이션은 성공하고 앱도 뜨지만
# 역할·권한 행이 하나도 없어 **아무도 로그인할 수 없고 회원가입도 실패**한다
# (마이그레이션에는 데이터가 없고, 역할/권한은 prisma/seed.ts 만 만든다).
# 러너 이미지에는 tsx 도 devDependencies 도 없으므로, 여기서 미리 번들해 두면
# entrypoint 가 `node` 만으로 실행할 수 있다.
#
# @prisma/client 는 생성된 엔진을 참조하므로 번들에 넣지 않고 런타임 해석에 맡긴다
# (standalone 출력이 node_modules 에 포함한다).
RUN pnpm exec esbuild prisma/seed.ts \
  --bundle --platform=node --target=node22 --format=cjs \
  --external:@prisma/client --external:dotenv \
  --outfile=prisma/seed.bundle.cjs

# Stage 3: Runner
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 서비스 대상이 한국이라 앰비언트 로컬 타임존을 KST 로 맞춘다.
# 기본값(UTC)이면 서버 렌더와 KST 브라우저 하이드레이션이 매일 9시간 창 동안 다른
# 날짜를 만든다(감사 3.25). 날짜 경계 계산 자체는 `src/lib/timezone.ts` 가 타임존을
# 명시하므로 이 설정에 의존하지 않지만, 서드파티 코드의 로컬 타임존 사용까지 정렬된다.
ENV TZ=Asia/Seoul

# 시스템 종속성 설치 (OpenSSL 등 Prisma 실행에 필요, tzdata 는 TZ 적용에 필요)
RUN apt-get update && apt-get install -y openssl tzdata && rm -rf /var/lib/apt/lists/*

# 권한 설정
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs nextjs

# 홈 디렉토리 및 작업 디렉토리 권한 설정
RUN mkdir -p /home/nextjs && chown -R nextjs:nodejs /home/nextjs
RUN mkdir -p /app && chown -R nextjs:nodejs /app
ENV HOME=/home/nextjs

# 빌드 결과물 복사 (Standalone 모드)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 마이그레이션을 위해 prisma CLI 글로벌 설치
RUN npm install -g prisma@6.19.0

# entrypoint 스크립트 복사 및 실행 권한 부여
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 첨부파일 저장 디렉토리(웹루트 밖). 명명 볼륨이 nextjs 소유로 초기화되도록 미리 생성.
RUN mkdir -p /app/var/uploads && chown -R nextjs:nodejs /app/var
ENV STORAGE_DIR=/app/var/uploads

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 프로세스가 살아 있어도 wedge 된 상태(이벤트 루프 블록, GC 스래싱, DB 연결 상실)를
# 감지한다. `restart: always` 는 프로세스 종료에만 발화하므로 이것이 없으면 Docker 는
# 사이트가 사실상 다운된 컨테이너를 계속 running 으로 보고한다(감사 3.30).
# start-period 동안의 실패는 재시도로 계산되지 않는다 — 부팅 중 마이그레이션 시간을 준다.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
