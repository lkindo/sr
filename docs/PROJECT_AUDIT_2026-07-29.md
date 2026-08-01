# SR 관리 시스템 최종 감사 보고서

**대상**: `d:/project/sr` (Next.js 16 + Prisma + PostgreSQL, 멀티테넌트 SR 관리 시스템)
**감사 방식**: 정적 소스 분석 (빌드/테스트 미실행), 10개 영역 교차 검증

---

## 1. 총평

이 시스템은 **"설계는 상급, 마감은 미완"** 의 전형이다. 정책 계층 분리(`src/lib/policies.ts`), 모든 SR 변경 경로의 낙관적 잠금(`src/services/sr.service.ts:339-347`), AsyncLocalStorage 기반 트랜잭션 커밋 후 이벤트 발행(`src/lib/prisma.ts:33-58`), DB 측 `COUNT(*) FILTER` 집계(`src/app/api/dashboard/stats/route.ts:90-117`), 첨부파일 경로 봉쇄와 매직넘버 검증(`src/lib/storage.ts:32-51`, `src/lib/file-validator.ts:121-158`) 등 상급 개발자가 의도적으로 넣은 흔적이 소스 전반에 실재하며, 이는 이 규모 사내 앱의 평균을 크게 상회한다.

그러나 멀티테넌트 RBAC 시스템에서 가장 치명적인 세 가지가 모두 확인되었다. 세션 서명 시크릿이 저장소에 커밋되어 실제 배포에 사용 중이고(`.env.docker:9`), 상세 엔드포인트가 목록 엔드포인트의 테넌트 스코프를 재적용하지 않아 실동작하는 교차 테넌트 조회·권한상승 경로가 존재하며(`src/lib/policies.ts:139-209`), 배포 파이프라인이 CI에 전혀 의존하지 않는다(`.github/workflows/deploy.yml:3`). 여기에 회귀를 잡아야 할 테스트 계층이 커버리지 분모 절반 누락, 단언 없는 보안 E2E, 임계값 없는 뮤테이션 테스트로 **구조적으로 실패를 보고할 수 없게** 구성되어 있다.

잘 만든 부분을 충분히 인정하더라도 현재 상태는 **구멍이 크고 사고 가능성이 높은 D 구간**이며, **프로덕션 배포 불가(No-Go)** 다. 다만 실패 원인이 아키텍처가 아니라 마감 누락에 몰려 있어, 아래의 좁고 명확한 차단 항목 목록으로 정리된다.

---

## 2. 완성도 점수표

| 영역                                          | 점수 | 등급  | 핵심 근거                                                                                                                                                                                                   |
| --------------------------------------------- | ---: | :---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보안 · 인증/인가 · RBAC · 테넌트 격리         |   45 | **D** | 정책 계층·첨부 경로 봉쇄·파라미터화 SQL은 견고하나, `.env.docker:9`의 커밋된 서명키로 세션 위조 가능. `canReadClient`/`canReadUser`/`canUpdateUser`가 권한 플래그만 검사(`src/lib/policies.ts:139,191,203`) |
| Prisma 스키마 · 마이그레이션 · 쿼리           |   62 | **C** | 원자적 채번·낙관적 잠금·명시적 select는 우수. BigInt 직렬화 누락으로 첨부 REST 전멸(`src/lib/serialization.ts:37`), `created_at` 인덱스 부재(`prisma/schema.prisma:288`)                                    |
| API 라우트 · 검증 · 에러 · HTTP 시맨틱        |   57 | **D** | 40개 중 32개가 단일 래퍼 사용, 에러 taxonomy 양호. DELETE가 성공 후 500(`src/app/api/srs/[id]/route.ts:82`), PATCH가 무동작 200(`src/app/api/users/[id]/client/route.ts:193`)                               |
| 서버 액션 · 서비스 · 상태머신 · 도메인 이벤트 |   53 | **D** | 트랜잭션 후 이벤트·감사로그 롤백 강제는 정교. intake POST가 이벤트 미발행(`src/app/api/srs/[id]/intake/route.ts:211`), `updateSR` 필드 단위 인가 부재(`src/services/sr.service.ts:201`)                     |
| Docker · CI/CD · nginx · 배포 안전성          |   38 | **F** | 3단계 빌드·비루트·볼륨·로그 로테이션은 준수. deploy가 CI에 무의존(`.github/workflows/deploy.yml:3`), 하드코딩 admin 재시드(`:121`), 헬스체크·롤백 전무                                                      |
| 테스트 전략 · 커버리지 정직성 · E2E           |   40 | **D** | 136파일·2292단언, 상태머신/storage 테스트는 모범적. `coverage.include` 부재로 게이트가 48%만 측정(`vitest.config.ts:19`), 보안 E2E가 `console.log` 사용                                                     |
| React 컴포넌트 · 훅 · 상태관리                |   55 | **D** | RSC 설계·React Query 낙관적 업데이트는 정석. 비밀번호 평문 localStorage 저장(`src/components/auth/LoginForm.tsx:62`), 유휴 타임아웃 무동작(`IdleTimeoutProvider.tsx:46`)                                    |
| 성능 · 캐싱 · 확장성 · 리소스 상한            |   56 | **D** | DB측 집계·스트리밍 다운로드·매직넘버 검사 실재. `itemsPerPage` 무제한(`src/app/(dashboard)/srs/page.tsx:26`), 대시보드 캐시 키가 사장                                                                       |
| 제품 완성도 · UX 플로우 · 문서                |   58 | **D** | SR 생명주기 전 구간 출시 가능 수준. 서비스 카테고리 생성 UI 부재, 신규 인스턴스 부트스트랩 경로 부재, 관리자 비밀번호 재설정 무동작                                                                         |
| 설정 · 환경변수 · 타입 · 도구 · 저장소 위생   |   60 | **C** | strict TS, `@ts-ignore` 0건, pre-commit 게이트 양호. `.npmrc`가 공급망 검증 전면 비활성(`.npmrc:3`), 실 시크릿 커밋, `NEXT_PUBLIC_APP_URL` 주석 처리                                                        |

### 종합 점수: **50 / 100 (D)**

가중치: 보안 0.22 · 데이터 0.12 · API 0.12 · 도메인 0.12 · DevOps 0.12 · 테스트 0.10 · 프론트 0.08 · 성능 0.05 · UX 0.04 · 설정 0.03

가중 평균이 50에 수렴하는 이유는 명확하다. 가장 큰 가중치를 가진 보안 영역이 45점(D)이고, 그 다음 큰 세 영역(데이터·API·도메인)이 모두 53~62 구간에 머무르며, 배포 안전성이 38점(F)으로 하방을 끌어내린다. 개별 영역 평균은 52.4지만, 보안·DevOps의 결함들이 서로 결합해 **실사용 침해 경로**를 형성하기 때문에 종합 판정은 산술 평균보다 보수적으로 읽어야 한다.

---

## 3. 즉시 조치 필요 (Critical / High)

> 아래 항목은 심각도 → 파급 범위 순으로 배열했다. **(1)~(4)는 배포 차단 항목**, (5)~(6)은 사용자 즉시 체감 기능 결함, (7) 이하는 가용성·데이터 무결성 항목이다.

---

### 3.1 [CRITICAL] NextAuth 서명 시크릿이 git에 커밋되어 실제 배포 컨테이너가 사용 중

**파일**: `.env.docker:9-10`, `.env.docker.test:6-7`

**문제**
`.env.docker:9-10`에 `NEXTAUTH_SECRET="<44자 base64 시크릿 — 본 문서에서는 마스킹>"` 및 동일값 `AUTH_SECRET`이 평문으로 존재하며, `.env.docker.test:6-7`은 **완전히 동일한 값**을 갖는다. `git ls-files`로 두 파일 모두 추적 중임이 확인된다. `docker-compose.prod.yml:29-30`은 `env_file: - .env.docker`를, `docker-compose.test.yml:10-11`은 `.env.docker.test`를 선언하고, `.github/workflows/deploy.yml:70`이 매 푸시마다 `.env.docker.test`를 프로덕션 VM으로 scp한다. `src/auth.config.ts:5-7`이 `strategy: 'jwt'`이므로 세션 자체가 서명된 토큰이며, 서버 측 세션 레코드가 없어 교차 검증이 불가능하다.

**영향**
저장소를 읽을 수 있는 누구나 `{id: <임의 사용자>, roles: ['ADMIN'], permissions: [...], clientIds: [...]}` 를 담은 유효한 Auth.js JWT를 위조할 수 있다. `withAuth`(`src/lib/auth-wrapper.ts:50-68`)와 모든 정책 함수가 `session.user.roles/permissions/clientIds`를 DB 재확인 없이 그대로 신뢰하므로, 위조 토큰 하나로 **이 감사에서 발견된 모든 인가 통제가 무력화**된다. 스테이징(test.lkindo.kr)은 이미 이 키로 서명 중이며, prod와 값이 동일해 스테이징에서 발급한 쿠키가 프로덕션에도 암호학적으로 유효하다.

**수정 방안**

1. 이 값은 소각된 것으로 간주한다. `openssl rand -base64 32`로 prod/staging 각각 **별도** 시크릿을 신규 발급.
2. `git rm --cached .env.docker .env.docker.test` → `.gitignore`에 `.env.docker*` 추가 → BFG/git-filter-repo로 이력 삭제(이력에 남아 있으면 로테이션 의미가 반감).
3. `NEXTAUTH_SECRET`/`AUTH_SECRET`/`POSTGRES_PASSWORD`를 GitHub Actions Secrets에서 주입해 배포 시 서버에 env 파일을 생성하는 방식으로 전환.
4. `.gitleaks.toml`에 `.env.docker*` 탐지를 추가하고, **CI에 gitleaks 스텝을 실제로 연결**한다(현재 설정 파일만 있고 어떤 워크플로도 실행하지 않음). `.dockerignore`에도 추가.

---

### 3.2 [CRITICAL] dev 푸시마다 하드코딩 ADMIN 계정이 인터넷 노출 스테이징에 재시드

**파일**: `.github/workflows/deploy.yml:121`, `prisma/seed.ts:281,308-315`

**문제**
`deploy.yml:121`이 `dev` 브랜치 푸시마다 `docker compose -p sr-test exec -T app-test npx tsx prisma/seed.ts`를 실행한다. `prisma/seed.ts:281`은 `const adminHash = '$2b$10$VarymB/cfMVOCvlVWsDHX.jwOJd.qma9FEKr4H1.skoGt7h1WzZxK'`를 하드코딩하고, 2회차부터는 ELSE 분기(`:308-315`)에서 `prisma.user.update({ where: { email: 'admin@example.com' }, data: { password: adminHash } })`로 **기존 비밀번호를 강제 복원**한다. `:306`이 출력하는 자격증명은 `admin@example.com / admin123`. 동일 패턴이 `engineeruser@example.com / engineer123`(`:317-352`)에도 적용된다. 이 DB는 https://test.lkindo.kr(`nginx/nginx.conf:83-113`)와 평문 http://\<host\>:3001(`docker-compose.test.yml:8-9`, `scripts/setup-server.sh:41` 방화벽 개방)로 노출된다.

**영향**
미인증 공격자가 저장소에 공개된 자격증명으로 스테이징에 **전체 ADMIN**으로 로그인할 수 있다. 운영자가 비밀번호를 바꿔도 다음 dev 배포에서 되돌아가므로 사실상 로테이션이 불가능하다. `.env.docker.test:6-7`이 prod와 `NEXTAUTH_SECRET`을 공유하므로, 이 admin 로그인으로 발급된 세션은 **프로덕션에도 유효**하다. 이것이 3.1을 이론이 아닌 실행 가능한 침해 경로로 만드는 연결 고리다.

**수정 방안**

1. `deploy.yml:121`의 자동 seed를 제거하거나 `workflow_dispatch` 입력으로 게이트.
2. `prisma/seed.ts`를 **참조 데이터 seed**(roles/permissions/rolePermissions, 멱등, 프로덕션 안전)와 **개발 픽스처 seed**(테스트 사용자·클라이언트, `NODE_ENV !== 'production'` 가드)로 분리.
3. `:308-315`, `:341-344`, `:431`의 무조건적 비밀번호 리셋 제거 — 기존 사용자의 비밀번호를 절대 덮어쓰지 않는다.
4. admin 비밀번호를 기본값 없는 env 변수에서 읽도록 변경. 현재 스테이징 admin/engineer 계정 삭제.

---

### 3.3 [CRITICAL] 배포 워크플로가 CI에 전혀 의존하지 않음 — lint/타입/테스트 실패도 프로덕션에 반영

**파일**: `.github/workflows/deploy.yml:3-8`

**문제**
`deploy.yml:3-8`은 `on: push: branches: [main, dev]`만 선언하고, 단일 `deploy` 잡에 `needs:`도 `workflow_run:`도 없다. `ci-cd.yml:3-13`은 동일 트리거를 가진 **완전히 별개의 워크플로**이므로 두 워크플로가 동시에 실행된다. `ci-cd.yml`의 종단 잡 `deployment-ready`(`:272-279`)는 `echo "Ready for deployment"`만 출력하고 아무것에도 연결되지 않는다. `deploy.yml`에는 `concurrency:` 그룹도, `paths-ignore`도 없다.

**영향**
ESLint, `tsc --noEmit`, vitest 커버리지 임계값, 빌드 검증 — 보고서에 기술된 **모든 품질 게이트가 배포에 대해 장식**이다. 타입체크가 깨지거나 커버리지가 80% 아래로 떨어진 커밋도 이미지로 빌드되어 GHCR에 푸시되고 프로덕션에 force-recreate된다. 하드 컴파일 에러만 `pnpm build`에서 걸리므로 모든 로직·테스트 회귀가 그대로 나간다. `docker-entrypoint.sh:5`가 부팅 시 `prisma migrate deploy`를 자동 실행하므로, **잘못된 마이그레이션도 CI 실패가 보이기 전에 프로덕션 DB에 도달**한다. concurrency 그룹이 없어 연속 푸시 2건이 같은 호스트에서 `down`/`up` 사이클을 병렬 실행해 절반은 구버전, 절반은 신버전인 스택을 만들 수 있다. `paths-ignore`가 없어 README.md 수정만으로도 전체 스택이 teardown된다.

**수정 방안**

1. deploy 잡을 `ci-cd.yml`에 병합하고 `needs: [code-quality, test, build]`를 걸거나, `deploy.yml`을 `on: workflow_run: {workflows: ['CI/CD Pipeline'], types: [completed], branches: [main, dev]}` + `if: github.event.workflow_run.conclusion == 'success'`로 전환.
2. `concurrency: {group: deploy-${{ github.ref }}, cancel-in-progress: false}` 추가.
3. `ci-cd.yml:6-13`과 동일한 `paths-ignore` 블록 추가.
4. main 브랜치에 branch protection + `environment: production`(필수 리뷰어) 설정.

---

### 3.4 [CRITICAL] 신규 프로덕션 인스턴스에 부트스트랩 경로 부재 — 아무도 로그인할 수 없음

> **✅ 해결됨 (2026-08-01).** 수정방안 3개를 모두 적용했다.
>
> 1. **기준 데이터 자동 시딩** — `prisma/seed.ts` 는 이미 `seedReferenceData()` /
>    `seedDevFixtures()` 로 분리되어 있었다(픽스처는 `NODE_ENV!==production` +
>    `SEED_DEV_FIXTURES=true` 이중 가드). 남은 것은 호출 경로였다.
>    러너 이미지에는 tsx 도 devDependencies 도 없으므로 **빌더 스테이지에서 esbuild 로
>    단일 CJS 번들**(`prisma/seed.bundle.cjs`)을 만들고, `docker-entrypoint.sh` 가
>    `prisma migrate deploy` **직후** `node` 로 실행한다. 시딩 실패는 부팅을 막지 않는다 —
>    DB 일시 오류로 앱 전체가 뜨지 못하는 쪽이 더 나쁘다.
> 2. **부트스트랩 관리자** — `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` 가
>    설정되고 **ADMIN 이 하나도 없을 때만** 1명 생성한다.
>    감사가 제시한 두 안 중 "최초 등록자 자동 승격" 이 아니라 **env 방식**을 택했다 —
>    최초 가입자 승격은 인스턴스가 인터넷에 노출된 상태에서 소유자보다 먼저 가입한 사람이
>    관리자가 되는 경쟁 조건을 만든다. env 로 명시하면 그 창이 없다.
>    안전장치: 멱등(ADMIN 존재 시 무동작), 기존 사용자 비밀번호 미변경(역할만 부여),
>    12자 미만 비밀번호 거부.
> 3. **`START_SERVER.md` 정정** — Prisma Studio 수동 역할 할당 안내를 제거했다.
>    그 절차는 역할 행이 이미 있을 때만 성립하는데, 시딩 전에는 `roles` 가 비어 있어
>    **복사할 ID 자체가 없다**. 실제 동작하는 로컬/Docker 절차로 교체.
>
> `.env.example` 에 부트스트랩 변수와 "로그인 후 제거" 안내를 추가했다.
> 회귀 테스트: `src/__tests__/bootstrap-admin.test.ts` (14건) — 번들 생성·CJS 파싱·
> 픽스처 가드 잔존·entrypoint 호출 순서·부트스트랩 계약(멱등/비밀번호 보존/길이 가드)을 고정한다.

**파일**: `docker-entrypoint.sh:4-10`, `src/app/(auth)/register/actions.ts:70-81`

**문제**
`docker-entrypoint.sh`는 `prisma migrate deploy`만 실행하고 seed 스텝이 없다. `prisma/migrations` 8개 디렉터리 어디에도 데이터가 없다(`grep 'INSERT INTO' prisma/migrations` 무결과). 역할·권한은 오직 `prisma/seed.ts`만 생성하며, 이는 `package.json:22`의 로컬 dev 스크립트 `db:seed`로만 노출되고 `docker-compose.prod.yml`이 호출하지 않는다. 결과적으로 회원가입도 실패한다: `src/app/(auth)/register/actions.ts:70-81`이 `prisma.role.findFirst({ where: { name: ... } })` 결과가 null이면 `'시스템 설정 오류: 기본 역할을 찾을 수 없습니다.'`를 반환한다. CLIENT 가입은 `/api/clients/public`이 빈 배열을 반환해 이중으로 막힌다.

**영향**
깨끗한 DB에 `docker-compose.prod.yml`로 배포하면 마이그레이션은 성공하고 앱은 정상 부팅되며 nginx가 로그인 페이지를 서빙한다. 그러나 **admin 사용자가 없어 아무도 로그인할 수 없고**, `/register`는 두 계정 유형 모두 시스템 설정 오류로 실패한다. 인스턴스는 영구히 사용 불가 상태이며 문서화된 복구 절차가 없다. 유일한 우회책(컨테이너 내부 `db:seed`)은 파괴적이다 — admin 비밀번호를 공개된 기본값으로 리셋하고 테스트 계정을 프로덕션에 생성한다(3.2 참조).

**수정 방안**

1. `prisma/seed.ts`를 참조 데이터/개발 픽스처로 분리하고, `docker-entrypoint.sh`의 `prisma migrate deploy` 직후 **참조 데이터 seed만** 호출.
2. ADMIN이 없을 때 최초 등록 사용자를 ADMIN으로 승격하는 first-run 부트스트랩, 또는 env에서 자격증명을 읽는 일회성 `create-admin` 스크립트 추가.
3. `START_SERVER.md`의 Prisma Studio 수동 역할 할당 안내는 동작하지 않으므로 제거.

---

### 3.5 [CRITICAL] 로그인 폼이 사용자 비밀번호를 평문으로 localStorage에 저장

**파일**: `src/components/auth/LoginForm.tsx:62`

**문제**
`:60-62`에서 `if (rememberMe) { localStorage.setItem('sr-remembered-email', email); localStorage.setItem('sr-remembered-password', password); }`. `:31-41`에서 마운트 시 읽어 비밀번호 입력란을 재채움. 암호화 없음, 만료 없음. 체크박스 레이블은 `'로그인 정보 저장'`(`:130`)뿐으로 비밀번호가 평문 저장된다는 고지가 없다.

**영향**
로그아웃 후에도 자격증명이 남고, 오리진에서 실행되는 모든 스크립트·브라우저 확장·브라우저 프로필 파일 접근자가 읽을 수 있다. 공유 워크스테이션(사내 운영 도구에서 흔함) 또는 단 한 건의 XSS가 세션 탈취가 아닌 **영구 자격증명 탈취**로 격상된다. `src/proxy.ts:72`의 CSP가 `'unsafe-inline'` 스크립트를 허용하므로 XSS는 원격 가설이 아니다. 비밀번호 재사용을 고려하면 피해 범위가 이 앱을 넘어선다.

**수정 방안**

1. 비밀번호 분기(`:39-41`, `:62`, `:65`)를 전부 삭제하고 이메일(`sr-remembered-email`)만 유지.
2. 지속 로그인이 요구사항이면 NextAuth 세션 쿠키 `maxAge`로 해결.
3. 앱 부팅 시 `localStorage.removeItem('sr-remembered-password')`를 무조건 실행하는 일회성 정리 코드 추가 — 이미 저장된 사용자들의 비밀번호를 제거해야 한다.

---

### 3.6 [CRITICAL] GET /api/clients/[id] — CLIENT:READ 보유자가 타 고객사 전체 SR·사용자 명부 조회

**파일**: `src/app/api/clients/[id]/route.ts:25-34`, `src/lib/policies.ts:139-149`, `src/services/client.service.ts:36-61`

**문제**
핸들러는 `clientService.getClientWithDetailsAndCategories(id)` 호출 후 `ensureCanReadClient(session.user, clientWithCategories)`를 실행한다. `canReadClient`(`policies.ts:139-149`)는 `isAdmin || canViewAll || isMemberOfClient`를 반환하며, `canViewAll = hasPermissionFlag(user, 'CLIENT:READ')` 이므로 **CLIENT:READ 보유만으로 테넌트 검사가 단락**된다. `client.id`는 멤버십 분기에서만 참조된다. `prisma/seed.ts:217`이 CLIENT_ADMIN에, `:184`가 ENGINEER에 `CLIENT:READ`를 부여한다. 페이로드는 요약이 아니다: `client.service.ts:36-61`이 `users: { include: { user: { select: { id, name, email, image, isActive, roles } } } }` 와 **`srs: true`(전체 SR 행 — 제목·설명·우선순위·해결/거절 사유 전문)** 를 포함한다. 대조적으로 목록 엔드포인트 `src/app/api/clients/route.ts:31-34`는 외부 사용자에 `where.id = { in: userClientIds }`를 정확히 적용한다.

**영향**
고객사 X의 CLIENT_ADMIN이 클라이언트 ID를 열거해(`src/app/api/clients/public/route.ts:14-26`이 **미인증으로** 모든 활성 클라이언트의 id+name+code를 반환) `/api/clients/<피해자ID>`를 GET하면 피해 테넌트의 **전체 SR 이력 + 모든 사용자의 이름·이메일·역할**을 수신한다. `canReadSR`(`policies.ts:47-51`)로 자기 배정 SR만 봐야 하는 ENGINEER도 이 엔드포인트로 동일한 전량 덤프를 얻는다.

**수정 방안**

1. 상세 엔드포인트에 목록과 동일한 격리 적용: `if (!isInternalUser(session.user) && !session.user.clientIds.includes(id)) throw new ForbiddenError(...)`.
2. 더 근본적으로 `canReadClient`를 `isAdmin || (canViewAll && isInternalUser(user)) || isMemberOfClient`로 변경 — 외부 사용자에게 `canViewAll` 단독은 불충분해야 한다.
3. `client.service.ts:60`의 `srs: true` 제거 — 클라이언트 상세 뷰에 무제한 SR 행을 임베드할 이유가 없다(`_count` 또는 `take: 20` + 명시적 select로 대체).
4. `/api/clients/public`을 id 제외 name만 반환하도록 축소하거나 가입 nonce를 요구.

---

### 3.7 [CRITICAL] PATCH /api/users/[id] — 자신의 clientIds에 타 테넌트를 추가하는 자가 권한상승

**파일**: `src/app/api/users/[id]/route.ts:50-59`, `src/lib/policies.ts:203-209`, `src/services/user.service.ts:303-310`

**문제**
`ensureCanUpdateUser(session.user, targetUser)`(`:50`)는 `isAdmin || hasUpdate || isSelf`(`policies.ts:203-209`)로 해석되며 `hasUpdate = hasPermissionFlag(user, 'USER:UPDATE')` — **targetUser에 대한 테넌트 술어가 없다**. `:54-59`가 `canManageOthers = ADMIN || USER:UPDATE`를 계산하고 true면 검증된 바디 전체를 통과시킨다. `userUpdateSchema`(`src/lib/schemas.ts:156-162`)는 `clientIds: z.array(z.string()).optional()`을 받고, `UserService.updateUser`(`user.service.ts:303-310`)는 이를 `clients: { deleteMany: {}, create: clientIds.map(clientId => ({ clientId })) }`로 적용한다 — **행위자가 해당 클라이언트를 다룰 수 있는지 검사하지 않는다**. `UserClient.status`는 기본값 `APPROVED`(`prisma/schema.prisma:161`)이고, JWT 콜백이 `trigger === 'update'` 시 모든 APPROVED 멤버십을 `token.clientIds`로 복사한다(`src/auth.ts:180-187,205`). `prisma/seed.ts:218`이 CLIENT_ADMIN에 `USER:UPDATE`를 부여한다.

**영향**
고객사 X의 CLIENT_ADMIN이 `PATCH /api/users/<본인 id>`에 `{"clientIds":["<X>","<피해자Y>"]}`를 보내고 세션 갱신을 트리거하면, `clientIds`에 Y가 포함된다. 이후 `canReadSR`/`canUpdateSR`의 `belongsToClient`(`policies.ts:56,90`), `/api/srs` 목록 스코핑, 대시보드 통계 쿼리가 모두 그를 테넌트 Y의 구성원으로 취급한다 — **타 고객사 서비스 요청·댓글·첨부의 전체 읽기 및 쓰기**. 동일 호출로 타 테넌트 임의 사용자를 비활성화(`isActive: false`)하거나 이메일을 탈취할 수도 있다.

**수정 방안**

1. `isInternalUser(session.user)` 이거나 `targetUser.clientIds ⊆ session.user.clientIds` 일 때만 비-ADMIN의 타인 수정 허용.
2. 행위자가 ADMIN/MANAGER가 아니면 페이로드에서 `clientIds`를 제거하고, 그 외에는 제출된 모든 `clientId`를 `session.user.clientIds`에 대해 검증.
3. 멤버십을 `status: 'PENDING'`으로 생성(가입 플로우 `src/app/(auth)/register/actions.ts:112`와 일치)해 승인자가 항상 개입하게 한다.

---

### 3.8 [HIGH] PATCH /api/srs/[id] — 테넌트 사용자가 자기 SR을 타 테넌트로 이동 가능

**파일**: `src/services/sr.service.ts:152-171, 206`, `src/lib/schemas.ts:105`

**문제**
`srUpdateSchema`가 자유 형식 `clientId`를 허용한다(`schemas.ts:105`). `updateSR`은 `ensureCanUpdateSR(sessionUser, existingSR)`(`sr.service.ts:149`)로 — 즉 SR의 **현재** clientId에 대해 — 인가한 뒤, `:152-171`에서 클라이언트 변경을 (a) 상태가 여전히 REQUESTED인지, (b) 새 클라이언트가 존재하고 isActive인지만 검증한다. `sessionUser.clientIds.includes(validated.clientId)` 검사가 **어디에도 없다**. `:206`이 `if (validated.clientId !== undefined) updateData.clientId = validated.clientId;`로 그대로 적용한다. 라우트(`src/app/api/srs/[id]/route.ts:57-71`)는 `'권한 체크는 서비스 레이어에서 처리'` 주석과 함께 바디를 통과시킨다. 대상 클라이언트 id는 미인증 `/api/clients/public`으로 자유롭게 얻는다.

**영향**
테넌트 X의 CLIENT_USER/CLIENT_ADMIN이 자신의 REQUESTED SR(방금 첨부와 댓글을 붙인 것 포함)에 `{"clientId":"<피해 테넌트 Y>"}`를 PATCH하면, SR과 댓글 스레드와 업로드 파일이 테넌트 Y의 격리 경계 안으로 들어간다 — Y의 `/api/srs` 목록, 대시보드 카운트, CSV 내보내기, 클라이언트 상세 페이로드에 나타난다. **교차 테넌트 데이터 주입**이며 첨부가 함께 이동하므로 타 고객사 워크스페이스로의 악성 파일 전달 채널이 된다. 테넌트별 SR 카운트와 SLA 리포팅도 조용히 오염된다. 생성 경로에는 대칭 검사가 존재한다(`src/app/api/srs/route.ts:88-93`) — update만 빠뜨렸다.

**수정 방안**
`updateSR`에서 `validated.clientId !== existingSR.clientId`일 때 `isInternalUser(sessionUser) || sessionUser.clientIds.includes(validated.clientId)`를 요구하고 아니면 ForbiddenError. 더 나은 방법은 `srUpdateSchema`에서 `clientId`를 완전히 제거하고 재배정을 내부 전용 엔드포인트로 노출하는 것이다.

---

### 3.9 [HIGH] createSRAction — 주 생성 경로가 클라이언트 소속 검증을 하지 않음

**파일**: `src/actions/sr.actions.ts:23-36`, `src/services/sr.service.ts:38-52`

**문제**
`createSRAction`은 클라이언트 제출 FormData에서 페이로드를 만들고(`sr-form.utils.ts:12-14`의 `Object.fromEntries`), `srCreateSchema`로 검증한 뒤 `authenticateAndAuthorize(PERMISSIONS.SR.CREATE)`(`:34`)를 거쳐 `srService.createSR`(`:36`)로 넘긴다. `createSR`(`sr.service.ts:38-52`)은 `ensureCanCreateSR(sessionUser)` — `policies.ts:33-35`, SR/클라이언트 인자 없는 권한 전용 검사 — 만 하고 클라이언트가 존재·활성인지만 확인한다. `validated.clientId`가 `sessionUser.clientIds`와 비교되는 곳이 없다. REST 라우트에는 이 가드가 있으나(`src/app/api/srs/route.ts:88-93`) **UI는 그 경로를 쓰지 않는다** — `hooks/useCreateSRForm.ts:157`이 clientId 폼 필드를 붙이고 `:164`가 `createSRAction`을 호출한다.

**영향**
고객사 A의 CLIENT_USER가 생성 폼(또는 서버 액션 직접 호출)에 타 클라이언트 id를 넣으면 SR이 고객사 B의 테넌트에 기록된다 — B의 SR 목록, 대시보드 카운트, 관리자 큐, CSV 내보내기에 나타나고 B의 운영자가 접수·배정한다. REST 라우트의 멀티테넌트 가드가 **실제 사용 경로에서 완전히 우회**된다.

**수정 방안**
테넌트 검사를 `srService.createSR`로 이동(라우트와 액션의 공통 choke point). 클라이언트 로드 후 `isInternalUser(sessionUser) || sessionUser.clientIds.includes(validated.clientId)`가 아니면 ForbiddenError. `serviceCategoryId`도 동일하게(카테고리의 clientId가 null도 아니고 SR의 clientId도 아니면 거부). 그 후 `api/srs/route.ts:88-93`의 중복 검사를 제거.

---

### 3.10 [HIGH] GET /api/users/[id] — USER:READ 보유자가 모든 테넌트의 사용자 프로필 조회

**파일**: `src/app/api/users/[id]/route.ts:27`, `src/lib/policies.ts:191-201`

**문제**
`ensureCanReadUser(session.user, user)` → `canReadUser`(`policies.ts:191-201`)는 `isAdmin || canViewAll || isSelf`를 반환하며 `canViewAll = hasPermissionFlag(user, 'USER:READ')`. `targetUser` 인자는 `isSelf` 분기에서만 사용된다. `prisma/seed.ts:218`이 CLIENT_ADMIN에 `USER:READ`를 부여한다. 응답은 `userService.getUserById(id)`로 roles-with-permissions와 `clients: { include: { client: true } }`를 포함한다(`user.service.ts:47-55, 96-103`). 목록 엔드포인트(`src/app/api/users/route.ts:26-41`)는 외부 사용자를 `{ in: userClientIds }`로 제한하는데 상세만 빠져 있다.

**영향**
CLIENT_ADMIN(또는 USER:READ를 가진 커스텀 역할)이 시스템 내 임의 사용자의 이메일·활성 플래그·모든 역할과 권한 집합·모든 클라이언트 멤버십을 읽는다. 내부 ADMIN/MANAGER/ENGINEER 계정도 포함된다 — 3.7의 권한상승 경로를 위한 정찰(어떤 계정이 어떤 권한을 갖는지, 어떤 client id가 존재하는지)에 직접 유용하다. 서버 액션 `getUserAction`(`src/actions/user.actions.ts:87`)에도 동일한 구멍이 있다.

**수정 방안**
`canReadUser`에 테넌트 술어 추가 — 비내부 행위자에 대해 `targetUser.clients`가 `actor.clientIds`와 교집합을 갖도록 요구. 로드된 `clients` 관계를 정책에 전달하도록 `UserIdentity`(`policies.ts:23`)를 `Pick<User,'id'> & { clients: {clientId:string}[] }`로 확장하면 라우트와 액션이 동시에 보호된다.

---

### 3.11 [HIGH] ROLE:UPDATE 보유자가 자기 역할에 모든 권한 부여 가능 + 서버 액션 경로는 ADMIN 가드 자체가 없음

**파일**: `src/app/api/roles/[id]/permissions/route.ts:43-69`, `src/actions/role.actions.ts:38-73, 113-127`

**문제**
`ensureCanUpdateRole(session.user, role)`(`:43`)은 이름이 정확히 'ADMIN'인 역할만 차단하고(`policies.ts:264-271, 305-312`) 그 외에는 `ROLE:UPDATE` 보유자를 통과시킨다. **행위자가 자신이 보유한 역할을 대상으로 삼는 것을 막지 않으며**, 부여되는 `permissionIds`를 행위자가 이미 가진 권한으로 제한하지도 않는다(`:47-69`는 id 존재만 확인). 서버 액션 경로는 더 나쁘다 — `updateRolePermissionsAction`(`role.actions.ts:113-127`)은 `authenticateAndAuthorize('role:update_permissions')` 후 `roleService.updateRolePermissions()`를 호출할 뿐 **`ensureCanUpdateRole` 호출이 없고**, `updateRoleAction`/`deleteRoleAction`(`:38-73`)도 마찬가지다. 즉 `policies.ts:305-321`이 단언하는 'ADMIN 역할 불변', '시스템 역할 삭제 불가' 불변식이 **REST 경로에서만** 강제된다.

**영향**
`ROLE:UPDATE`를 가진 커스텀 역할(이 제품은 관리자가 그런 역할을 만들도록 존재한다)은 **사실상 풀 어드민 등가**다. 보유자가 `GET /api/permissions`의 전체 권한 id 목록과 함께 자기 역할 id를 POST하면 즉시 `USER:*`, `CLIENT:*`, `SR:DELETE`, `ROLE:ASSIGN`을 획득한다. `updateRolePermissionsAction`으로는 ADMIN 역할의 권한을 재작성하거나 `updateRoleAction`으로 이름을 변경해 코드베이스 전역의 `roles.includes('ADMIN')` 검사를 무력화할 수 있다.

**수정 방안**

1. `updateRoleAction`, `deleteRoleAction`, `updateRolePermissionsAction`에 `ensureCanUpdateRole`/`ensureCanDeleteRole` 추가 — 또는 가드를 `RoleService` 내부로 이동해 두 진입점이 불변식을 공유하게 한다.
2. 무단 상승 방지 규칙: 행위자가 이미 보유하지 않은 `RESOURCE:ACTION`의 permissionId는 거부(ADMIN 제외).
3. `roleId`가 행위자 자신의 역할 중 하나면 거부(ADMIN 제외).
4. 역할 이름 보호: 'ADMIN'으로의 **개명**도 금지.

---

### 3.12 [HIGH] 스테이징 Postgres(5433)와 앱(3001)이 커밋된 자격증명으로 호스트에 공개

**파일**: `docker-compose.test.yml:8-9, 35-39`, `scripts/setup-server.sh:41-42`

**문제**
`docker-compose.test.yml:38-39`가 `db-test`를 `'5433:5432'`로 공개하며 자격증명은 `POSTGRES_USER=lkind` / `POSTGRES_PASSWORD=sr1234`(`:35-36`, 커밋된 `.env.docker.test:3`과 동일). `:8-9`가 `app-test`를 `'3001:3000'`으로 공개. `setup-server.sh:41-42`가 명시적으로 3001 포트를 방화벽 개방한다. Docker의 published port는 DOCKER iptables 체인에 규칙을 삽입해 firewalld 존 규칙을 우회하므로 방화벽 설정과 무관하게 도달 가능하다. `docker-compose.prod.yml:23`은 `expose: '3000'`을 쓰고 DB 포트를 주석 처리해(`:57-60`) 정반대의 올바른 처리를 한다.

**영향**
(a) `psql -h <vm-ip> -p 5433 -U lkind`에 저장소에 공개된 비밀번호로 접속하면 스테이징 DB 전체 읽기/쓰기. (b) :3001로 앱에 도달하면 nginx를 완전히 우회 — TLS 없이 평문 HTTP로 세션 쿠키가 오가고, 결정적으로 **공격자가 `X-Real-IP`를 완전히 통제**한다. `getClientIp`(`src/lib/rate-limiter.ts:262-265`)가 이를 무조건 신뢰하므로 헤더를 회전시키면 로그인 제한을 포함한 모든 레이트리밋이 무력화되어 무제한 자격증명 브루트포스가 가능하다.

**수정 방안**

1. `docker-compose.test.yml`에서 두 `ports:` 블록 제거(`expose:`만 유지), 기존 nginx `test.lkindo.kr` 서버 블록(`nginx/nginx.conf:86`)을 통해 라우팅.
2. `setup-server.sh`에서 3001 방화벽 규칙 제거.
3. 호스트 DB 접근이 필요하면 `127.0.0.1:5433:5432`로 루프백 바인딩 + SSH 터널.
4. `getClientIp`가 직접 피어가 신뢰된 프록시일 때만 `X-Real-IP`/`X-Forwarded-For`를 신뢰하도록 변경(또는 `TRUST_PROXY` env 플래그 게이트).
5. 스테이징 DB에 별도 생성 비밀번호 부여.

---

### 3.13 [HIGH] 프로덕션 DB 비밀번호가 docker-compose.prod.yml에 하드코딩

**파일**: `docker-compose.prod.yml:53-56`, `.env.docker:4-5`

**문제**
`docker-compose.prod.yml:53-56`이 `POSTGRES_USER=lkind`, `POSTGRES_PASSWORD=sr1234`, `POSTGRES_DB=sr_db`를 추적되는 파일에 리터럴로 설정하고, 대응하는 연결 문자열이 추적되는 `.env.docker:4-5`(`postgresql://lkind:sr1234@db:5432/sr_db`)에 있다. 동일 비밀번호가 `docker-compose.test.yml:36`과 `.env.docker.test:2-3`에도 반복된다. `deploy.yml:70`이 매 푸시마다 `docker-compose.prod.yml`을 VM에 배포한다.

**영향**
프로덕션 DB를 보호하는 8자 사전 단어 비밀번호가 저장소 읽기 권한자 전원에게 공개되어 있다. prod DB 포트가 공개되지 않았으므로(`docker-compose.prod.yml:57-60`) 원격 직접 접근은 오늘 불가하나, `sr-net` 브리지에 올라오는 모든 것, `docker exec`, 함께 배포되는 백업/복구 스크립트, 그리고 누군가 디버깅을 위해 ports 라인의 주석을 푸는 순간의 자격증명이다. 로테이션이 추적 파일 수정을 의미하므로 **커밋 없이는 회전할 수 없고**, 이것이 값을 고착시킨다.

**수정 방안**
`POSTGRES_USER`/`POSTGRES_PASSWORD`를 두 compose 파일 밖의 비추적 env 파일(또는 Docker secrets)로 이동해 GitHub Actions Secrets에서 배포 잡이 전달. `.gitignore`/`.dockerignore`에 `.env.docker*` 추가. NextAuth 시크릿과 함께 로테이션하고 이력에서 삭제.

---

### 3.14 [HIGH] BigInt fileSize 직렬화 누락 — 첨부파일 REST 기능 전체가 500

**파일**: `src/lib/serialization.ts:37-43`, `prisma/schema.prisma:354`

**문제**
`schema.prisma:354`가 `fileSize BigInt @map("file_size")`를 선언하고(`prisma/migrations/20260623055403_db_optimization/migration.sql:320`에서 컬럼이 BIGINT임을 확인), Prisma가 JS `bigint`로 하이드레이트한다. `JSON.stringify`는 BigInt에서 `TypeError`를 던지며 `NextResponse.json`은 `JSON.stringify`다. 프로젝트 자체 직렬화기가 이를 처리하지 않는다 — `serialization.ts:37-43`이 `if (typeof value !== 'object') { return value; }`로 bigint를 **의도적으로 그대로 통과**시킨다. 저장소 전역 `BigInt` grep 결과 `BigInt.prototype.toJSON` 폴리필도 replacer도 없다.

영향받는 호출 지점: `src/app/api/srs/[id]/route.ts:41-50`(GET, `getSRDetailsById`가 `attachments`를 무필터 포함 — `sr.service.ts:492`), `src/app/api/srs/[id]/attachments/route.ts:208`(GET) 및 `:168`(POST), `src/app/api/attachments/route.ts:87`(POST), `src/app/api/attachments/[id]/route.ts:41`(GET), `src/app/api/srs/[id]/intake/route.ts:298+313`.

**영향**
첨부가 하나라도 있는 SR은 `GET /api/srs/[id]`와 `GET /api/srs/[id]/attachments`가 핸들러 내부에서 throw하고 `withAuth`의 catch(`auth-wrapper.ts:76-83`)가 500으로 변환한다. 실제 소비자가 깨진다: `SRAttachments.tsx:44-53`이 매 로드마다 `'첨부파일을 불러오는데 실패했습니다'` 토스트, `useEditSRForm.ts:97-106`이 빈 `catch {}` 안에서 fetch하므로 **수정 다이얼로그가 기존 첨부를 조용히 0개로 표시**해 사용자가 재업로드하거나 파일을 잃는다, `useIntakeForm.ts:71-73`이 첨부 있는 SR의 접수를 `'SR을 불러오는데 실패했습니다'`로 중단시킨다. 업로드도 성공 응답에서 500이 나는데 **파일은 디스크에 기록되고 행도 생성된 뒤**이므로, UI가 성공한 쓰기를 실패로 보고하고 사용자가 재시도해 중복 파일과 고아 행을 만든다. 서버 액션 경로(`getSRDetailsAction`)는 RSC 직렬화기가 bigint를 지원해 동작하므로 페이지에서는 보이지 않고 REST 표면에서만 치명적이다.

**수정 방안**

1. `deepSerialize`의 `typeof value !== 'object'` 탈출 전에 `if (typeof value === 'bigint') return Number(value);` 추가(10MB 상한이므로 안전).
2. 위에 열거한 모든 첨부 반환 라우트를 `serializeResponse`를 거치도록 수정.
3. `serializeResponse({ fileSize: 10n })`이 `{ fileSize: 10 }`을 내는 단위 테스트 + 첨부가 비지 않은 배열로 200을 반환하는 라우트 테스트 추가.

---

### 3.15 [HIGH] DELETE /api/srs/[id] — SR 삭제 성공 후 항상 500 반환

**파일**: `src/app/api/srs/[id]/route.ts:82`, `src/services/sr.service.ts:574-604`

**문제**

```ts
const result = await srService.deleteSR(id, session.user);
return NextResponse.json(result);
```

`srService.deleteSR`은 `Promise<void>`로 선언되어 있고(`sr.service.ts:574`) 마지막 문장이 반환 없는 `emitRealtimeEvent(...)`(`:594-604`)이므로 `result`는 항상 `undefined`다. `NextResponse.json`은 WHATWG `Response.json`에 위임하며(설치된 next@16.1.6의 `node_modules/next/dist/server/web/spec-extension/response.js:94-97` 확인), `Response.json`의 직렬화 단계는 `JSON.stringify`가 undefined를 반환하면 TypeError를 던진다.

**영향**
`sr.service.ts:579-593`의 트랜잭션은 이미 커밋되었고(감사 로그 기록, SR 행 삭제) SR_DELETED 실시간 이벤트도 이미 발행된 뒤 응답이 터진다. 호출자는 **완전히 성공한 작업에 대해 500**을 받는다. 5xx 재시도 로직이 있는 클라이언트는 DELETE를 재발행하고 `sr.service.ts:576`의 NotFoundError로 404를 받아 "삭제가 안 됐다"고 읽는다. UI가 `deleteSRAction`(`src/actions/sr.actions.ts:70-75`)으로 삭제하고 REST 라우트를 아무도 호출하지 않아 현재는 보이지 않으며, 테스트도 없다(`src/app/api/srs/[id]` 하위에 `__tests__` 없음).

**수정 방안**
명시적 바디 반환: `return NextResponse.json({ success: true, message: 'SR이 삭제되었습니다.' })` 또는 `return new NextResponse(null, { status: 204 })`. 일반적으로 `Promise<void>` 결과를 `NextResponse.json`에 넘기지 않는 규칙을 세운다.

---

### 3.16 [HIGH] PATCH /api/users/[id]/client — 아무것도 쓰지 않고 200 + 성공 바디 반환

**파일**: `src/app/api/users/[id]/client/route.ts:193`, `src/components/users/ClientAssignDropdown.tsx:45-62`, `ClientBadgeWithActions.tsx:80-98`

**문제**

```ts
if (ongoingSRs.length > 0 && !force) {
  return NextResponse.json({ success: false, warning: true, message: '진행 중인 SR이 있습니다', data: {...} }, { status: 200 });
}
```

핸들러는 `:219-233`의 `userClient.update`/`create` **이전에 반환**하므로 아무것도 영속화되지 않는다 — 그런데 상태 코드는 200이다. 두 호출자 모두 `force`를 보내지 않는다: `ClientAssignDropdown.tsx:45-49`는 `JSON.stringify({ clientId })`만, `ClientBadgeWithActions.tsx:80-86`도 마찬가지. 그리고 둘 다 `result.warning`을 분기해 **성공 토스트**를 낸다 — `:62`의 `'...고객사가 할당되었지만, SR 재할당을 권장합니다.'`, `:98`의 `'...고객사가 변경되었지만, SR 재할당을 권장합니다.'` — 그 후 `onAssigned?.()` / `onChanged?.()`로 목록을 새로고침한다.

**영향**
REQUESTED/INTAKE/IN_PROGRESS/ON_HOLD 상태 SR에 요청자·담당자·접수자로 걸린 사용자는 **UI로 절대 다른 고객사에 이동시킬 수 없으며**, 관리자는 명시적으로 "이동했다"는 안내를 받는다. 목록이 갱신되어도 여전히 이전 고객사가 보이므로, 거부된 작업이 아니라 캐시 오류로 읽힌다. `force`가 UI에서 도달 불가하므로 활성 사용자에 대한 재배정 기능 전체가 영구히 막혀 있으면서 성공을 보고한다.

**수정 방안**

1. 차단 케이스를 `409 Conflict` + `{ error, code: 'ONGOING_SRS', data: {...} }`로 반환해 `response.ok`가 false가 되게 하고, 두 컴포넌트의 기존 `throw new Error(result.error)` 경로가 발화하도록 한다.
2. 관리자 확인 후 `{ clientId, force: true }`로 재POST하는 명시적 확인 단계 추가.
3. 이 라우트를 `withAuthAndRateLimit`으로 전환(현재 `:94`에서 `auth()`를 직접 호출하고 레이트리밋이 없음)하고 바디를 zod로 검증(`:101-102`, `:190`이 `await request.json()`에서 직접 읽음).

---

### 3.17 [HIGH] 관리자 비밀번호 재설정이 스키마에서 조용히 탈락하는 무동작

> **✅ 해결됨 (2026-08-01).** `userUpdateSchema` 에 `password: passwordSchema.optional()` 추가,
> `UserService.updateUser` 가 prisma update 전에 bcrypt(work factor 12)로 해싱한다.
> 서비스 계층에서 처리하므로 API 라우트와 서버 액션이 함께 보호된다.
> 타인의 비밀번호 변경은 `USER:UPDATE` 보유자로 게이트하고, 권한 없는 요청은 **조용히 버리지 않고
> 403** 으로 거부한다(본인 변경은 현재 비밀번호를 요구하는 `changePasswordAction` 을 거쳐야 하며,
> 이 라우트로 우회하면 그 확인 절차가 무력해진다).
> 감사 로그에는 해시도 남기지 않고 `passwordReset: true` 플래그만 남긴다.
> 다이얼로그의 클라이언트 검증·힌트를 `passwordSchema` 실제 규칙과 일치시켰다.
> **셀프 서비스 재설정 플로우는 소유자 결정(2026-08-01)으로 이번 범위에서 제외**하고,
> 로그인 화면에 관리자 문의 안내를 노출해 막다른 길을 없앴다.
> 회귀 테스트: `src/services/__tests__/user.service.password-reset.test.ts` (12건),
> `src/app/api/users/[id]/__tests__/route.password-reset.test.ts` (4건).

**파일**: `src/lib/schemas.ts:156-162`, `src/components/users/UserDialog.tsx:256-257, 428`

**문제**
`userUpdateSchema`(`schemas.ts:156-162`)는 name/email/image/isActive/clientIds만 선언하며 **`password` 키가 없다** — zod 객체는 기본적으로 알 수 없는 키를 제거한다. `UserDialog.tsx:428`은 수정 모드에서 `'비밀번호 (변경 시에만 입력)'` 레이블로 필드를 렌더링하고, `:209`에서 `'비밀번호는 최소 8자 이상이어야 합니다.'`로 검증한 뒤 `:256-257`에서 `if (password) { payload.password = password; }`로 PATCH 페이로드에 붙인다. 수신 핸들러 `src/app/api/users/[id]/route.ts:40`이 `validateRequestBody(request, userUpdateSchema)`(= `schema.parse`)를 수행하고, `UserService.updateUser`가 `user.service.ts:237`에서 동일 스키마로 재파싱한 뒤 prisma update에 스프레드한다. 비밀번호는 DB에 도달하지 않지만 라우트는 200을 반환하고 `UserDialog.tsx:275-278`이 `'사용자가 수정되었습니다.'` 토스트를 낸다.

**영향**
관리자가 잠긴 사용자의 비밀번호를 재설정하면 성공 토스트를 보지만 비밀번호는 변경되지 않아 사용자는 여전히 로그인할 수 없다. **셀프 서비스 비밀번호 재설정 플로우도 존재하지 않으므로**(`src/app/(auth)/`에 login/register만 있고 forgot-password 페이지 없음, `grep '비밀번호 찾기|forgot|reset-password' src/` 무결과) 이것이 제품의 유일한 계정 복구 수단이며 그것이 작동하지 않는다. 동일한 조용한 제거가 `userType`에도 적용되어 수정 다이얼로그에서 사용자 유형 변경도 무동작이다.

**수정 방안**

1. `userUpdateSchema`에 `password: passwordSchema.optional()` 추가하고, `UserService.updateUser`에서 prisma update 전에 해싱(행위자가 `USER:UPDATE`를 보유하고 자기 수정 경로(`route.ts:57-59`)가 아닐 때로 게이트).
2. 다이얼로그의 클라이언트 측 힌트를 `passwordSchema`의 실제 규칙(최소 8자 + 대/소문자·숫자·특수문자)과 일치시킨다.
3. 토큰 기반 재설정 플로우(모델 + 기존 `emailService` 이용)를 추가하거나, 최소한 로그인 페이지에 `'비밀번호를 잊으셨나요? 관리자에게 문의하세요'` 안내를 노출해 막다른 길을 발견 가능하게 한다.

---

### 3.18 [HIGH] 서비스 카테고리 생성 UI 부재 — 신규 고객사는 SR을 한 건도 받을 수 없음

> **✅ 해결됨 (2026-08-01).** 수정방안 3개를 모두 적용했다.
>
> 1. `src/components/clients/ServiceCategoryDialog.tsx` 추가 + 고객사 상세 탭에
>    "카테고리 추가" 버튼 연결. 빈 상태에도 "카테고리가 없으면 SR을 접수할 수 없습니다"
>    안내와 생성 버튼을 넣어 막다른 길을 없앴다.
> 2. `PATCH`/`DELETE /api/clients/[id]/categories/[categoryId]` 추가 + 행 단위 편집·삭제 액션.
>    경로 파라미터가 둘이라 **IDOR 표면**이 생기므로 카테고리가 실제로 그 고객사의 것인지
>    검증하고, 바디의 `clientId` 는 무시한다(카테고리를 타 고객사로 옮기는 경로 차단).
>    SR 이 연결된 카테고리는 서비스 계층이 막고, UI 는 그 사유("비활성화를 사용하세요")를
>    그대로 노출한다.
> 3. `ClientService.createClient` 가 **같은 트랜잭션에서** 기본 카테고리
>    (`일반 요청`, SLA 24h, MEDIUM)를 시드한다. 트랜잭션 밖이면 카테고리 생성만 실패해도
>    "SR 을 받을 수 없는 고객사"가 남는다.
>
> 회귀 테스트: `categories/[categoryId]/__tests__/route.test.ts` (10건, IDOR 포함),
> `client.service.default-category.test.ts` (5건).

**파일**: `src/app/(dashboard)/clients/[id]/page.tsx:399-458`, `src/hooks/useCreateSRForm.ts:143`

**문제**
클라이언트 상세 페이지의 서비스 카테고리 탭은 완전히 읽기 전용이다. `:399-458`은 헤더, 빈 상태(`'등록된 서비스 카테고리가 없습니다.'`, `:415`), 기존 카테고리 테이블만 렌더링한다 — 생성 버튼도, 편집·삭제 액션도, 카테고리 다이얼로그 컴포넌트도 `src/components` 어디에도 없다. 백엔드는 존재한다: `src/app/api/clients/[id]/categories/route.ts:45`의 POST와 `src/services/service-category.service.ts:149`의 `create()`. **앱에서 이를 호출하는 곳이 없다.** SR 생성은 카테고리를 하드 요구한다: `useCreateSRForm.ts:143`이 `if (!clientId || !categoryId)`로 제출을 차단하고, `CreateSRDialog.tsx:148`이 `disabled={loading || categories.length === 0}`로 셀렉트를 비활성화하며 `'카테고리가 없습니다'`(`:153`)를 표시한다. 스키마도 필수다(`prisma/schema.prisma:252`, non-nullable).

**영향**
ADMIN이 ClientDialog(유일한 클라이언트 생성 경로)로 신규 클라이언트를 만들면 서비스 카테고리가 0개다. 그 클라이언트를 선택한 사용자는 영구히 비활성화된 카테고리 드롭다운을 보고, 제출 핸들러는 `:143`에서 조용히 반환한다. 클라이언트는 서류상 온보딩 완료(목록에 보이고 사용자 배정 가능)이지만 **구조적으로 단 한 건의 서비스 요청도 받을 수 없으며**, 제품 내에 이를 고칠 방법이 없다. 유일한 해결책은 curl로 POST하거나 수동 DB insert다.

**수정 방안**

1. `ServiceCategoryDialog`를 추가(ClientDialog 패턴 미러링)하고 `:402-409`의 탭 헤더에 `'카테고리 추가'` 버튼을 연결해 기존 POST 엔드포인트로 전송.
2. 해당 라우트에 PATCH/DELETE 핸들러와 행 단위 편집·삭제 액션 추가(`serviceCategoryService.update()`는 `:195`에 이미 있음).
3. 안전망으로 `client.service.create()`가 동일 트랜잭션에서 기본 `'일반 요청'` 카테고리(slaHours 24, MEDIUM)를 시드하게 해 신규 클라이언트가 막다른 길이 되지 않게 한다.

---

### 3.19 [HIGH] SR 카테고리 드롭다운이 클라이언트로 스코프되지 않고, 서버도 소속을 검증하지 않음

> **✅ 해결됨 (2026-08-01).** 서버 측 검증(`SRService.ensureCategoryBelongsToClient`)은
> 앞선 작업에서 이미 `createSR`/`updateSR` 양쪽에 걸려 있었다. 이번에 남은 클라이언트 측을 닫았다.
>
> - `getServiceCategoriesForSelection(clientId?)` 로 스코프 인자를 받고,
>   외부 사용자가 임의 clientId 를 넣지 못하도록 `ensureCanReadClient` 로 소속을 검증한다.
> - `getForSelection` 의 where 를 `OR: [{ clientId }, { clientId: null }]` 로 바꿨다.
>   정확히 일치만 걸면 **전역 카테고리가 사라져 신규 고객사의 선택지가 0개**가 된다
>   (서버의 `ensureCategoryBelongsToClient` 가 허용하는 범위와 정확히 일치시킨 것).
> - `useCreateSRForm`/`useEditSRForm` 이 고객사 선택 이후에만 카테고리를 조회하고,
>   고객사가 바뀌면 이전 선택(`categoryId`)을 비운다 — 바뀐 고객사에 없는 id 가
>   그대로 제출되는 것을 막는다.
>
> 회귀 테스트: `service-category.actions.security.test.ts`(테넌트 거부 포함),
> `service-category.service.coverage.test.ts`, `CreateSRDialog.test.tsx`.

**파일**: `src/actions/service-category.actions.ts:15-17`, `src/services/service-category.service.ts:105-121`, `src/services/sr.service.ts:78, 244-245`

**문제**
`getServiceCategoriesForSelection()`은 인자를 받지 않고 `serviceCategoryService.getForSelection()`을 clientId 없이 호출한다(`:17`). `getForSelection`(`service-category.service.ts:105-121`)은 `...(clientId && { clientId })`를 적용하므로 인자 생략 시 **모든 클라이언트의 활성 카테고리 전체**를 반환한다. 두 SR 폼 모두 이렇게 호출한다: `useCreateSRForm.ts:73-76`, `useEditSRForm.ts:84-87`. 그리고 clientId 변경 시 재조회하지 않는다(`useCreateSRForm.ts:96`이 `open`에만 반응). 서버에서는 `srService.createSR`(`sr.service.ts:38-80`)이 클라이언트 존재·활성만 확인하고(`:43`) `:78`에서 `serviceCategoryId: validated.serviceCategoryId`를 카테고리의 clientId 일치 검사 없이 기록한다. 업데이트 경로(`:244-245`)도 동일. 이 액션은 인증만 하고 권한 검사도 없다(`:15`).

**영향**
SR을 생성하는 모든 사용자가 **타 고객사의 카테고리 명칭과 SLA 시간이 담긴 목록**을 본다(가장 많이 쓰이는 다이얼로그에서의 교차 테넌트 정보 유출). 그리고 외부 카테고리를 자기 SR에 붙일 수 있다. 하류로 SLA 계산이 오염된다 — 접수 라우트가 `sr.serviceCategory.slaHours`에서 dueDate를 도출한다(`src/app/api/srs/[id]/intake/route.ts:101-105`). 스키마가 설계한 고객사별 카테고리 리포팅도 깨진다. 부수적으로 이것이 3.18의 카테고리 관리 UI 부재가 지금까지 눈에 띄지 않은 이유다 — 신규 클라이언트가 남의 카탈로그를 조용히 상속받는다.

**수정 방안**
`getServiceCategoriesForSelection`에 필수 `clientId` 인자를 부여하고, 두 훅에서 현재 선택된 clientId를 전달하며 변경 시 재조회. `srService.createSR`/`updateSR`에 카테고리의 clientId가 null이거나 SR의 clientId와 같은지 검증(아니면 BusinessRuleError).

---

### 3.20 [HIGH] SSR /srs 페이지가 itemsPerPage를 무제한으로 수용 — 인증 사용자 1명이 컨테이너 OOM

**파일**: `src/app/(dashboard)/srs/page.tsx:25-26, 164-169`

**문제**

```ts
const page = parseInt(getSearchParam(resolvedSearchParams.page) ?? '1', 10);
const itemsPerPage = parseInt(getSearchParam(resolvedSearchParams.itemsPerPage) ?? '20', 10);
...
srService.getAllSRs({ where, orderBy, skip: (page - 1) * itemsPerPage, take: itemsPerPage })
```

클램프도, 범위 검사도, NaN 검사도 없다. `sr.service.ts:513-521`이 skip/take를 그대로 `prisma.sR.findMany`로 넘긴다. API 경로는 올바르게 보호되어 있다 — `src/lib/pagination.ts:28-33`이 pageSize를 `.max(100)` + `.catch(20)`으로 제한 — 그러나 **페이지 컴포넌트가 그 헬퍼를 쓰지 않는다**. 결정적으로 이것은 페이지 GET이며, `src/proxy.ts:26-29`는 `pathname.startsWith('/api/')` 또는 next-action POST만 레이트리밋한다 — `/srs?itemsPerPage=1000000` GET은 **레이트리밋 분기를 완전히 건너뛴다**.

**영향**
인증된 아무 사용자나 URL 하나로 Prisma가 무제한 SR 행을 4개 조인 관계(`client`, `requester`, `assignee`, `serviceCategory`)와 행당 2개 상관 `_count` 서브쿼리(`sr.service.ts:526-566`)와 함께 하이드레이트하게 만들 수 있다. 동시에 5개의 `countSRs`(`page.tsx:170-186`)가 병렬 실행된다. 대상은 **450MB로 하드 캡된 힙**(`docker-compose.prod.yml:32`)의 단일 `sr-app` 컨테이너다. CSV 내보내기와 달리 ADMIN 역할이 필요 없고, 50k 상한도 없으며, 요청 예산도 없다 — 평범한 브라우저 내비게이션 루프로 컨테이너를 OOM-kill해 사이트를 다운시킬 수 있다. 부수적으로 `?page=abc`나 `?itemsPerPage=x`는 `take: NaN`을 만들어 `PrismaClientValidationError` → 서버 컴포넌트 throw → 페이지 500.

**수정 방안**

1. 페이지 경계에서 클램프: `const itemsPerPage = Math.min(Math.max(Number.isFinite(n) ? n : 20, 1), 100)`, page도 동일. 또는 `src/lib/pagination.ts`의 `paginationSchema`를 재사용해 SSR 페이지와 `/api/srs`가 하나의 상한을 공유하게 한다.
2. `src/proxy.ts`의 미들웨어 레이트리미터를 인증된 페이지 GET까지 확장.

---

### 3.21 [HIGH] intake POST가 도메인/실시간 이벤트를 발행하지 않아 담당자가 알림을 못 받음

> **✅ 해결됨 (2026-08-01).** POST 는 트랜잭션 커밋 후 `sr:status_changed`(요청자 알림) +
> `sr:assigned`(담당자 알림) + `SR_UPDATED` 실시간 이벤트를 발행한다.
> PATCH 에는 "새 담당자에게만 메일 발송" 이라는 **주석만 있고 구현이 없었다** — 재배정 시
> `sr:assigned` 를 발행하도록 채우고, 변경이 있으면 `SR_UPDATED` 도 발행한다.
> 발행은 모두 커밋 이후다(롤백된 트랜잭션에 대해 알림이 나가면 안 된다).
> 회귀 테스트: `src/app/api/srs/[id]/intake/__tests__/route.events.test.ts` (6건).
> 수정 전 구현에 대해 4건이 실패함을 확인했다.

**파일**: `src/app/api/srs/[id]/intake/route.ts:1-11, 119-143, 211-213`

**문제**
POST 핸들러가 REQUESTED → INTAKE 전이를 수행하고 `assignee: { connect: { id: validated.assigneeId } }`(`:119-143`)를 `prisma.$transaction` 내부에서 설정한 뒤 `:213`에서 반환한다 — `domainEvents.emit`도 `emitRealtimeEvent`도 호출하지 않는다. import 블록(`:1-11`)에 `'@/lib/domain-events'`도 `'@/lib/realtime-events'`도 없다. 저장소 전역 `domainEvents` grep 결과 발행자는 `src/services/sr.service.ts:115, 393, 405`(createSR, updateSR)뿐이다. 한편 `src/services/listeners/sr-notification.listener.ts:128-179`에는 push + `emailService.sendSRAssigned`를 수행하는 **완전히 구현된 `'sr:assigned'` 핸들러가 있고 이 경로는 그것을 절대 트리거하지 않는다.**

동일 파일의 PATCH(재배정) 경로는 더 노골적이다 — `:573`이 `// 새 담당자에게만 메일 발송 (담당자가 배정된 경우만)` 주석 한 줄이고 `:574`가 닫는 중괄호다. 이메일·푸시·이벤트 호출이 전혀 없다.

**영향**
정상 운영 워크플로(SR 목록 → 접수하기 → `/srs/{id}/intake`)로 배정된 엔지니어는 **이메일도 웹 푸시도 받지 못하고**, `sr:updated` SSE 이벤트도 브로드캐스트되지 않아 다른 모든 사용자의 SR 목록과 대시보드가 수동 새로고침 전까지 해당 SR을 미배정/REQUESTED로 계속 표시한다. 요청자도 상태 변경 알림을 받지 못한다. 알림은 거의 쓰이지 않는 일반 PATCH 경로로 배정했을 때만 발화한다. MANAGER가 엔지니어 A→B로 재배정하면 감사 추적은 정확하지만 **어느 쪽도 알지 못한다**.

**수정 방안**
접수 쓰기를 `SRService`(예: `srService.intakeSR`)로 이동해 `validateTransition`과 기존 emit 블록을 재사용하는 것이 근본책. 최소 수정으로는 트랜잭션 후 `domainEvents.emit('sr:assigned', ...)` + `domainEvents.emit('sr:status_changed', {previousStatus:'REQUESTED', currentStatus:'INTAKE', requesterId, ...})` + `emitRealtimeEvent(REALTIME_EVENTS.SR_UPDATED, {id, clientId, requesterId, assigneeId, actorId})` 추가. PATCH 재배정 경로에도 동일 적용(기존 리스너가 unassign 케이스를 올바르게 건너뛴다).

---

### 3.22 [HIGH] updateSR에 필드 단위 인가 부재 — 고객사 사용자가 SLA 마감일·우선순위·담당자를 덮어씀

**파일**: `src/services/sr.service.ts:149, 201-248`

**문제**
`updateSR`은 단 하나의 `ensureCanUpdateSR(sessionUser, existingSR)`(`:149`)로 요청 전체를 게이트한 뒤 `:201-248`에서 모든 스키마 필드를 `updateData`로 복사한다 — `dueDate`, `actualPriority`, `estimatedHours`, `intakeNotes`, `assigneeId` 포함. `canUpdateSR`(`policies.ts:87-100`)은 `SR:UPDATE`를 보유하고 `clientIds`가 `sr.clientId`를 포함하는 모든 사용자, 그리고 `SR:UPDATE_SELF`를 보유한 요청자에 대해 true를 반환한다. `prisma/seed.ts:216`이 CLIENT_ADMIN에 SR CREATE/READ/UPDATE/STATUS_CHANGE를, `:249`가 CLIENT_USER에 `SR:UPDATE_SELF`를 부여한다. **상태 전이만 역할 게이트되고 운영자 소유 접수 필드는 전혀 게이트되지 않는다.** 전용 intake PATCH 라우트는 동일 필드를 ADMIN/MANAGER로 제한한다(`intake/route.ts:327-334`).

**영향**
고객사의 CLIENT_ADMIN이 자기 클라이언트의 임의 SR에 `PATCH /api/srs/{id}`로 `{dueDate:'2030-01-01', actualPriority:'CRITICAL', assigneeId:'<임의 사용자 id>'}`를 보내 **SLA 마감일, 트리아지 우선순위, 배정 엔지니어를 재작성**한다. `api/dashboard/stats/route.ts:227`이 계산하는 `slaComplianceRate` 지표가 위조되고 작업이 조용히 재배정된다. CLIENT_USER도 `SR:UPDATE_SELF`로 자기 SR에 동일하게 할 수 있다.

**수정 방안**
업데이트 표면을 분리한다. 일반 경로에는 title/description/satisfactionRating/additionalFeedback(및 이미 게이트된 status)만 두고, `dueDate`/`actualPriority`/`estimatedHours`/`intakeNotes`/`assigneeId`는 `isInternalUser(sessionUser)` 또는 명시적 `SR:INTAKE`/`SR:ASSIGN` 권한이 없으면 거부. **`SRService.updateSR` 내부에서 강제**해야 API 라우트와 서버 액션이 동시에 보호된다.

---

### 3.23 [HIGH] 사용자 검증 없는 담당자 배정 — 비활성 사용자에게 배정 가능

**파일**: `src/services/sr.service.ts:248`, `src/app/api/srs/[id]/intake/route.ts:398-411`

**문제**
`updateSR`은 `if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;`(`:248`)만 하고 메서드 어디에도 `prisma.user` 조회가 없다. intake POST는 이를 가드한다 — `if (!assignee) throw new NotFoundError('담당자')`, `if (!assignee.isActive) throw new BadRequestError('비활성 상태의 사용자에게는 담당자를 배정할 수 없습니다.')`(`intake/route.ts:90-97`) — 그러나 **intake PATCH는 존재만 확인하고 `isActive`를 검사하지 않는다**(`:398-411`). `user.service.ts:414-415`는 비활성화 안전성이 배정 경로의 `isActive` 가드에 의존한다고 주석으로 명시하는데, 3개 경로 중 2개가 이를 구현하지 않는다.

**영향**
`PATCH /api/srs/{id}`에 `{assigneeId:'<비활성화된 사용자>'}`가 성공해 로그인할 수 없는 사람에게 배정된 고아 SR이 생긴다 — 정확히 `deactivateUser`가 방지하려던 상태이며(`user.service.ts:412-441`이 진행 중 SR이 있는 사용자의 비활성화를 트랜잭션 내에서 차단), 그 사용자는 이후 깨끗하게 비활성화할 수도 없다. 존재하지 않는 id를 넘기면 `errors.ts`가 매핑하지 않는 raw Prisma FK 에러가 500으로 표면화된다. CLIENT_USER를 엔지니어로 배정하는 것도 허용된다.

**수정 방안**
`assertAssignable(assigneeId)` 헬퍼를 추출해 사용자를 로드하고 부재·비활성·SR 처리 권한 부재 시 거부하며(`permissionService.getUsersWithPermissions` 기준 재사용), `SRService.updateSR`과 intake PATCH 라우트에서 호출. Prisma P2003을 `errors.ts`에서 400으로 매핑.

---

### 3.24 [HIGH] 유휴 타임아웃 자동 로그아웃이 자기 effect에 의해 취소되어 절대 실행되지 않음

> **✅ 해결됨 (2026-08-01).** `showWarningRef` 도입으로 `resetTimer` 를 안정화하고, 타이머 정리를
> 리스너 effect 의 cleanup 에서 분리(세션 종료·언마운트 전용 effect 로 이동)했다.
> 회귀 테스트: `src/components/providers/__tests__/IdleTimeoutProvider.test.tsx` (9건).
> 수정 전 구현에 대해 "경고 후 1분 뒤 로그아웃", "모달 중 활동이 로그아웃을 연기하지 못함",
> "모달 중 라우트 이동에도 로그아웃 유지" 3건이 실패함을 확인했다.

**파일**: `src/components/providers/IdleTimeoutProvider.tsx:33, 38-46, 61-68`

**문제**
`resetTimer`는 deps가 `[status, showWarning]`인 useCallback이다(`:46`). 유휴 타이머 콜백(`:38-45`)이 `setShowWarning(true)` 후 `warningTimerRef.current = setTimeout(handleLogout, WARNING_TIMEOUT)`을 건다. `showWarning` 설정이 `resetTimer`의 identity를 바꾸고, 이는 `:68` effect의 의존성이므로 React가 해당 effect의 cleanup(`:61-67`)을 실행한다 — `if (warningTimerRef.current) clearTimeout(warningTimerRef.current)`가 **한 틱 전에 건 60초 로그아웃 타이머를 죽인다**. effect 본문 재실행이 `resetTimer()`를 호출하지만 `:33`의 `if (showWarning) return;`으로 즉시 반환되어 아무것도 재무장되지 않는다.

**영향**
29분 유휴 후 `'세션 만료 경고'` 다이얼로그가 뜨지만 **약속된 자동 로그아웃은 결코 일어나지 않는다**. 방치된 워크스테이션이 모달을 띄운 채 무기한 인증 상태로 남는다 — 이 컴포넌트가 존재하는 이유인 보안 통제가 무력하다. 오버레이/ESC(`onOpenChange={setShowWarning}`, `:87`)로 다이얼로그를 닫아도 타이머가 전혀 무장되지 않은 채 로그인 상태가 유지된다.

**수정 방안**
`showWarning`이 `resetTimer`의 identity를 좌우하지 않게 한다: ref(`showWarningRef`)에 담아 `resetTimer` 내부에서 읽고, useCallback deps에서 `showWarning`을 제거하며 effect deps에서 `resetTimer`를 제거(핸들러를 ref로). 또는 로그아웃 타이머를 `showWarning`을 키로 하는 별도 effect에서 무장해 cleanup이 리스너 effect와 얽히지 않게 한다. fake timer로 `IDLE_TIMEOUT` 경과 후 `signOut` 호출을 단언하는 테스트 추가.

---

### 3.25 [HIGH] 컨테이너 UTC와 브라우저 KST 불일치 — SR 목록 날짜·마감 배지가 하이드레이션마다 달라짐

> **✅ 해결됨 (2026-08-01).** 공용 모듈 `src/lib/timezone.ts` 를 추가하고 날짜 경계 계산을
> 전부 KST 명시로 바꿨다 — `getDaysUntilDue`(일 경계), `SRListItem` 포맷터,
> SR 번호 채번(`appZoneDateStamp`), CSV 내보내기 날짜·파일명, 대시보드 30일 추이
> (`DATE(created_at AT TIME ZONE 'Asia/Seoul')` + 채움 루프 키 일치).
> 포맷터는 모듈 스코프에 1회만 생성해 기존의 "수동 포맷이 빠르다"는 성능 의도도 유지한다.
> 인프라: Dockerfile 런타임 스테이지에 `ENV TZ=Asia/Seoul` + tzdata, prod/staging compose 에
> `TZ`, Postgres 에 `PGTZ`/`TZ`.
> 회귀 테스트: `src/lib/__tests__/timezone.test.ts` (17건) — 2026-07-29T23:00Z(= KST 07-30)
> 시나리오로 UTC/KST 갈림을 직접 고정한다.

**파일**: `src/components/srs/SRListItem.tsx:18-33, 64`, `src/lib/date-utils.ts:1-13`, `Dockerfile`

**문제**
`formatFastDate`(`:18-24`)와 `formatFastShortDate`(`:27-33`)가 `d.getFullYear()/getMonth()/getDate()` — 전부 로컬 타임존 접근자 — 를 쓴다. `:64`의 `getDueDateStatus(sr.dueDate, sr.status)`가 호출하는 `getDaysUntilDue`(`date-utils.ts:1-13`)도 `today.setHours(0,0,0,0)` 기반 로컬 계산이다. 이들은 서버 컴포넌트 `src/app/(dashboard)/srs/page.tsx`에서 props를 받는 `'use client'` SRsDataTable의 자식인 SRTableRow/SRCardItem 내부에서 렌더링되므로 **서버에서 한 번, 브라우저에서 한 번** 렌더된다. `Dockerfile`에 TZ 설정이 없어(`grep 'ENV|TZ' Dockerfile` 결과 PNPM/NODE_OPTIONS/PORT/HOSTNAME/STORAGE_DIR만) 컨테이너는 UTC, 한국어 UI 사용자는 UTC+9다.

**영향**
2026-07-30 08:00 KST에 생성된 SR은 2026-07-29 23:00 UTC다: SSR이 `'2026. 07. 29.'`를 방출하고 하이드레이션이 `'2026. 07. 30.'`로 재작성해 **모든 SR 목록 렌더링에서 가시적 깜빡임 + React 하이드레이션 불일치 에러**가 발생한다. 마감 배지는 더 심각하다 — 동일 dueDate가 서버에서 `'오늘 마감'`(빨강 destructive), 클라이언트에서 `'D-1'`이 되거나 그 반대다. 즉 사용자가 행동 근거로 삼는 긴급도 신호가 **매일 9시간 창 동안 틀린다**. `srs/page.tsx:147-150`의 서버 측 '오늘 마감' 카운트도 같은 UTC 자정 가정으로 오염된다. 동일 문제가 CSV 내보내기(`src/app/api/reports/export/route.ts:88-89`, `toLocaleDateString('ko-KR')`에 timeZone 미지정), SR 번호 채번(`sr.service.ts:56-57`, `toISOString()` 기반이라 09:00 KST에 롤오버), 대시보드 30일 추이(`dashboard/stats/route.ts:209, 353`)에도 있다.

**수정 방안**

1. Dockerfile 런타임 스테이지와 docker-compose에 `ENV TZ=Asia/Seoul` 설정 — 서버와 클라이언트가 일치.
2. 포맷팅을 앰비언트가 아닌 명시적 타임존으로: `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })`, `date-utils.ts`의 일 경계도 `setHours(0,0,0,0)` 대신 명시적 KST 오프셋에서 도출.
3. SR 번호는 `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).replace(/-/g,'')`로 계산.
4. 대시보드 그룹핑을 `DATE(created_at AT TIME ZONE 'Asia/Seoul')`로 변경하고 JS 채움 루프와 경계를 맞춘다.
5. Postgres에도 `timezone=Asia/Seoul` 설정.

---

### 3.26 [HIGH] SSE 무효화 키가 어떤 쿼리에도 등록되어 있지 않아 실시간 갱신이 동작하지 않음

> **✅ 해결됨 (2026-08-01).** SR 목록·대시보드는 **서버 컴포넌트가 데이터를 가져오는 SSR
> 화면**이라 React Query 캐시에 아예 들어 있지 않다. 따라서
> `invalidateQueries({ queryKey: ['srs'] })` / `['dashboard-stats']` 는 어떤 쿼리와도
> 매칭되지 않는 무동작이었다(토스트만 뜨고 목록은 그대로였던 이유).
>
> 죽은 키를 제거하고, 실제로 등록된 키(`['sr', srId]`, `[..., 'comments']`,
> `[..., 'activities']`)만 무효화한 뒤 `router.refresh()` 로 서버 렌더를 다시 받는다.
> 이벤트가 몰아칠 때 서버를 때리지 않도록 300ms 로 묶었고, 언마운트 시 타이머를 정리한다.

**파일**: `src/hooks/use-realtime-status.ts:31, 33, 54, 55, 75, 76, 104`

**문제**
SSE 핸들러들이 `queryClient.invalidateQueries({ queryKey: ['srs'] })`와 `{ queryKey: ['dashboard-stats'] }`를 호출한다. src 전체의 `useQuery(`/`useInfiniteQuery(` 호출 지점은 정확히 3곳뿐이다: `use-sr.ts:13`의 `['sr', srId]`, `use-sr-infinite.ts:10/34`의 `['sr', srId, 'activities'|'comments']`. **`['srs']`나 `['dashboard-stats']`로 등록된 쿼리는 없다** — SR 목록은 서버 렌더 props(`srs/page.tsx:208-216`)이고 대시보드는 raw fetch + useState(`dashboard/page.tsx:144-163`)다. 핸들러는 `router.refresh()`도 호출하지 않는다. 옵저버 없는 키에 대한 `invalidateQueries`는 no-op다.

**영향**
다른 사용자가 SR을 생성·수정·삭제하면 뷰어는 `'새로운 SR #x가 등록되었습니다'` 토스트를 받아 **데이터가 바뀌었다고 인지하지만**, SR 목록·퀵필터 카운트·대시보드 통계는 수동 새로고침 전까지 낡은 값을 유지한다. 토스트가 적극적으로 오도한다. 게다가 수동 새로고침이 가장 비싼 경로다(`/srs` 9쿼리, `/api/dashboard/stats` 10쿼리)이므로 깨진 무효화가 사용자를 전체 리렌더로 몰아넣는다. SSE 구독/`canReadSR`/팬아웃 비용 전부를 토스트 문구와 댓글 갱신만을 위해 지불하고 있다. 동일한 죽은 무효화가 `useIntakeForm.ts:228`과 `use-sr.ts:134/222`에도 있으나 그쪽은 동반된 `router.refresh()`가 구제한다.

**수정 방안**
각 SSE 핸들러에 `router.refresh()`(next/navigation)를 추가해 서버 렌더 세그먼트를 재조회하게 하고, `['srs']`/`['dashboard-stats']` 무효화를 삭제하거나 대시보드를 `useQuery({ queryKey: ['dashboard-stats'] })`로 전환해 키를 실재하게 만든다. 쿼리 키를 `queryKeys` 객체로 중앙화해 아무도 읽지 않는 키가 리뷰에서 드러나게 한다.

---

### 3.27 [HIGH] Edit SR 다이얼로그가 희망 우선순위·희망 완료일을 조용히 폐기

> **✅ 해결됨 (2026-08-01).** `srUpdateSchema` 에 `requestedPriority`(빈 문자열 → undefined)와
> `requestedCompletionDate`(빈 문자열 → null, 값 지우기 지원)를 추가하고,
> `SRService.updateSR` 이 이를 `updateData` 에 매핑한다(날짜는 `new Date()` 변환).
>
> **필드 소유권 판단:** 이 둘은 요청자가 표명하는 희망값이므로 3.22 에서 만든
> **운영자 소유 필드 게이트에 넣지 않았다**. 게이트하면 고객이 자기 희망 기한조차 바꿀 수 없다.
> 반대로 SLA 마감일(`dueDate`)·실제 우선순위(`actualPriority`)와 섞이지 않는지도 테스트로 고정했다 —
> 섞이면 SLA 준수율 지표가 요청자에 의해 위조된다.
>
> 회귀 테스트: `schemas.coverage.test.ts`(왕복 6건, EditSRDialog 실제 전송 형태 포함),
> `sr.service.requested-fields.test.ts`(6건). 수정 전 구현에 대해 10건이 실패함을 확인했다.
>
> **정정:** 이 항목은 2026-08-01 중간 점검에서 "이전 세션 완료"로 잘못 표시됐었다.
> 당시 확인한 `requestedPriority`/`requestedCompletionDate` 선언은 `srCreateSchema` 의 것이었고,
> `srUpdateSchema` 에는 없었다.

**파일**: `src/lib/schemas.ts:96-143`, `src/hooks/useEditSRForm.ts:224-227`, `src/components/srs/EditSRDialog.tsx:222-249`

**문제**
`EditSRDialog.tsx:222-234`가 `'희망 우선순위 *'` Select를, `:241-249`가 `'희망 완료일'` date Input을 렌더링하고, `useEditSRForm.ts:224-227`이 `formData.append('requestedPriority', ...)` / `formData.append('requestedCompletionDate', ...)`로 전송한다. `updateSRAction`(`src/actions/sr.actions.ts:50-51`)이 `buildSRUpdateInput`(`sr-form.utils.ts:19-21`, raw `Object.fromEntries`)을 `srUpdateSchema`에 통과시키는데, **`srUpdateSchema`(`schemas.ts:96-143`)에는 `requestedPriority`도 `requestedCompletionDate`도 선언되어 있지 않다**(priority, actualPriority, expectedCompletionDate, dueDate, actualCompletionDate, estimatedCompletionDate만 존재). zod 객체는 기본적으로 미지 키를 제거하므로 두 값은 `srService.updateSR` 호출 전에 사라진다.

**영향**
사용자가 수정을 열어 필수(별표) 표시된 희망 우선순위와 희망 완료일을 변경하고 저장을 누르면 `'SR이 수정되었습니다'` 성공 토스트를 받지만 **어느 값도 영속화되지 않는다**. 다음에 다이얼로그를 열면 서버에서 이전 값이 다시 채워지므로, 사용자가 표명한 긴급도와 기한이 긍정 확인과 함께 조용히 소실된다.

**수정 방안**
`srUpdateSchema`에 `requestedPriority: z.preprocess(emptyStringToUndefined, z.enum([...]).optional())`과 `requestedCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable())` 추가, `SRService.updateSR`에서 매핑(`:82-84`의 날짜 처리 미러링), 스키마 왕복 테스트 추가. 생성 후 불변이 의도라면 EditSRDialog에서 읽기 전용으로 표시해 아무 데도 가지 않는 입력을 받지 않게 한다.

---

### 3.28 [HIGH] 조직도 검색이 원시 입력으로 RegExp를 생성 — '(' 입력 시 페이지 전체 크래시

> **✅ 해결됨 (2026-08-01).** `src/lib/utils.ts` 에 `escapeRegExp()` 를 추가하고
> `highlightText` 가 이를 거쳐 RegExp 를 만들도록 했다.
> 회귀 테스트: `src/lib/__tests__/utils.test.ts`, `src/components/organization/__tests__/OrganizationTree.highlight.test.tsx`.
> 수정 전 구현에서 `(`, `)`, `[`, `*`, `+`, `?`, `\` 입력 시 렌더가 throw 함을 확인했다.

**파일**: `src/components/organization/OrganizationTree.tsx:66-81, 133, 140, 238, 242`

**문제**

```ts
function highlightText(text, query) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  ...
}
```

`query`는 `'고객사 검색...'` 자유 텍스트 입력의 디바운스 값이다(`src/app/(dashboard)/organization/page.tsx:460-465` → `:482`). `highlightText`는 렌더 중 `:133, 140, 238, 242`에서 호출된다.

**영향**
사용자가 짝이 맞지 않는 정규식 메타문자(`(`, `[`, `*`, `+`, `?`, 후행 `\`)를 입력하면 `new RegExp`가 렌더 중 SyntaxError를 던진다. 클라이언트 컴포넌트 트리를 빠져나가 `src/app/error.tsx`에 도달해 **화면 전체가 `'문제가 발생했습니다'`로 대체**된다. 괄호가 포함된 고객사 코드/명칭(예: `'한국전력(주)'`)은 매우 흔하므로 정상 사용 중 자명하게 도달한다. organization 세그먼트에 스코프된 에러 바운더리가 없어 앱 셸 전체를 잃는다.

**수정 방안**
패턴 생성 전 이스케이프: `const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const regex = new RegExp(`(${escaped})`, 'gi');`, 그리고 생성을 try/catch로 감싸 원문 텍스트를 폴백으로 반환. 참고로 eslint의 `security/detect-non-literal-regexp`가 이를 잡아냈어야 하나 `eslint.config.mjs`에서 'warn'으로만 설정되어 있고 `pnpm lint`에 `--max-warnings`가 없어 무시된다.

---

### 3.29 [HIGH] Let's Encrypt 인증서 갱신 자동화 부재 — 마지막 main 배포로부터 90일 후 TLS 만료

> **✅ 해결됨 (2026-08-01).** 배포와 무관한 갱신 경로를 만들었다.
>
> - `scripts/renew-letsencrypt.sh` — `certbot renew`(만기 30일 전이 아니면 no-op 이라
>   매일 돌려도 안전) 후 **인증서 지문이 실제로 바뀐 경우에만** 복사하고
>   `nginx -s reload`(restart 아님 — 무중단).
> - `deploy.yml` 이 호스트 crontab 에 일일 03:00 항목을 **멱등하게** 설치한다.
> - 자가 서명 폴백이 조용히 성공하지 않도록 `::warning::` + 배너를 출력한다.
>   certs 디렉터리 유실이 "동작하지만 신뢰되지 않는 사이트"를 만드는 경로였다.
>
> **주의:** cron 설치와 갱신 동작은 서버에서 실제로 배포가 돌아야 검증된다.

**파일**: `scripts/setup-letsencrypt.sh:22-43`, `.github/workflows/deploy.yml:161`

**문제**
`setup-letsencrypt.sh`가 `certbot certonly --webroot ... --keep-until-expiring`을 실행하고 fullchain/privkey를 `nginx/certs/server.{crt,key}`로 복사한 뒤 nginx를 재시작한다(`:22-43`). 유일한 호출 지점은 `deploy.yml:161`의 main 브랜치 분기다. cron 항목도, systemd timer도, `certbot renew` 사이드카 컨테이너도, `docker-compose.prod.yml`의 갱신 서비스도 없다 — nginx는 `./nginx/certs:/etc/nginx/certs:ro`를 정적 파일로 마운트한다(`docker-compose.prod.yml:11`). 저장소 전체 `grep -rn certbot` 결과 갱신을 스케줄하는 것이 없다.

**영향**
Let's Encrypt 인증서는 90일 유효다. 유지보수 모드의 시스템에서 충분히 있을 법한 90일 무배포가 발생하면 **lkindo.kr, www.lkindo.kr, sr.lkindo.kr, test.lkindo.kr 전부에서 브라우저 하드 TLS 인터스티셜**이 뜬다. 업타임 모니터링도 만료 알림도 없으므로(3.30 참조) 최초 신호는 사용자 불만이다. 조용한 열화 변종도 있다: `nginx/certs/server.crt` 부재 시 배포가 자체 서명 인증서를 생성하므로(`deploy.yml:134-142`) certs 디렉터리 유실이 **동작하지만 신뢰되지 않는 사이트**를 아무 경보 없이 만든다.

**수정 방안**
배포와 무관한 certbot 갱신 타이머 추가 — 호스트 cron(`0 3 * * * cd /home/opc/sr && ./scripts/setup-letsencrypt.sh >> /var/log/certbot.log 2>&1`, `--keep-until-expiring` 덕에 만기 전엔 no-op이라 안전) 또는 `certbot/certbot renew` 사이드카 + `docker compose exec nginx nginx -s reload`. 외부 모니터에 인증서 만료 검사 추가. `deploy.yml:134-142`의 자체 서명 폴백이 조용히 성공하지 말고 큰 경고를 내도록 변경.

---

### 3.30 [HIGH] 관측성 전무 — 에러 추적·메트릭·업타임 감시·알림이 하나도 없음

> **부분 해결 (2026-08-01).** pino 종료 플러시와 앱 헬스체크를 구현했다.
>
> - 종료 훅(`beforeExit`/`SIGTERM`/`SIGINT`/`uncaughtException`/`unhandledRejection`)에서
>   destination 을 `flushSync()` 한다. 감사가 제안한 `pino.final()` 은 **pino 10 에서 제거되어**
>   현재 API 인 destination 의 `flushSync()` 를 쓴다.
> - Dockerfile `HEALTHCHECK` + compose `healthcheck`(prod/staging)로 `/api/health` 를 실제로
>   호출한다. 이제 "프로세스는 살아 있지만 wedge 된" 상태가 감지되고, nginx 가
>   `condition: service_healthy` 로 앱을 기다린다.
>
> 회귀 테스트: `src/lib/__tests__/logger.flush.test.ts` (9건, node 환경).
> **남은 것:** uptime-kuma 에 `/api/health` 가 실제로 등록되어 있는지 확인(서버 측 작업)과
> 호스트 밖 로그 수집. Sentry 는 소유자 결정으로 제외.

**파일**: `src/lib/logger.ts:4, 75`, `src/app/api/health/route.ts:12-25`

**문제**
`grep -rniE 'sentry|datadog|opentelemetry|newrelic|prometheus|uptimerobot|healthchecks.io' src/ package.json .github/ nginx/ docker-compose*.yml` 결과는 **정확히 1건** — `logger.ts:4`의 희망사항 주석 `프로덕션 환경에서 에러 트래킹 서비스(Sentry 등) 연동 가능`. 로그는 pino를 통해 stdout으로 나가 로컬 json-file 드라이버에 3×10MB 로테이션(`docker-compose.prod.yml:43-47`)될 뿐 호스트 밖으로 전송되지 않는다. `/api/health`는 실제 `SELECT 1`을 수행하는 잘 만들어진 엔드포인트지만 **아무도 호출하지 않는다** — Dockerfile `HEALTHCHECK` 없음, compose `app` 서비스에 `healthcheck:` 없음(DB에는 `:63-67`에 있음), nginx status 엔드포인트 없음, 스케줄 워크플로 없음. 추가로 `logger.ts:75`가 `pinoDestination({ sync: false, minLength: 4096 })`를 설정하는데 `pino.final`/SIGTERM 플러시 핸들러가 어디에도 등록되어 있지 않다.

**영향**
프로덕션 500, 미처리 rejection, Prisma 풀 고갈, 크래시 루프가 사용자가 다른 채널로 한국어로 보고할 때까지 **보이지 않는다**. MTTD 스토리가 없다. 로그 보존은 컨테이너당 30MB이며 DB와 백업이 있는 동일 디스크에 있으므로 사후 분석은 로테이션에서 살아남은 것으로 제한된다. 비동기 pino destination이 이를 가중시킨다 — 최대 4KB의 버퍼된 로그 라인, 정확히 **크래시나 배포 SIGTERM 직전에 기록된 가장 진단 가치 높은 출력**이 플러시되지 않고 폐기된다. 또한 앱 컨테이너에 healthcheck가 없어 프로세스가 살아 있지만 wedge된 상태(50k행 CSV 직렬화로 이벤트 루프 블록, 450MB 한계 근처 GC 스래싱)를 감지하지 못한다 — `restart: always`는 프로세스 종료에만 발화하므로 Docker는 컨테이너를 running으로 보고하면서 사이트가 사실상 다운될 수 있다.

**수정 방안**
비용 순으로 3단계:

1. 외부 업타임 모니터를 `https://sr.lkindo.kr/api/health`에 연결 + 알림 — 엔드포인트는 이미 있고
   503도 올바르게 반환한다. **정정**: 서버에 `uptime-kuma` 컨테이너가 이미 4주 이상 구동 중임을
   SSH 로 확인했다(저장소의 어떤 compose 파일에도 없어 정적 분석으로는 보이지 않았다).
   따라서 남은 것은 "업타임 감시 도입"이 아니라 "이 엔드포인트가 실제로 그 감시에 등록되어
   있는지 확인"이다.
2. ~~`src/instrumentation.ts`를 통해 Sentry 등 에러 추적기 도입.~~
   **결정(2026-07-30, 소유자): Sentry 는 사용하지 않는다.** 따라서 이 항목은 폐기한다.
   에러 추적 공백은 유효하나 해법이 달라야 한다 — 실용적인 대안은 (a) `logger.ts` 의 error 레벨
   출력을 호스트 밖 수집기로 보내거나(자체 호스팅 가능한 Loki/Vector 등),
   (b) 이미 구동 중인 `uptime-kuma` 의 알림 채널을 활용해 `/api/health` 실패와 컨테이너 재시작을
   통보받는 선에서 최소 탐지력을 확보하는 것이다. 어느 쪽도 외부 SaaS 를 요구하지 않는다.
3. `logger.ts`에 `const finalHandler = pino.final(this.pinoLogger); process.on('SIGTERM', () => finalHandler.flushSync())` 등록.
4. Dockerfile에 `HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` + compose `app` 서비스에 대응 `healthcheck:` + nginx `depends_on`을 `condition: service_healthy`로.

---

### 3.31 [HIGH] 백업이 프로덕션 동일 디스크에만 존재 — 오프사이트·암호화 미구성, 복구 리허설 무기록

> **부분 해결 (2026-08-01).** 코드 경로 4개를 만들었고, **값 등록은 소유자 작업으로 남는다.**
>
> - **배포 전 백업**(수정방안 2): `deploy.yml` 이 pull 앞에서 `scripts/backup.sh` 를 실행한다.
>   백업 실패가 배포를 막지는 않되 경고한다(운영 중단이 더 큰 손해).
> - **암호화**(수정방안 1): `BACKUP_ENCRYPT_RECIPIENT` 설정 시 age/gpg **공개키**로 암호화하고
>   평문을 삭제한다. 공개키 방식이라 서버에 복호화 키가 없다 — 서버가 침해돼도 과거 백업을
>   읽을 수 없다. 수신자가 설정됐는데 도구가 없으면 **평문을 남기지 않고 실패**한다.
>   부수 수정: prune 글롭이 `.age`/`.gpg` 를 포함하도록(안 그러면 암호화 파일이 영원히 쌓인다),
>   크기 리포트가 삭제된 평문을 참조하지 않도록.
> - **복구 리허설**(수정방안 3): `scripts/restore-rehearsal.sh` +
>   `.github/workflows/restore-rehearsal.yml`(매월). **일회용 Postgres 컨테이너**에 복구해
>   스키마·행 수를 단언한다. 프로덕션 DB 는 건드리지 않는다.
>   암호화 백업은 복호화 신원이 없으면 "검증 불가"로 **실패** 처리한다(성공으로 넘기지 않는다).
> - **실패 알림**(수정방안 4): `backup.yml` 에 `if: failure()` 스텝 추가.
>
> ### 오프사이트 복제: **수용된 위험 (2026-08-01, 소유자 결정)**
>
> 소유자가 **오프사이트 복제를 도입하지 않고 운영 서버 동일 디스크 백업을 유지**하기로 결정했다.
> 이 항목은 "해결됨"이 아니라 **명시적으로 수용된 위험**으로 기록한다.
>
> 그대로 남는 노출:
>
> - 디스크 물리 장애 / VM 삭제 / 랜섬웨어가 **DB·첨부파일·전체 백업을 한 번에** 파괴한다.
>   백업이 보호해 주지 못하는 유일한 시나리오가 정확히 이것이다.
> - 즉 현재 백업은 **실수 삭제·잘못된 마이그레이션·논리적 손상**에는 유효하지만,
>   저장 매체 자체를 잃는 경우에는 무력하다.
>
> 완화되어 있는 부분: 배포 전 백업, 14일 보존, `pg_restore -l` 검증, 월간 복구 리허설은
> 모두 동작하므로 "되돌릴 수 있는 사고"의 범위는 여전히 넓다.
>
> 되돌리려면: `BACKUP_OFFSITE_CMD` 시크릿만 등록하면 코드 경로는 이미 준비되어 있다.
>
> ### 남은 것 (소유자 작업)
>
> - `BACKUP_ENCRYPT_RECIPIENT` / `BACKUP_AGE_IDENTITY_FILE` 등록 + 서버에 age(또는 gnupg) 설치.
>   오프사이트를 하지 않더라도 암호화는 여전히 의미가 있다 — 호스트 침해나 디스크 폐기 시
>   평문 PII(사용자·고객사·SR 본문) 유출을 막는다. 미설정 시 백업은 평문으로 남는다.
> - 수정방안 5(마이그레이션을 entrypoint → 배포 게이트로 이동)는 감사가 '장기적으로' 로
>   분류해 범위 밖.

**파일**: `scripts/backup.sh:16, 34, 67-70`, `.github/workflows/backup.yml:48-61`

**문제**
`backup.sh:16`이 `BACKUP_DIR=/home/opc/sr/backups`에 기록한다 — `sr_db_data`와 `sr_uploads` 볼륨과 **동일 파일시스템**. 오프사이트 경로는 옵트인 훅 `if [ -n "${OFFSITE_CMD:-}" ]`(`:67-70`)이고, `backup.yml:48-55, 61`의 `envs:` 목록은 `RETENTION_DAYS`만 전달하므로 **OFFSITE_CMD가 설정되는 곳이 없어 분기가 실행되지 않는다**. 덤프는 평문(`pg_dump -Fc`, `:34`)이며 gpg/age 단계가 없다 — `docs/backup-and-restore.md:77-78`이 정확히 이를 권고함에도 그렇다. 어떤 워크플로도 `restore.sh`를 호출하지 않으며, 문서 자체가 `:59-62`(`분기 1회 ... 복구 리허설(권장)`)와 `:64`(`오프호스트 복제 (아직 미구성)`)에서 이를 인정한다.

추가로 **배포 전 백업 스텝이 없다**. `docker-entrypoint.sh:5`가 컨테이너 시작마다 `prisma migrate deploy`를 무조건 실행하고, prod 배포(`deploy.yml:148-151`)는 pull·teardown·recreate만 한다 — `backup.sh`는 서버에 복사되지만(`deploy.yml:70`) 호출되지 않는다. 유일한 실행은 `backup.yml:11-13`의 03:00 KST cron이다.

**영향**
디스크 장애, VM 삭제, 랜섬웨어/침해 시나리오가 **DB·첨부·14일치 백업을 한 번에 파괴**한다 — 백업이 실제로 회사가 데이터를 잃는 실패 모드에 대해 아무 보호를 제공하지 못한다. 덤프는 암호화되지 않은 PII(사용자, 클라이언트, SR 내용)이며 3001·5433 포트를 공개하는 호스트 옆에 놓여 있다. 그리고 이 산출물로 복구를 실행한 적이 없으므로 백업이 미검증이다 — `pg_restore -l`(`:49`)은 목차만 검증하고 깨끗한 DB로의 전체 복구가 동작 시스템을 재현하는지는 검증하지 않는다. 파괴적 성격의 마이그레이션(`20260703000000_drop_dead_sr_counters`, `20260703010000_sr_constraints`, `20260623081611_remove_unused_auth_tables`)이 새 이미지 부팅 즉시 프로덕션에 적용되는데 최신 복구 지점이 최대 24시간 전이고 복구 절차는 한 번도 실행된 적 없다.

**수정 방안**

1. `backup.yml`의 `envs:`에 secret 기반 `OFFSITE_CMD` 설정 + 서버에 rclone으로 S3/B2 구성, `age -r <pubkey>` 또는 `gpg --encrypt`로 **선암호화**해 원격에 평문이 남지 않게 한다.
2. main 브랜치 분기의 `docker compose pull` 앞에 `bash scripts/backup.sh` 스텝을 추가하고 non-zero 종료 시 배포 중단(스크립트가 이미 `:43-52`에서 자체 검증한다).
3. 최신 덤프를 일회성 컨테이너로 복구하고 몇몇 테이블의 행 수를 단언하는 월간 스케줄 워크플로 추가 — "복구가 동작한다"를 희망이 아닌 녹색 체크로.
4. `backup.yml`에 실패 알림 추가.
5. 장기적으로 `prisma migrate deploy`를 컨테이너 entrypoint에서 배포 워크플로의 명시적 게이트 스텝(`docker compose run --rm app prisma migrate deploy`)으로 이동 — 마이그레이션 실패가 부팅 시 반쯤 적용되는 대신 배포를 중단시키도록.

---

### 3.32 [HIGH] deploy가 DB·nginx까지 내리고 헬스체크·롤백 경로가 없음

> **✅ 해결됨 (2026-08-01).** 수정 방안 5단계를 모두 적용했다.
>
> 1. SSH 스크립트 첫 줄에 `set -euo pipefail`. `set -u` 아래에서도 시크릿 누락 메시지가 나오도록
>    해당 검사는 `${VAR:-}` 로 참조한다.
> 2. Dockerfile `HEALTHCHECK` + prod/staging compose `healthcheck`,
>    nginx `depends_on: app: condition: service_healthy`.
> 3. `sleep 5` + "running 인가" 검사를 `wait_healthy()` 폴링으로 교체(최대 240초).
>    HEALTHCHECK 가 없는 구버전 이미지로 롤백한 경우에는 20초 후 running 으로 판정해 무한 대기를 피한다.
> 4. 전면 `down` 제거. `up -d` (변경분만) + `up -d --force-recreate --no-deps app` 으로
>    **앱만 교체**한다. nginx·DB 가 살아 있으므로 배포 중 connection-refused 가 사라지고,
>    prod 배포가 스테이징을 부수적으로 죽이지 않는다.
> 5. 이미지에 커밋 SHA 태그를 함께 push 하고, compose 가 `${APP_IMAGE_TAG:-latest}` 로 읽는다.
>    헬스 게이트 실패 시 **이전 컨테이너의 이미지 ID(sha256)** 로 자동 롤백한다 —
>    태그가 아니라 ID 를 잡는 이유는, 돌고 있던 컨테이너가 `:latest` 였다면 그 태그는 방금
>    새(불량) 이미지로 덮어써졌기 때문이다.
>
> 부수 수정:
>
> - `docker compose image prune` 은 **유효한 하위 명령이 아니라 항상 실패**했고, 뒤따르던
>   `docker image prune -af` 가 직전 SHA 이미지까지 지워 롤백 경로를 없앴다.
>   `docker image prune -af --filter until=168h` 로 교체해 7일치를 보존한다.
> - 배포 전 `scripts/backup.sh` 실행(마이그레이션 사고 대비 복구 지점). 백업 실패가 배포를
>   막지는 않되 경고를 남긴다 — 운영 중단이 더 큰 손해이기 때문이다.
> - `mem_limit`: app 768m, nginx 128m. DB 는 잘못 조이면 쿼리가 실패하므로 두지 않았다.
>
> 검증: YAML 파싱 + 추출한 셸 스크립트 `bash -n` 통과, 두 compose 파일 `docker compose config` 통과.
> **주의:** 이 워크플로는 `workflow_run` 이라 **main 에 병합된 정의**가 실행된다. 병합 후 첫 배포가
> 실제 첫 검증이다.

**파일**: `.github/workflows/deploy.yml:86, 148-157, 171`

**문제**
prod 경로가 `docker compose -f docker-compose.prod.yml down --remove-orphans` → `docker rm -f sr-nginx sr-app sr-db` → `up -d --force-recreate`(`:148-151`)를 실행한다 — 앱뿐 아니라 **데이터베이스와 리버스 프록시까지 정지**시킨다. 준비 확인은 `sleep 5`와 `docker ps -q -f name=sr-app -f status=running`(`:154-157`)뿐이다. `running`은 컨테이너가 시작되는 즉시 참이며, 그 시점에 `docker-entrypoint.sh`는 아직 `prisma migrate deploy`를 실행 중이고 Next는 포트를 바인딩하지 않았다. Dockerfile에 `HEALTHCHECK`가 없고 `docker-compose.prod.yml`의 `app` 서비스에 `healthcheck:`가 없으며 nginx의 `depends_on: - app`(`:13-14`)에 `condition:`이 없다. 마지막으로 `:171`이 `docker compose image prune -af || docker image prune -af`를 실행하는데 푸시되는 유일한 태그는 가변 `latest`(`:58-59`)다.

추가로 ssh-action 스크립트 블록(`:86-172`)에 **`set -e`가 없고** `script_stop:` 입력도 없다(`backup.yml:56-61`은 명시적으로 `set -e`를 쓴다). 유일한 실패 감지는 `:114-116`과 `:155-157`의 수동 가드다. 그 이후 전부가 무방비다 — `./scripts/setup-letsencrypt.sh`(`:161`), 스테이징 seed(`:121`), `docker compose ... pull`(`:107, 148`). 마지막 실행 명령 `docker compose image prune -af || docker image prune -af`에서 `image prune`은 유효한 compose 서브커맨드가 아니므로 `||` 폴백이 **항상 실행되고 항상 성공**해 스텝 종료 코드를 0으로 고정한다.

**영향**
모든 프로덕션 배포가 이미지 pull, 컨테이너 teardown, Postgres 콜드 스타트, 부팅 시 마이그레이션을 포괄하는 하드 아웃티지다 — 현실적으로 30~90초의 502이며 **nginx 자체도 내려가 있어** 사용자는 프록시 에러 페이지가 아닌 connection-refused를 받는다. 새 이미지가 부팅했지만 잘못된 마이그레이션이나 누락된 env로 크래시해도 5초 running 검사는 통과할 수 있다. 그리고 롤백이 불가능하다 — `latest`가 GHCR에서 덮어써졌고 이전 로컬 이미지가 방금 prune되었으므로 복구는 이전 커밋 재빌드를 요구한다. 배포가 nginx도 제거하므로 prod 배포가 **스테이징까지 부수적으로 다운**시킨다. `set -e` 부재로 인해 이미지 pull 실패는 이전 이미지를 조용히 재배포(성공으로 보고되는 no-op 배포 — 커밋 de6ca1c가 고치려던 바로 그 버그 유형)하고, 인증서 갱신 실패는 만료 전까지 보이지 않는다.

**수정 방안**

1. 스크립트 블록 첫 줄에 `set -euo pipefail` 추가(또는 ssh-action 스텝에 `script_stop: true`), 유효하지 않은 `docker compose image prune`을 `docker image prune -af --filter until=168h`로 교체.
2. Dockerfile에 `HEALTHCHECK` 추가, compose `app`에 대응 `healthcheck:` 추가, nginx `depends_on`을 `condition: service_healthy`로.
3. `sleep 5` 단언을 `docker inspect -f '{{.State.Health.Status}}' sr-app` 폴링으로 교체.
4. 전면 `down` 제거 — `up -d --force-recreate --no-deps app`으로 앱만 재생성해 DB와 nginx를 유지.
5. 커밋 SHA로도 이미지 태깅하고 `image prune -af`가 이전 SHA를 지우지 못하게 해 이전 태그로의 `docker compose up`이 원커맨드 롤백이 되게 한다.

---

### 3.33 [HIGH] 커버리지 임계값이 전체 소스의 48%만 측정 — API 라우트 40개 중 34개가 분모에서 누락

**파일**: `vitest.config.ts:19-40`

**문제**

```ts
coverage: { provider: 'v8', reporter: [...], thresholds: { lines: 80, statements: 80, functions: 75, branches: 70 }, exclude: [...] }
```

`include` 키가 없고 `all` 키도 없다. Vitest 4의 기본값(`node_modules/vitest/dist/chunks/defaults.BOqNVLsY.js:15-31`)에도 둘 다 없어 **테스트가 실제로 import한 파일만 리포트에 들어간다**(`getUntestedFiles`가 `if (this.options.include == null) return [];`로 시작). 커밋된 `coverage/coverage-final.json` 실측: 111개 파일 계측, STMT 84.23%(2741/3254), BRANCH 74.31%, FUNC 76.19%. 저장소의 비테스트 소스 파일은 **233개**다. `src/app/api/**/route.ts` 40개 중 리포트에 나타나는 것은 6개뿐이고, page/layout 파일 21개 중 0개다. `.github/workflows/ci-cd.yml:86-89`는 명시적으로 이것이 임계값을 "실제로 게이트한다"고 주장한다.

**영향**
완전히 테스트되지 않은 새 API 라우트를 추가하는 PR이 **커버리지 플래그를 전혀 일으키지 않는다** — 파일이 분모에 등장조차 하지 않으므로 절대 커버리지가 떨어져도 `lines`는 영원히 80% 위에 머문다. Codecov와 리뷰어에게 보고되는 84%는 실제 커버리지를 약 2배 과대 표현한다. 게다가 가장 빡빡한 두 게이트의 여유가 ~1pp(functions 76.19 vs 75)와 ~4pp(branches 74.31 vs 70)이므로 이 게이트는 **부정직하면서 동시에 취약**하다.

**수정 방안**
`coverage.include: ['src/**/*.{ts,tsx}']`를 기존 `exclude`와 함께 추가하고, 진짜 분모로 4개 임계값을 재기준화한 뒤(큰 하락 예상) 점진적으로 올린다. 정직한 수치가 무엇이든 그 수치로 임계값을 설정하고, 실제 값을 기록하는 CI 주석을 추가해 회귀가 보이게 한다. 임계값을 낮추는 것으로 끝내지 말 것.

---

### 3.34 [HIGH] 모든 RBAC/권한상승 E2E가 단언 대신 console.log를 사용 — 통제가 없어도 통과

> **✅ 해결됨.** 앞부분(보안 E2E 의 `console.log` → `expect` 치환)은 이전 세션에서 완료됐고,
> **후반부(“`expect` 없는 테스트를 실패시키는 CI 검사”)는 2026-08-01 에 구현했다.**
>
> `scripts/check-e2e-assertions.ts` — 각 `test(...)` 본문에 `expect(` 호출이 있는지
> **TypeScript AST 로** 검사한다(정규식이면 주석·문자열 속 'expect' 를 세게 된다).
> `test.fixme`/`test.skip` 은 "의도적으로 안 돈다"는 명시이므로 면제한다.
> `pnpm check:e2e-assertions` 로 실행하며 CI 의 code-quality 잡에 게이트로 걸려 있다.
>
> **범위:** 도입 시점에 스펙 34개 전부가 통과하므로 **전체를 게이트한다**(일부만 막으면
> 그 밖에서 새로 생기는 것을 못 잡는다). 단언 없는 테스트를 넣으면 CI 가 실패하는 것을
> 실제 프로브 스펙으로 확인했다.
>
> **이 검사의 한계:** `expect(x).toBeGreaterThanOrEqual(0)` 같은 **항상-참 단언은 통과한다**
> (단언이 "있기는" 하다). 그런 공허한 단언과 `if (!visible) test.skip()` 패턴은 5절의
> 별도 항목이며 사람 리뷰가 필요하다 — 이 게이트가 그것까지 막아 준다고 읽으면 안 된다.

**파일**: `e2e/23-role-exclusivity.spec.ts:86, 134-138, 174-178, 215-219, 265-269`, `e2e/22-sr-intake-process.spec.ts:426-439`, `e2e/21-sr-status-transitions.spec.ts:355-366`

**문제**
`'1. 시스템 운영팀과 고객사 팀 역할 동시 부여 차단'` 테스트가 `{ roleIds: [adminRole.id, clientAdminRole.id] }`를 POST한 뒤:

```ts
if (response.status() === 400) {
  console.log(`✅ 역할 동시 부여 차단: ${errorData.error}`);
} else {
  console.log(`ℹ️ 응답 상태: ${response.status()}`);
}
```

— `expect` 없음. 동일 패턴이 `:134-138`(테스트 2), `:174-178`(3), `:215-219`(4), `:265-269`(5). `22-sr-intake-process.spec.ts:426-439`의 `'CLIENT는 SR 접수 처리 불가'`도 `if (is403 || isBackToDetail) { console.log('✅ ...차단됨 (정상)') }`로 테스트 전체에 expect가 0개다. `21-sr-status-transitions.spec.ts:355-366`의 `'7. 잘못된 상태 전이 차단 테스트'`도 마찬가지. 전체 suite에서 **210개 `test()` 블록 중 HTTP 403을 단언하는 것은 정확히 2개**(`e2e/sr-permissions.spec.ts:247, 273`)이며, e2e 전체의 `not.toBeVisible()` 단언은 7개뿐이다.

**영향**
`POST /api/users/[id]/roles`가 200을 반환하고 ADMIN + CLIENT_ADMIN을 동시 부여하도록 바뀌어도 — 스펙 이름이 가리키는 바로 그 권한상승 — 테스트 스위트는 녹색을 유지하고 `ℹ️ 응답 상태: 200`을 출력한다. CLIENT가 접수 권한을 얻는 경우, 불법 상태 전이도 동일하다. `e2e/README.md:143-152`가 이를 `'역할 상호 배타성 차단 검증'` 커버리지로 문서화하므로 **문서를 읽는 리뷰어는 이 속성들이 테스트로 강제된다고 믿는다**. e2e의 실효 RBAC 부정 커버리지는 README가 주장하는 ~15 시나리오가 아니라 ~1%(2/210)다.

추가로 부정 경로 전반에 동일 병리가 퍼져 있다 — `if (await x.isVisible()) { await expect(x).toBeVisible() }` 형태가 e2e 전반 323건(`e2e/19-file-upload-download.spec.ts:406, 440-447`의 대용량 파일 제한과 `.exe` 업로드 차단이 대표), 그리고 168개 테스트 바디 중 33개에 `expect(`가 아예 없다(알림 시스템 7개, 설정 2개, 접수 3개 등).

**수정 방안**

1. 모든 `if (status === 400) console.log(...)`를 `expect(response.status()).toBe(400)`로 교체하고 README가 약속하는 에러 바디 형태(`error`, `details`, `suggestion`)를 단언.
2. CLIENT 접수 테스트는 URL 리다이렉트 추론 대신 API를 직접 단언: `expect((await request.post(`/api/srs/${id}/intake`, {...})).status()).toBe(403)`.
3. 불법 전이는 `PATCH /api/srs/[id]/status`를 불법 대상으로 호출하고 400/409를 단언(스펙 헤더 `:14`가 이미 그 엔드포인트를 명명하지만 호출하지 않는다).
4. e2e의 `if (await ...isVisible` 블록 안에 `expect(`가 나타나면 실패하는 ESLint 규칙 또는 CI grep 추가.
5. `expect(` 없는 `test()` 바디를 실패시키는 CI 검사 추가(`capture-manual.spec.ts`와 헬퍼 위임 a11y 스펙만 allowlist).

---

### 3.35 [HIGH] E2E 스위트가 CI에서 실행 자체가 불가능

**파일**: `.github/workflows/e2e.yml:36-45`, `playwright.config.ts:69-79`, `.github/workflows/ci-cd.yml:179`

**문제**
세 가지 결함이 겹친다.

(a) **DB 없음**: `e2e.yml:36-40`이 `pnpm dev &` + `npx wait-on`을 실행하는데 이 스텝에 `env:` 블록이 전혀 없어 `DATABASE_URL`이 unset이다. `src/lib/env-validation.ts:254`가 `EnvValidationError`를 던지고 `:315`가 `process.exit(1)`한다. 두 워크플로 어디에도 `services:` 블록이 없고(`grep 'services:|postgres' .github/workflows/*.yml` 무결과), `prisma migrate deploy`도 `pnpm db:seed`도 실행하지 않는다. `e2e/global-setup.ts:19-20`은 시드된 `admin@example.com`/`admin123`에 하드 의존한다.

(b) **포트 충돌**: `e2e.yml:41-45`가 `SKIP_WEBSERVER: ${{ inputs.base_url != '' && '1' || '' }}` — 빈 문자열(falsy)이므로 `playwright.config.ts:69-79`의 `webServer` 블록이 유지되어 Playwright가 **같은 포트 3000에 두 번째 dev 서버를 시작하려 한다**. `reuseExistingServer: !process.env.CI`가 CI에서 false이므로 이미 실행 중인 서버에 붙기를 거부하고 `'http://localhost:3000 is already used'`로 중단한다. 이는 (a)보다 **먼저** 발생하므로 DB만 고쳐도 소용없다.

(c) **PR에서 미실행**: `ci-cd.yml:179`의 e2e-test 잡은 `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` — 머지 **후**에만 실행된다. 독립 `e2e.yml`은 PR에서 `e2e` 라벨을 사람이 붙여야만 돈다(`:13, 17`).

추가로 `e2e/visual/dashboard.spec.ts`는 `*-chromium-win32.png` 스냅샷만 커밋되어 ubuntu-latest에서 매칭 불가하고, 4개 중 3개 테스트가 `http://localhost:6006`(Storybook)로 이동하는데 이를 시작하는 워크플로가 없다.

**영향**
멀티스텝 SR 생명주기 상태머신 + RBAC + 멀티테넌트 격리가 핵심 가치인 시스템에서, 그 플로우를 실제로 페이지 단위로 검증하는 테스트가 **머지 후에야 돌고, 3.3에 따르면 이미 배포된 후**이며, 실제로는 webServer 단계조차 통과하지 못한다. `global-setup.ts:29-32`가 리다이렉트 타임아웃을 삼키고 계속 진행하므로 실패가 명확한 셋업 에러 하나가 아니라 **~200개의 혼란스러운 스펙 실패**로 표면화된다. 이 구성에서 e2e가 CI에서 실행된 적이 거의 확실히 없다.

**수정 방안**

1. 두 워크플로에 `services: postgres:16` 블록 추가, dev-server 스텝에 `DATABASE_URL`/`DIRECT_URL` 설정, Playwright 실행 전 `pnpm exec prisma migrate deploy && pnpm db:seed` 삽입.
2. 서버 소유자를 하나로 정한다: 수동 `pnpm dev &` 스텝을 삭제하고 Playwright webServer가 라이프사이클을 관리하게 하거나, `SKIP_WEBSERVER: '1'`을 무조건 설정.
3. `ci-cd.yml`의 e2e-test 가드를 main 대상 pull_request에서도 돌도록 변경(스모크 서브셋으로 지연 관리).
4. `global-setup.ts`가 로그인 리다이렉트 타임아웃 시 로그 후 계속하지 말고 throw하게 변경.
5. Linux에서 비주얼 스냅샷 재생성(또는 스냅샷이 있는 곳에서만 도는 별도 프로젝트로 게이트)하고 해당 프로젝트 `webServer`에서 Storybook 시작.
6. 두 워크플로의 아티팩트 `path:`를 `playwright-report/`에서 `test-results/`로 수정(`playwright.config.ts:28-29`가 `outputFolder: 'test-results'`이므로 현재 아티팩트는 항상 비어 있어 실패 시 스크린샷·비디오·트레이스에 접근 불가).

---

### 3.36 [HIGH] Stryker가 실행 불가능한 다른 테스트 스위트를 돌리고, break 임계값이 없어 어떤 점수에도 통과

**파일**: `stryker.config.mjs:3-28`, `vitest.stryker.config.ts:6-21`

**문제**
(a) **임계값 없음**: `stryker.config.mjs:3-28`의 설정 객체에 `thresholds` 키가 없다. Stryker 기본값은 `break: null`이며 이 경우 프로세스는 **항상 exit 0**이다. `scripts/stryker-ci.ts`는 종료 코드만 전파하므로 그 항상-0을 상속한다. `.github/workflows/ci-cd.yml:104-132`가 이를 필수처럼 보이는 `mutation-test` 잡으로 실행한다. `json`/`dashboard` reporter도 설정되지 않았고 아티팩트 업로드도 없어 점수가 기록조차 되지 않는다.

(b) **다른 스위트**: `vitest.stryker.config.ts`가 `environment: 'node'`(`:6`), `include: ['src/**/*.test.ts']`(`:8`), `src/components/**`만 exclude(`:15`), `bail: 1`(`:21`)을 설정하고 `alias` 블록(`:17-19`)에 `'@'`만 담는다. 메인 `vitest.config.ts:39-44`는 추가로 `next/server`, `next/navigation`, `next/cache`, `server-only`를 `src/__tests__/mocks/`의 스텁으로 aliasing하고 `environment: 'jsdom'`(`:14`)으로 돈다. **19개 테스트 파일이 `next/server`를 import**하고 `src/hooks/__tests__/*.test.ts` 5개가 @testing-library로 jsdom을 요구하는데, 전부 stryker include 안이고 exclude 밖이다.

**영향**
Stryker가 실행하는 스위트가 CI가 실행하는 스위트가 아니다. Node 환경 훅 테스트는 `document`에서 throw하고 next/server import 테스트는 스텁을 잃는다. `bail: 1`로 첫 실패가 전체 런을 중단시키므로 Stryker의 초기 dry run에서 하드 에러가 나거나, 뮤턴트별로 조기 중단되어 kill이 오귀속된다. 어느 쪽이든 **CI에 출력되는 뮤테이션 점수는 아무것도 측정하지 않으며**, 임계값도 없고 아티팩트도 없어 신호가 0이다. README.md:171의 `'코드의 견고성을 검증하기 위해 결함 주입 테스트를 수행합니다'`는 강제되지 않는다.

**수정 방안**

1. `vitest.stryker.config.ts`가 `vitest.config.ts`를 확장하게 하거나 최소한 4개 모듈 alias와 동일 `environment`를 복사, `include`를 실제 뮤테이션 대상 파일로 좁히고 **`bail: 1` 제거**(뮤테이션 테스트에서 개별 테스트 실패는 기대 신호이므로 bail은 양립 불가).
2. `stryker.config.mjs`에 `thresholds: { high: 80, low: 60, break: <현재 실측치> }` 추가하고 점진 상향.
3. `reporters`에 `'json'` 추가, `reports/mutation/mutation.json`을 CI 아티팩트로 업로드.

---

### 3.37 [HIGH] 실제 Prisma 쿼리를 실행하는 테스트가 하나도 없고, CI가 마이그레이션을 검증하지 않음

> **✅ 해결됨 (2026-08-01).** 수정방안 3개가 모두 반영됐다.
>
> 1. **CI 마이그레이션 검증** — 이전 세션에서 완료. test 잡에 `postgres:16-alpine` 서비스 +
>    `prisma migrate deploy` + `prisma migrate diff --exit-code` 드리프트 검사가 있다.
> 2. **DB 기반 통합 프로젝트** — 이번에 추가했다. `vitest --project=integration`,
>    `tests/integration/` 아래 14건.
> 3. **같은 Postgres 로 e2e** — 이전 세션에서 완료(e2e 잡은 자체 postgres 서비스를 갖는다).
>
> **커버 범위(목으로는 구조적으로 불가능한 것만):**
>
> - `sr-numbering.test.ts` — 동시 12건 생성의 `srNumber` 유일성, 시퀀스 연속성, KST 채번,
>   `srs.sr_number` UNIQUE 제약이 실제로 살아 있는지. 기존 "동시성" 테스트는 **mock 안에**
>   원자적 시퀀스 생성기를 구현해 두고 그 mock 을 검증하는 순환 구조였다.
> - `transaction-atomicity.test.ts` — 트랜잭션 중간 throw / 자식 FK 위반 시 부모까지
>   롤백되는지. 패스스루 스텁(`$transaction: vi.fn(cb => cb(mock))`)은 각 호출을 독립 커밋으로
>   다루므로 이 부류를 절대 잡지 못한다.
> - `tenant-isolation.test.ts` — 테넌트 `where` 가 **실제로 무엇을 걸러내는지**.
>   기존 격리 테스트는 mock 에 전달된 where 객체를 구조적으로만 단언해, 필터가 의미상 틀려도
>   통과했다. 대조군(필터 없으면 2건 보임)까지 넣어 필터가 실제로 일하고 있음을 보인다.
>
> **설계 판단:**
>
> - 감사는 "각 테스트를 롤백되는 `$transaction` 으로 감싸기"를 제안했지만, 서비스가 전역
>   `prisma` 싱글턴을 직접 import 하므로 트랜잭션 클라이언트를 주입할 경로가 없다.
>   프로덕션 코드를 테스트를 위해 뒤집는 대신 **TRUNCATE 로 격리**한다(참조 데이터는 보존).
> - `tests/` 디렉터리로 분리했다. 루트 `test.include` 가 `src/**/*.test.ts` 라
>   `src/` 안에 두면 unit 프로젝트가 jsdom + 가짜 DATABASE_URL 로 함께 집어간다.
>   integration 프로젝트에는 `exclude: ['src/**']` 도 명시했다.
> - **기본값이 "실행"이다.** 건너뛰려면 `SKIP_DB_TESTS=true` 를 명시해야 하고, DB 에 붙지
>   못하면 **스킵이 아니라 실패**한다. 반대 방향(있으면 실행)으로 만들면 CI 설정이 어긋났을 때
>   아무것도 안 돌면서 초록불이 되는데, 그게 이 항목이 지적한 실패 방식 그 자체다.
>
> **주의 — 아직 실 DB 로 실행된 적이 없다.** 로컬에 Docker 데몬이 없어 이 14건은
> `SKIP_DB_TESTS=true` 로 수집·스킵까지만 확인했고, DB 미연결 시 명확히 실패하는 것도 확인했다.
> **실제 통과 여부는 CI 의 test 잡이 첫 검증이다.**

**파일**: `src/services/__tests__/sr.service.concurrency.test.ts:6`, `.github/workflows/ci-cd.yml:88`

**문제**
`const mock = { $transaction: vi.fn((cb) => cb(mock)), ... }` — 트랜잭션이 격리도 롤백도 에러 시맨틱도 없는 **패스스루**다. 동일 리터럴 스텁이 12개 테스트 파일에 있다(`audit.service.test.ts`, `client.service.coverage.test.ts`, `role.service.test.ts`, `sr.service.{concurrency,extended.coverage,mutation,perf,test,update.coverage}.test.ts`, `user.service.{coverage2,security,test}.ts`). `@/lib/prisma`를 import하는 모든 테스트 파일이 그것을 mock한다(`grep -rL "vi.mock('@/lib/prisma'" $(grep -rl "from '@/lib/prisma'" src --include=*.test.ts)` 무결과). '동시성' 테스트는 순환적이다 — `:92-107`이 **mock 내부에** 원자적 시퀀스 생성기를 구현(`currentSeq += 1; sequenceMap.set(date, currentSeq)`, 주석: `// Since JS is single threaded, this is safe in the mock`)하고 `:141`이 `expect(createdSrNumbers.size).toBe(concurrency)`를 단언한다 — `$queryRaw`가 아니라 mock을 검증한다.

동시에 6개 워크플로 어디에도 `prisma migrate deploy`, `prisma migrate diff --exit-code`, `prisma validate`가 없다(`grep 'migrate'` 결과는 `deploy.yml:120, 165` 주석과 `:121` seed뿐). 실제 실행 지점은 `docker-entrypoint.sh:5`뿐 — **배포 대상에서의 컨테이너 시작 시점**이다.

**영향**
두 부류의 프로덕션 결함이 감지 불가하다. (1) 부분 쓰기가 롤백되지 않는 트랜잭션 — 예: `sRStatusHistory` 행 없이 생성된 SR — 스텁이 각 호출을 독립 커밋하므로. (2) Prisma `where`의 누락되거나 잘못된 테넌트 필터 — where 객체가 mock에 대해 구조적으로만 단언되고(`client.actions.isolation.test.ts:69`) 실행되지 않으므로. 동시성 테스트가 이름으로 내건 `srNumber` 유일성 경쟁은 정확히 실제 Postgres 왕복만이 드러낼 수 있는 종류의 버그다.

마이그레이션 측면에서는 구문 오류, 채워진 컬럼에 대한 NOT NULL 추가, 기존 행과 충돌하는 제약이 lint·타입체크·단위 테스트·뮤테이션 테스트·빌드 잡 어디에서도 감지되지 않는다. 첫 실행이 배포 대상의 `docker-entrypoint.sh`이며, 실패는 컨테이너 시작 중단(아웃티지)이거나 반쯤 적용된 스키마다. `prisma/schema.prisma`와 마이그레이션 폴더 간 드리프트도 미검사이므로 대응 마이그레이션 없는 schema 편집이 CI를 통과한 뒤 런타임에 Prisma Client를 깨뜨린다.

**수정 방안**

1. ci-cd 테스트 잡에 `services: postgres:16-alpine` 블록 추가 + `pnpm prisma migrate deploy` 후 `pnpm prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code` 실행.
2. 같은 일회성 Postgres로 DB 기반 통합 프로젝트를 세우고(`vitest --project=integration`, 각 테스트를 롤백되는 실제 `prisma.$transaction`으로 감싸기) 최고 가치 케이스 ~10개 이식: CLIENT_USER의 교차 테넌트 SR 목록 필터링, 트랜잭션 중간 throw 강제 시 SR 생성 + activity + status-history 원자성, 동시 `createSR`의 `srNumber` 유일성.
3. 그 Postgres에 seed를 적용하면 3.35의 e2e 잡도 함께 실행 가능해진다.

---

### 3.38 [HIGH] E2E "MANAGER" 페르소나가 실제로는 ADMIN 계정 — MANAGER와 CLIENT_ADMIN이 한 번도 검증되지 않음

**파일**: `e2e/auth-multi-user.setup.ts:25-30`, `prisma/seed.ts:277-296, 320-334, 409-423`

**문제**
멀티유저 인증 매트릭스가 manager를 admin 계정에 매핑한다: `{ name: 'manager', email: process.env.TEST_MANAGER_EMAIL || 'admin@example.com', password: ... || 'admin123', authFile: .../manager.json }`(`:25-30`). `prisma/seed.ts`는 정확히 3명만 생성한다 — ADMIN 역할의 `admin@example.com`(`:277-296`), ENGINEER의 engineerEmail(`:320-334`), CLIENT_USER의 clientEmail(`:409-423`). **MANAGER 사용자도 CLIENT_ADMIN 사용자도 seed에 없다** — `seed.ts:139-170`이 ADMIN보다 엄격히 작은 권한 집합의 MANAGER 역할을, `:206-237`이 CLIENT_ADMIN을 만들면서도 그렇다. `test.use({ storageState: authFiles.manager })`를 쓰는 모든 스펙(21, 22, 23, 20, `helpers/test-helpers.ts`의 `withAuthContext('manager')`)이 **ADMIN 세션으로 구동**된다.

**영향**
MANAGER로 라벨된 모든 e2e 시나리오가 MANAGER 역할에 대해 아무것도 증명하지 못한다 — 모든 권한을 가진 채로 돈다. MANAGER 부여 범위를 좁히거나 넓히는 회귀(접수, 배정, 상태 전이, 재배정)가 보이지 않는다. 부정 테스트는 더 나쁘다 — `'MANAGER는 X를 할 수 없다'`를 단언하는 스펙은 실제로 ADMIN을 검증하므로(그리고 ADMIN은 X를 **할 수 있으므로**) 단언이 틀리게 된다. 이것이 빨간 스위트로 드러나지 않는 유일한 이유는 그 테스트들이 애초에 단언 없이 작성되었기 때문이다(3.34). CLIENT_ADMIN은 페르소나 자체가 없으므로 `src/actions/__tests__/client.actions.isolation.test.ts:55-70`이 고정하려던 교차 테넌트 동작(CLIENT_ADMIN이 자기 clientIds로 필터링되어야 함)이 **실제 단위 테스트도**(그 테스트는 정책을 mock한다) **e2e 테스트도 없다**.

**수정 방안**
`prisma/seed.ts`에 별도 MANAGER 사용자와 CLIENT_ADMIN 사용자를 시드하고, `TEST_MANAGER_EMAIL`을 실제 MANAGER 계정으로 지정하며, `auth-multi-user.setup.ts`에 4번째 `clientadmin` 페르소나 추가. 셋업에서 로그인 세션의 roles가 페르소나 이름과 일치하는지 단언(`/api/permissions/check` 호출 또는 세션 읽기)해 페르소나/역할 불일치가 조용한 권한 상승이 아니라 큰 실패로 드러나게 한다.

---

### 3.39 [HIGH] CSV 내보내기가 50k행 전체를 힙에서 조립, 레이트리밋 없음

> **✅ 해결됨 (2026-08-01).** `withAuthAndRateLimit(..., { preset: 'strict' })` 로 감싸고,
> CSV 를 `ReadableStream` 으로 1000행 배치씩 흘려보낸다(피크 힙이 O(배치)로 고정).
> 빈 결과는 404 가 아니라 헤더 행만 담은 200 이고,
> `Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff` 를 설정한다.
> 날짜는 KST 명시(3.25 와 함께). UI 는 429 를 "실패"가 아니라 "잠시 후 다시"로 안내한다.
> 회귀 테스트: `src/app/api/reports/export/__tests__/route.test.ts` (11건).

**파일**: `src/app/api/reports/export/route.ts:9, 22, 41-100`

**문제**

```ts
const EXPORT_ROW_LIMIT = 50000;
export async function GET() {            // ← withAuthAndRateLimit 아님
  const srs = await srService.getAllSRs({ where, orderBy: { createdAt: 'desc' }, take: EXPORT_ROW_LIMIT });
  const rows = srs.map(...);             // 50k 조인 문자열
  const csvContent = BOM + headers.map(csvCell).join(',') + '\n' + rows.join('\n');  // 거대 단일 문자열
  return new NextResponse(csvContent, {...});
```

저장소의 다른 모든 라우트가 `withAuthAndRateLimit`을 쓰는데 이 라우트만 쓰지 않는다 — 유일한 제한기는 `src/proxy.ts:32`의 엣지 미들웨어 버킷(IP당 100 req/min)이다. `getAllSRs`(`sr.service.ts:513-565`)는 각 행을 4개 조인 관계와 함께 하이드레이트하므로 50k행이 완전히 물질화되고, 두 번째 50k 문자열 배열로 매핑되고, 하나의 거대 문자열로 join된다 — **3개 사본이 동시에 존재**한다. 컨테이너 힙은 450MB(`docker-compose.prod.yml:32`)다. `Cache-Control`도 설정하지 않는다(`src/app/api/attachments/[id]/download/route.ts:68`은 올바르게 `'private, no-store'`를 설정).

**영향**
인증된 ADMIN 1명이 분당 최대 100회 내보내기를 발행할 수 있다. 각각이 ~50k 하이드레이트 Prisma 객체 + 50k 문자열 배열 + 연결된 CSV + 응답 사본을 보유하므로 요청당 100MB+ 라이브 힙이 쉽게 나온다. **동시 2~3건이면 450MB 캡을 넘어 단일 앱 컨테이너가 OOM-kill**되어 사이트 전체가 다운된다(`restart: always`가 복구하지만 진행 중 요청은 전부 유실). 부가적으로 빈 결과에 404를 반환하는 것(`:48`)은 잘못된 HTTP 시맨틱이며 UI에서 `'내보내기 실패'`(`ExportButton.tsx:25-27`)로 표면화되어 정직한 답("SR이 없습니다")을 하드 실패로 표시한다. `no-store` 부재로 중간 프록시나 브라우저 디스크 캐시가 모든 SR 제목·고객사명·요청자명이 담긴 CSV를 보관할 수 있다.

**수정 방안**

1. `withAuthAndRateLimit(..., { preset: 'strict' })`로 감싸 5/min으로 제한.
2. Prisma 커서 페이징 루프(배치당 1000행)로 채워지는 `ReadableStream`으로 CSV를 스트리밍해 피크 힙을 O(배치)로.
3. 결과 없음은 헤더 행만 담은 200으로 반환.
4. `'Cache-Control': 'private, no-store'`와 `'X-Content-Type-Options': 'nosniff'` 추가.
5. `toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })`로 날짜 타임존 명시(3.25).

---

### 3.40 [HIGH] /api/srs/my-requests에 페이지네이션이 전혀 없고 description 전문을 반환

> **✅ 해결됨 (2026-08-01).** 라우트를 `withAuthAndRateLimit` + `usePagination` 기반으로 재작성했다.
> `skip`/`take`(상한 `MAX_PAGE_SIZE=100`), `select` 에서 `description` 제거,
> `total` 을 실제 `prisma.sR.count()` 로, 통계 카드는 `groupBy('status')` 로 요청자 전체 기준 집계.
> `sortBy` 는 Map 기반 allowlist 로 제한했다(객체 인덱싱이면 `?sortBy=constructor` 가
> 프로토타입 체인에서 값을 찾아 기본값 분기를 건너뛴다).
> 페이지에는 페이지네이션 컨트롤을 추가하고, 5절에서 지적한 낡은 상태 필터
> (스키마에 없는 `RESOLVED`/`CANCELLED` 노출, `INTAKE`/`ON_HOLD`/`REJECTED` 누락)를
> `SRStatus` enum 에서 도출하도록 함께 고쳤다.
> 회귀 테스트: `src/app/api/srs/my-requests/__tests__/route.test.ts` (15건).

**파일**: `src/app/api/srs/my-requests/route.ts:49-103, 149`

**문제**

```ts
const srs = await prisma.sR.findMany({
  where,            // { requesterId: session.user.id, status? }
  orderBy,
  select: { id, srNumber, title, description, ..., _count: { select: { comments, attachments } } },
});
...
return NextResponse.json({ srs: srsWithExtras, total: srsWithExtras.length });
```

핸들러 어디에도 `take`, `skip`, cursor가 없다. `description`은 무제한 TEXT(`prisma/schema.prisma:241`)이며 다른 모든 목록 경로는 이를 의도적으로 제외한다(`sr.service.ts:526` 주석: "Optimized to exclude large text fields like description"). `total`이 배열 길이일 뿐이므로 클라이언트가 페이징할 수도 없다. 페이지 측(`src/app/(dashboard)/my-requests/page.tsx`)에도 페이지네이션 상태, 페이지 크기 컨트롤, 'load more'가 전혀 없다.

**영향**
수천 건을 제출한 장기 사용자가 `/my-requests` 방문마다 **description 본문 포함 전체 이력**을 450MB 힙에 하이드레이트하고 단일 JSON으로 직렬화한다. 응답 크기와 서버 메모리가 제품 수명에 따라 무제한 증가하고, 그런 사용자 몇 명의 새로고침으로 컨테이너가 고갈된다. PWA가 겨냥하는 모바일에서 앱에서 가장 느린 페이지이며, 실패가 아니라 조용히 열화한다.

**수정 방안**
다른 목록 라우트가 쓰는 `usePagination(request)` 헬퍼 채용(skip/take/orderBy + `createPaginatedResponse`), `select`에서 `description` 제거(상세 라우트가 이미 반환), 실제 `prisma.sR.count({ where })`로 total 반환, `take`를 `PAGINATION.MAX_PAGE_SIZE`로 제한. 기존 `srs_requester_id_created_at_idx`가 이미 `requesterId` + `createdAt` 정렬을 커버한다.

---

### 3.41 [HIGH] 다중 파일 업로드가 최대 100MB 본문을 힙에 물질화

> **✅ 해결됨 (2026-08-01).** 상한을 **50MB 로 통일**했다(소유자 결정 — 감사 권고 25MB 와
> 기존 100MB 사이의 절충).
>
> - `MAX_UPLOAD_FILE_SIZE` / `MAX_UPLOAD_TOTAL_SIZE` / `MAX_UPLOAD_FILE_COUNT` 를
>   `file-validator.ts` 한 곳에 두고 zip/rar/7z `maxSize` 와 nginx `client_max_body_size 50m` 을 맞췄다.
> - `assertUploadSizeWithinLimit()` 가 **`formData()` 호출 전에** Content-Length 를 검사해
>   413(`PayloadTooLargeError`)으로 거부한다.
> - 두 라우트의 계약을 통일했다(예전엔 10MB / 100MB 로 갈렸다). 배치 라우트는 파싱 후
>   총합도 한 번 더 확인한다(chunked 전송 대비).
>
> **남은 것:** busboy 증분 파싱은 감사가 '장기적으로' 로 분류한 항목이라 이번 범위 밖이다.
> 50MB 는 동시 2건 기준 ~100~200MB 로, 450MB 힙 안에서 견디지만 여유가 크지는 않다.
> 회귀 테스트: `src/lib/__tests__/upload-guard.test.ts` (10건).

**파일**: `src/app/api/srs/[id]/attachments/route.ts:55, 63-65, 78, 87`, `nginx/nginx.conf:78`, `src/lib/file-validator.ts:35-38`

**문제**

```ts
const formData = await req.formData();      // undici가 모든 파트를 메모리에 버퍼링
const files = formData.getAll('files') as File[];
...
await pipeline(Readable.fromWeb(file.stream() as any), writableStream);   // 소켓이 아닌 메모리에서 스트리밍
```

`:87`의 스트리밍 쓰기는 올바르지만 **전체 multipart 본문이 이미 상주한 뒤**에 일어난다 — Node 런타임의 `Request.formData()`는 모든 파트를 인메모리 Blob으로 파싱한다. 요청당 상한은 `client_max_body_size 100m`(`nginx/nginx.conf:78`), 파일 10개까지 허용(`:63-65`), 타입별 상한은 zip/rar/7z에 대해 100MB까지(`file-validator.ts:36-38`). `validateFile(file)`(`:78`)은 본문 버퍼링 **이후에** 실행되므로 타입별 제한이 메모리 보호를 전혀 제공하지 않는다. 단일 파일 경로는 정반대로 파일에 손대기 전에 사전 검사한다(`src/app/api/attachments/route.ts:27-29`, `MAX_FILE_SIZE = 10MB`).

**영향**
단일 100MB 업로드가 450MB 프로세스에 ~100-200MB 라이브 힙을 넣는다. 동시 2건(strict preset이 IP당 5/min을 허용하고 서로 다른 IP는 독립 버킷)이면 유일한 앱 컨테이너를 OOM-kill해 다른 모든 사용자의 요청을 떨어뜨린다. 또한 동일한 논리적 작업이 URL에 따라 두 계약을 갖는다 — `POST /api/attachments`는 10MB, `POST /api/srs/{id}/attachments`는 100MB — 그리고 UI가 둘 다 쓴다(`useEditSRForm.ts:169`가 배치 라우트 사용).

**수정 방안**

1. 업로드 location의 `client_max_body_size`를 힙이 흡수 가능한 값(예: 25m)으로 낮추고 file-validator의 zip/rar/7z `maxSize`를 맞춘다.
2. `formData()` 호출 전에 `Content-Length`를 검사해 초과 요청을 413으로 거부.
3. 두 라우트의 상한을 하나의 상수로 통일, 총합 크기 가드 추가.
4. 장기적으로 multipart 스트림을 증분 파싱(busboy를 `req.body`에)해 파일 바이트가 소켓 → 디스크로 힙 사본 없이 흐르게 하고, `uploadAttachmentBlob`의 `arrayBuffer()` + `Buffer.from`(`src/lib/storage.ts:56-59`, 전체 사본 2개)을 `pipeline(Readable.fromWeb(file.stream()), createWriteStream(...))`으로 교체.

---

### 3.42 [HIGH] 클라이언트 상세가 해당 고객사의 모든 SR을 전체 컬럼으로 로드

**파일**: `src/services/client.service.ts:35-85`

**문제**

```ts
async getClientDetailsById(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      users: { include: { user: { select: {... roles: { include: { role: true } } } } } },
      srs: true,                 // ← select 없음, take 없음, orderBy 없음
      serviceCategories: true,
      clientHandlers: { include: { user: {...}, backupHandler: {...} } },
    },
  });
}
```

`srs: true`는 해당 클라이언트의 모든 SR의 모든 컬럼을 선택한다 — `description`, `intake_notes`, `resolution_description`, `additional_feedback`(모두 무제한 TEXT, `prisma/schema.prisma:241, 257, 269, 273`) 포함. `getClientWithDetailsAndCategories`(`:275-298`)를 통해 클라이언트 상세 페이지 경로에서 도달한다.

**영향**
설명 평균 2KB인 SR 2만 건을 가진 클라이언트의 경우, 한 번의 페이지 뷰가 Postgres에서 Node로 ~40MB를 전송하고 직렬화하며 메모리에 보유한다. prod 컨테이너가 450MB로 캡되어 있으므로 대형 클라이언트를 동시에 몇 명만 열어도 앱 컨테이너가 OOM-kill된다. 3.6과 결합하면 CLIENT:READ 보유자가 이 페이로드를 타 테넌트에 대해 요청할 수 있다.

**수정 방안**
`srs: true`를 카운트만 필요하면 `_count: { select: { srs: true } }`로, 목록이 필요하면 `srs: { select: { id, srNumber, title, status, priority, createdAt }, orderBy: { createdAt: 'desc' }, take: 20 }`로 교체. 전체 목록은 페이지네이션된 `/api/srs?clientId=` 엔드포인트 뒤로 이동.

---

## 4. 개선 권장 (Medium)

### 4.1 보안 · 인가

- **JWT 30일 무효화 불가** — `src/auth.config.ts:5-7`이 `maxAge` 없이 `strategy: 'jwt'`를 설정해 Auth.js 기본값 30일이 적용된다. `src/auth.ts:100-209`의 jwt 콜백은 최초 로그인 또는 `trigger === 'update'`(둘 다 클라이언트 주도)일 때만 roles/permissions/clientIds를 재조회하고, 어떤 라우트도 `user.isActive`를 재검사하지 않는다. 결과적으로 `DELETE /api/users/[id]`(소프트 비활성화)와 역할 제거가 최대 30일간 대상의 접근을 종료하지 못한다. → `session.maxAge`를 8h로 명시하고 jwt 콜백에 `Date.now() - token.checkedAt > 60_000`일 때 `isActive` + `sessionVersion` 재조회를 추가, `deactivateUser`/`updateUser`/역할 배정에서 `sessionVersion`을 증가시킨다.

- **`handleApiError`가 500에서 raw `error.message` 반환** — `src/lib/api-error-handler.ts:44-53`이 환경 게이트 없이 `{ error: error.message, code: 'INTERNAL_ERROR' }`를 반환한다. Prisma의 `PrismaClientValidationError` 메시지는 모델명·필드 목록·생성 쿼리 형태를 포함하며, `?sortBy=<bogus>`나 `?status=BOGUS`로 자명하게 도달 가능하다. 게다가 Prisma 에러 코드 매핑이 전혀 없어(`grep 'P2002|PrismaClientKnownRequestError'` 무결과) 중복 생성이나 FK 위반이 409가 아닌 500/`INTERNAL_ERROR`가 된다. → Prisma 분기를 추가(P2002→409, P2025→404, P2003/P2014→409, ValidationError→400)하고 일반 분기는 프로덕션에서 고정 문자열 반환.

- **`sortBy`가 검증 없이 Prisma `orderBy`로 직행** — `src/lib/pagination.ts:234-245`의 `getPrismaOrderBy`가 allowlist 없이 `{ [sortBy]: sortOrder }`를 만들고 `paginationSchema`(`:39`)의 `sortBy`는 `z.string().optional()`이다. `/api/srs`, `/api/users`, `/api/clients`가 모두 이를 쓴다. `?sortBy=password`는 `/api/users`에서 bcrypt 해시로 정렬하는 순서 오라클이 되고, `?sortBy=doesNotExist`는 500 + 스키마 유출이다. 또한 `sortBy` 부재 시 `undefined`를 반환하므로 **ORDER BY 없이 OFFSET 페이징**이 실행되어 페이지 간 행 중복·누락이 발생한다. → 리소스별 allowlist를 `usePagination`에 파라미터로 전달하고, 기본 `orderBy`를 `[{ createdAt: 'desc' }, { id: 'desc' }]`(고유 tiebreaker 포함)로 항상 정의.

- **서버 액션이 REST 트윈의 테넌트 검사를 누락** — `src/actions/client.actions.ts:79-85`의 `updateClientAction`과 `:100-106`의 `deleteClientAction`이 멤버십 검사 없이 서비스로 직행한다. REST 대응물은 검사한다(`src/app/api/clients/[id]/route.ts:50-55`). SR 삭제도 동일 — `srService.deleteSR`이 `ensureCanDeleteSR(sessionUser)`(`sr.service.ts:577`)만 호출하는데 `policies.ts:103-105`는 `ADMIN || SR:DELETE`이고 **SR의 clientId를 참조하지 않는다**(`:575`에서 가져온 `existingSR`이 인가에 쓰이지 않음). → 테넌트 술어를 서비스/정책 계층으로 내려 `ensureCanDeleteSR(user, sr)`로 시그니처 변경 + `isInternalUser(user) || user.clientIds.includes(sr.clientId)` 요구, `ClientService.updateClient`/`deleteClient` 내부에도 동일 검사 추가 후 라우트의 중복 제거.

- **GET /api/service-categories가 모든 고객사의 카테고리·SLA·담당자 연락처를 전 인증 사용자에게 반환** — `src/app/api/service-categories/route.ts:7`이 인가 검사 없는 `withAuth`로 `serviceCategoryService.getAll()`을 호출하고, 이는 `where` 없이 모든 `ServiceCategory`를 `client: {id, code, name}`, `handler: {id, name, email}`, `backupHandler: {...}`와 조인해 반환한다(`service-category.service.ts:43-52`). 레이트리밋도 없고 first-party UI 소비자도 없다. 형제 라우트는 올바르게 처리한다(`src/app/api/clients/[id]/categories/route.ts:20-31`). → 비내부 사용자에 `where: { OR: [{ clientId: null }, { clientId: { in: session.user.clientIds } }] }` 적용, `isActive: true` 추가, handler 이메일 제외, `withAuthAndRateLimit` 전환. 소비자가 없으면 삭제.

- **`/api/clients/public`이 완전 익명 + 무제한** — `src/app/api/clients/public/route.ts:12-26`이 auth 호출 없이 모든 활성 클라이언트의 id/name/code를 `take` 없이 반환하고 레이트리밋도 없다. B2B 시스템에서 고객사 목록은 상업적으로 민감하며, 내부 cuid id가 다른 엔드포인트 탐침의 입력이 된다(3.6, 3.8이 이를 활용). → `withRateLimit(..., { limiter: rateLimiters.strict })`로 감싸고 `id`를 select에서 제거(가입이 code를 제출하면 서버에서 해석), `take` 추가, `unstable_cache` 적용.

- **CSP에 `'unsafe-inline'` + nonce 미적용, HSTS 전무** — `src/proxy.ts:65`가 nonce를 생성하고 `:72`가 `script-src 'self' 'unsafe-inline' 'nonce-${nonce}'`를 방출하지만, nonce는 `x-nonce` 헤더에만 놓이고(`:88, 98`) 어떤 `<script>` 태그에도 적용되지 않으므로 실효 정책은 `'unsafe-inline'`이다. `next.config.ts`의 `headers()`(`:15-28`)도 nginx의 443 블록(`nginx/nginx.conf:50-80, 83-113`)도 `Strict-Transport-Security`를 방출하지 않는다. → `'unsafe-inline'` 제거 + `src/app/layout.tsx`에서 `headers().get('x-nonce')`를 읽어 `next/script`에 전달(또는 `strict-dynamic`), nginx 443 블록에 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` 추가.

- **`public/uploads` 레거시 첨부가 정적 서빙 + 7개가 저장소에 커밋** — `src/lib/storage.ts:15`의 `LEGACY_PUBLIC_DIR`이 `resolveAttachmentFilePath`(`:87-108`)의 허용 해석 루트로 남아 있다. Next는 `public/` 하위 전부를 URL 루트에서 서빙하고 `Dockerfile:41`이 이를 런타임 이미지로 복사한다. `git ls-files`가 `public/uploads/attachments/1764287284930_라이센스이슈_수정.txt`를 추적 중임을 보이고 디렉터리에 7개 파일이 있다. `src/proxy.ts:111`의 matcher가 이미지 확장자를 제외하므로 **이미지는 세션 없이도 fetch 가능**하고, 비이미지 레거시 파일은 테넌트 무관 모든 인증 사용자가 `ensureCanReadSR`을 우회해 접근한다. → 남은 파일을 `STORAGE_DIR`로 이전 후 디렉터리 삭제, 추적 파일 7개 `git rm`, `storage.ts:87`의 roots 배열에서 `LEGACY_PUBLIC_DIR` 제거, `.dockerignore`에 `public/uploads` 추가.

- **레이트리밋 — 하위 결함 3/4 해소(2026-08-02), 공유 저장소는 의도적 보류**
  - ~~FIFO 축출로 strict 제한 우회~~ — **해소.** 용량 가드가 만료 여부를 보지 않고 삽입 순서로 500개를 지웠는데, 축출은 곧 토큰 리셋이므로 키를 대량 생성할 수 있는 쪽은 자기 소진 버킷을 밀어내는 것만으로 제한을 무한히 풀 수 있었다. 이제 만료분을 먼저 회수하고, 그래도 넘치면 **남은 토큰이 많은**(=제한과 무관한) 버킷부터 버린다. 소진 버킷까지 버려야 했다면 그 수를 로그에 남긴다 — 용량 부족으로 통제가 풀린 것을 조용히 넘기지 않는다.
  - ~~로그인이 strict 리미터를 거치지 않음~~ — **해소.** `/api/auth/[...nextauth]` 가 Auth.js 핸들러를 그대로 export 해서 자격증명 로그인이 분당 5회 제한을 한 번도 통과하지 않았다. POST 를 감싸 `이메일 + IP` 키로 strict 를 적용한다. 다른 Auth.js 엔드포인트(session·csrf·signout)는 정상 사용 중에도 자주 호출되므로 제외했다.
  - ~~IP 만으로 키잉~~ — **해소.** 세션 쿠키가 있으면 세션별로 키잉한다(쿠키 값은 해시만 하고 서명 검증은 하지 않는다 — 위조해도 자기 버킷을 얻을 뿐이고 인가는 뒤의 `withAuth` 가 한다). NAT 뒤 사무실 전체가 strict 예산을 공유하던 문제가 사라진다. 익명 요청은 그대로 IP 로 묶이므로 로그인 폭주 방어에는 영향이 없다.
  - **프로세스 로컬 저장소 — 보류(의도적).** 현재 배포는 `docker-compose.prod.yml` 의 `app` 컨테이너 하나이고 nginx 도 단일 upstream 이라, 프로세스 로컬 상태가 전체 트래픽을 정확히 통제한다. Redis/Postgres 리미터를 지금 넣으면 실익 없이 인프라만 늘어난다. **앱 인스턴스를 둘 이상으로 늘리는 순간 실효 한도가 인스턴스 수만큼 곱해지므로**, 스케일아웃이 그 트리거다. 이 조건을 `rate-limiter.ts` 상단 주석에도 남겼다.

  회귀 테스트: `rate-limiter.eviction.test.ts`(3), `route.rate-limit.test.ts`(4). 축출 우회와 로그인 미제한을 각각 예전 코드로 되돌려 실제로 실패하는 것을 확인했다. 기존 테스트 `'임계치 초과 시 오래된 버킷 500개를 방출해야 함 (FIFO)'` 은 우회 정책 자체를 사양으로 못 박고 있었으므로 정정했다.

  원문: **레이트리밋이 프로세스 로컬 + 로그인 전용 strict 리미터 없음 + IP만으로 키잉** — `src/lib/rate-limiter.ts:69`의 `MemoryRateLimiter`가 프로세스별 `Map`을 유지하고 `:242-248`의 싱글턴이 모듈 스코프에 산다. `/api/auth/[...nextauth]`(`src/app/api/auth/[...nextauth]/route.ts:6`)는 래퍼 없이 Auth.js 핸들러를 직접 export하므로 자격증명 로그인이 일반 미들웨어 버킷(`.env.docker:52`에서 20/min)으로만 제한되고 `rateLimiters.strict`(5/min)를 절대 거치지 않는다. `withRateLimit`의 기본 `keyGenerator`(`src/lib/api-rate-limit.ts:31`)는 `getClientIp`이며 `withAuthAndRateLimit`은 `rateLimit(withAuth(handler), preset)`(`auth-wrapper.ts:137`)로 구성되어 **인증 이전에 토큰을 소비**하므로 세션 id를 키에 쓸 수 없다. 결과적으로 NAT 뒤 사무실 전체가 댓글·SR 수정 같은 핵심 쓰기에서 5/min 예산을 공유한다. 또한 `:161-168`의 OOM 가드가 만료 여부를 확인하지 않고 삽입 순서 가장 오래된 500개를 삭제하므로, 10,000개 이상의 키를 생성하면 자기 버킷이 축출되고 전체 토큰으로 재생성되어 **strict 제한을 우회**할 수 있다. → 공유 저장소(Redis 또는 Postgres — `sr_sequences`와 동일한 `INSERT ... ON CONFLICT` 패턴)로 이전, NextAuth POST를 `email + ip` 키의 strict로 래핑, 인증 사용자 id를 우선하는 keyGenerator 도입, FIFO 가드가 만료된 버킷만 축출하도록 수정.

- **첨부 업로드가 읽기 권한으로 게이트되고 삭제는 쓰기 권한** — `src/app/api/srs/[id]/attachments/route.ts:52`와 `src/app/api/attachments/route.ts:40`이 `ensureCanReadSR`로 게이트하는 반면 삭제(`src/app/api/attachments/[id]/route.ts:72`)는 `ensureCanUpdateSR`을 요구한다. `canReadSR`(`policies.ts:53-60`)은 `SR:READ` 보유 + 클라이언트 소속이면 통과하므로 **읽기 전용 사용자가 파일을 업로드**할 수 있고, 게다가 `sr.status`를 검사하지 않아 COMPLETED/CONFIRMED/REJECTED 상태의 종결 레코드와 감사 추적을 변경할 수 있다. 자기가 올린 것을 삭제할 수도 없다. → 두 업로드 경로를 `ensureCanUpdateSR`로 전환 + 종결 상태 가드 추가.

- **COMMENT:\*/ATTACHMENT:\* 권한이 시드·부여되지만 어디에서도 강제되지 않음** — `prisma/seed.ts:42-51`이 정의하고 MANAGER(`:152-153`), ENGINEER(`:186-187`), CLIENT_ADMIN(`:219-220`), CLIENT_USER(`:251-252`)에 부여하지만, src 전역 grep 결과 UI 레이블 맵(`SRActivities.tsx:21-31`)과 알림 수신자 쿼리(`user.service.ts:718-720`) 외에 어떤 정책 함수나 라우트도 검사하지 않는다. 관리자가 ATTACHMENT:CREATE를 회수해도 동작 변화가 전혀 없으면서 UI는 제거된 것으로 표시한다 — **조용히 무효한 통제**. → `ensureCanCreateAttachment`/`ensureCanCreateComment` 헬퍼를 `policies.ts`에 추가해 세 쓰기 핸들러에서 호출하거나, 원하지 않는 권한이면 시드 카탈로그에서 삭제.

- ~~**정책 계층이 의존하는 3개 권한 문자열이 카탈로그에 존재하지 않음**~~ — **해소됨(2026-08-01).** 카탈로그를 `prisma/permission-catalog.ts` 로 분리하고 `SR:UPDATE_SELF`, `USER:UPDATE_SELF`, `ROLE:ASSIGN` 세 행을 추가했다. 4.3 재오픈 수정이 도입한 `SR:INTAKE` / `SR:CONFIRM` 도 같은 함정에 빠져 있었으므로 함께 넣었다 — 정책 코드는 검사하는데 카탈로그에 없으면 RBAC 화면에 뜨지 않아 부여할 방법 자체가 없다. 역할 매핑도 맞췄다(ENGINEER +`SR:INTAKE`, CLIENT_ADMIN·CLIENT_USER +`SR:CONFIRM`, 전 역할 +`USER:UPDATE_SELF`). MANAGER 의 `{ resource: 'SR' }` 와일드카드는 새로 생긴 `SR:CONFIRM` 까지 집어가 `TRANSITION_ROLES` 의 고객 전용 확인 규칙을 권한 경로로 우회시키므로 명시 액션 목록으로 바꿨다. `src/lib/__tests__/permission-catalog.test.ts` 가 `PERMISSIONS` 와 `TRANSITION_PERMISSIONS` 의 모든 문자열에 대응 행이 있음을 단언한다 — 카탈로그에서 두 행을 지우고 실패를 확인했다. 마이그레이션은 불필요하다(권한 행은 부팅 시드가 upsert 한다).

  원문: **정책 계층이 의존하는 3개 권한 문자열이 카탈로그에 존재하지 않음** — `src/lib/permission-helpers.ts:8, 21, 29`가 `SR:UPDATE_SELF`, `USER:UPDATE_SELF`, `ROLE:ASSIGN`을 정의하지만 `prisma/seed.ts:13-60`의 카탈로그에는 셋 다 없다. 드리프트가 시드 내부에서 가시적이다 — `:250`이 CLIENT_USER에 `action: {in:['CREATE','READ','UPDATE_SELF']}`를 부여하려 하지만 존재하지 않는 행에 대한 `findMany`이므로 UPDATE_SELF가 조용히 탈락한다. 결과: (1) CLIENT_USER가 자기 SR을 전혀 수정할 수 없고, (2) `USER:UPDATE_SELF`가 없어 모든 자기 프로필 수정이 **테넌트 전역 쓰기를 부여하는 `USER:UPDATE` 경로로 밀려나며**(이것이 정확히 3.7의 권한상승을 낳는 압력), (3) `POST /api/users/[id]/roles`와 `canAssignRole`이 영구히 ADMIN 전용이다. → 3개 행을 시드에 추가 + 마이그레이션, 그리고 `PERMISSIONS`의 모든 값에 대응하는 DB 행이 있음을 단언하는 단위 테스트 추가.

- **서버 액션이 카탈로그에 없는 권한 문자열로 인가** — `changePasswordAction`이 `authenticateAndAuthorize('user:change_password')`(`src/actions/user.actions.ts:63`), `updateRolePermissionsAction`이 `'role:update_permissions'`(`role.actions.ts:118`)를 쓰는데 시드에 `USER:CHANGE_PASSWORD`도 `ROLE:UPDATE_PERMISSIONS`도 없다. ADMIN은 단락되고(`permission.service.ts:71`) 나머지는 ForbiddenError — fail-closed지만 검토 불가능한 패턴이다. → `authenticateAndAuthorize`가 `string` 대신 `(typeof PERMISSIONS)[keyof ...]` 유니온만 받도록 변경하고 모든 리터럴을 `PERMISSIONS.*` 상수로 교체.

- **ENGINEER가 목록에서는 internal로 취급되어 모든 테넌트의 SR을 봄** — `src/app/api/srs/route.ts:29`의 `isInternalUser`(`policies.ts:13, 25-27`)가 ENGINEER를 포함하지만 `canReadSR`(`:47-51`)은 ENGINEER를 `sr.assigneeId === user.id`로 제한한다. 대시보드(`dashboard/stats/route.ts:18-20`)와 intake POST(`intake/route.ts:34-42`)도 동일한 분열을 보인다. `reports/export/route.ts:39`는 올바른 형태를 이미 구현하고 있다. → `getSRScopeFilter(user): Prisma.SRWhereInput`를 정책 옆에 두고(ADMIN/MANAGER는 `{}`, ENGINEER는 `{ assigneeId: user.id }`, 그 외는 `{ clientId: { in: user.clientIds } }`) `/api/srs`·`/api/dashboard/stats`·`/api/reports/export`에서 사용.

- **`.dockerignore`가 `.env.docker*`와 `*.key`를 제외하지 않음** — `.dockerignore:10-17`이 `.env`, `.env.local`, `.env.production`, `.env.test`, `.env*.local`만 제외하고 `.env.docker`/`.env.docker.test`도, `*.key`/`*.pem`도 없다. `Dockerfile:24-25`의 `COPY . .`가 두 env 파일과 저장소 루트의 `ssh-key-2026-01-18.key`(1675바이트, `-----BEGIN RSA PRIVATE KEY-----`)를 builder 레이어에 복사하고, `deploy.yml:60-61`의 `cache-to: type=gha,mode=max`가 모든 레이어를 GitHub Actions 캐시로 내보낸다. 최종 런타임 이미지는 깨끗하지만 중간 레이어가 GHA 캐시와 로컬 빌더 캐시에 영속한다. → `*.key`, `*.pem`, `.env.docker*`, `public/uploads`, `lint_output.txt`, `*.tsbuildinfo`, `.agent/ .gemini/ .jules/ .Jules/ .claude/`를 `.dockerignore`에 추가, SSH 키를 `~/.ssh`로 이동하고 로테이션, `cache-to: type=gha,mode=min` 검토.

### 4.2 데이터 계층

- **SR 목록 기본 정렬 `created_at DESC`를 지원하는 인덱스 없음** — `prisma/schema.prisma:288-296`이 선언하는 8개 인덱스 중 `created_at` 단독도, `(client_id, created_at)`도 없다. SR 목록 페이지는 `sort = 'createdAt.desc'`가 기본(`srs/page.tsx:27`)이고, 클라이언트 사용자의 `where`는 `clientId: { in: userClientIds }`이므로 `srs_client_id_status_idx`가 필터는 공급하지만 정렬은 공급하지 못해 Postgres가 매칭 행 전체를 물질화·정렬한 후 OFFSET/LIMIT을 적용한다. 여기에 같은 페이지의 5개 badge 카운트 쿼리(`page.tsx:170-186`)가 동일 테이블에 동시 실행된다. → `@@index([createdAt(sort: Desc)])`와 `@@index([clientId, createdAt(sort: Desc)])` 추가 + `CREATE INDEX CONCURRENTLY` 마이그레이션. `(assignee_id, created_at DESC)`도 검토.

- ~~**첨부 쓰기 3경로가 전부 비원자적**~~ — **해소됨(2026-08-02).** 세 경로를 각각 `$transaction` 으로 묶었다. 단일 업로드는 create·update·activity 를, 배치는 createManyAndReturn·update·activity 를 한 트랜잭션에 넣고 배치에 없던 `ATTACHMENT_ADDED` 를 추가했다. 삭제는 순서를 뒤집어 행을 커밋한 뒤 blob 을 지운다 — 이 순서의 최악은 참조 없는 파일이고 사용자에게 보이지 않는다. 파일은 트랜잭션 밖에서 디스크에 쓰이므로 롤백 시 되돌린다. 권장안 중 "id 클라이언트 측 생성으로 두 번째 UPDATE 제거"는 채택하지 않았다 — `SRAttachment.id` 가 `@db.VarChar(30)` 인데 `crypto.randomUUID()` 는 36자라 넘치고, 원자성은 트랜잭션만으로 이미 확보된다. 회귀 테스트 8개를 추가했고(그 전에는 이 라우트들에 테스트가 하나도 없었다) 삭제 순서를 예전 방식으로 되돌려 실제로 실패하는 것을 확인했다.

  원문: **첨부 쓰기 3경로가 전부 비원자적** — 단일 업로드가 `create`(fileUrl: '') → `update`(fileUrl 채움) → `sRActivity.create`를 트랜잭션 없이 수행한다(`src/app/api/attachments/route.ts:58, 72, 76`). 배치는 `createManyAndReturn` 후 N개 `update`를 `Promise.all`로 실행하며 activity 로그 자체가 없다(`srs/[id]/attachments/route.ts:125-137`). 삭제는 파일을 먼저 지우고 행을 지운다(`attachments/[id]/route.ts:79-95`). 중간 실패 시 `fileUrl = ''`인 죽은 링크, 감사 추적 없는 첨부, 없는 파일을 가리켜 매 다운로드가 500나는 고아 행이 남는다. 댓글 경로는 올바르게 트랜잭션이다(`srs/[id]/comments/route.ts:108-136`). → 각 플로우를 `$transaction`으로 감싸고, id를 클라이언트 측 생성(`crypto.randomUUID()`)해 최초 insert에 `fileUrl`을 넣어 두 번째 UPDATE와 N+1을 제거. 삭제는 트랜잭션 내에서 DB 행을 먼저 지우고 커밋 후 blob 삭제. 배치에 `ATTACHMENT_ADDED` activity 추가.

- **SR 삭제가 첨부 행을 캐스케이드하지만 파일은 영구 유출** — `sr.service.ts:580-594`가 감사 로그 + `sR.delete`만 트랜잭션에 넣는다. `SRAttachment.sr`이 `onDelete: Cascade`(`prisma/schema.prisma:361`)이므로 `storagePath`를 포함한 행이 사라지지만 `deleteAttachmentBlob`은 `attachments/[id]/route.ts:79`에서만 호출된다(src 전역 grep 확인). 모든 삭제된 SR이 업로드 파일을 경로 기록 없이 `sr_uploads` 볼륨에 영구 방치해 호스트 디스크가 찰 때까지 단조 증가한다. 추가로 `:591-592`의 `deleteClient` mock 폴백이 `tx` 대신 `prisma`를 선택하면 삭제가 **트랜잭션 밖에서** 실행되어 감사 로그 롤백이 삭제를 되돌리지 못한다. → 트랜잭션 전에 `storagePath`를 조회하고 커밋 후 best-effort 삭제, mock 폴백 제거, 감사 추적 손실을 고려해 소프트 삭제 검토.

- **intake PATCH가 SR 변경을 커밋한 뒤 activity 로그를 트랜잭션 밖에서 기록** — 가드된 업데이트는 트랜잭션이지만(`intake/route.ts:436-482`) 두 activity 레코드가 반환 후에 쓰인다(`:534, :554`). 같은 파일의 intake POST는 올바르게 트랜잭션 내부에서 생성한다(`:178-208`). 커밋과 activity insert 사이 프로세스가 죽으면 담당자/우선순위가 바뀐 SR이 설명 없는 상태로 남는다 — 재배정은 설명 없는 변경이 가장 문제되는 작업이다. → `changes`/`newValues` 계산을 트랜잭션 위로 올리고 두 `sRActivity`를 같은 `$transaction` 콜백 안에서 `tx.sRActivity.create`로 생성.

- **사용자↔클라이언트 멤버십 변경이 `findFirst`로 임의 행 선택, 비트랜잭션, 미처리 unique 위반** — `src/app/api/users/[id]/client/route.ts:155`가 `orderBy` 없는 `findFirst`로 멤버십을 고르고 `:221` update / `:227` create를 트랜잭션 없이 수행한다. 스키마는 다대다를 명시적으로 지원하므로(`UserClient` + `@@unique([userId, clientId])`, `prisma/schema.prisma:157-171`) 다중 클라이언트 사용자에게는 **어느 멤버십이 변경되는지 비결정적**이다. 대상 clientId가 이미 소속이면 P2002가 발생하고 이 핸들러는 이를 매핑하지 않아 일반 500이 된다. 승인 라우트와 달리 감사 로그도 없다. `status`/`approvedAt`도 create 경로에서 설정되지 않는다. → `prisma.userClient.upsert({ where: { userId_clientId: {...} } })`로 멱등화, `$transaction`으로 감싸고 `auditService.createLog` 추가, APPROVED 생성 시 `approvedAt` 설정.

- **`(clientId, categoryName)` unique 제약 부재 — 중복 검사가 TOCTOU** — `src/services/service-category.service.ts:134`가 `findFirst` 후 `create`하고, `ServiceCategory` 모델(`prisma/schema.prisma:174-195`)에는 `@@unique`가 없다. 더블 클릭이나 재시도로 동일 이름 카테고리가 중복 생성되어 SLA 시간이 다른 항목 두 개가 드롭다운에 나타나고 SR이 갈라져 카테고리별 리포팅이 오염된다. `clientId`가 nullable이므로 단순 복합 unique로는 글로벌(NULL) 행을 제약하지 못한다. → 부분 unique 인덱스 2개 추가: `WHERE "client_id" IS NOT NULL`인 `(client_id, category_name)`과 `WHERE "client_id" IS NULL`인 `(category_name)`. P2002를 catch해 `DuplicateError`로 재던지기.

- **SLA 준수율이 마감일 없는 SR을 위반으로 계산** — `src/app/api/dashboard/stats/route.ts:227`의 `COUNT(*) FILTER (WHERE completed_at <= due_date)`에서 `due_date`가 nullable(`prisma/schema.prisma:265`)이므로 `completed_at <= NULL`이 NULL이 되어 FILTER는 false로 취급하지만 **분모에는 계속 포함**된다. `due_date`는 접수 경로(`intake/route.ts:138`) 또는 `actualPriority` 변경(`sr.service.ts:253-258`)에서만 채워지므로, 일반 PATCH로 INTAKE된 SR은 `intake_at`이 설정되고 `due_date`가 NULL인 상태로 SLA 분모에 들어간다(`sr.service.ts:281-288`이 `intakeAt`만 백필하고 dueDate를 계산하지 않음). → INTAKE 백필 블록에서 `serviceCategoryService.calculateDueDate`로 dueDate도 계산하고, 대시보드 쿼리를 `COUNT(*) FILTER (WHERE due_date IS NOT NULL AND completed_at <= due_date) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE due_date IS NOT NULL), 0)`로 변경.

- **SR 목록 검색이 5개 컬럼(3개는 조인)에 앵커 없는 ILIKE를 요청당 2회 실행** — `srs/page.tsx:103-111`의 `where.OR`가 `srNumber`, `title`, `client.name`, `requester.name`, `assignee.name`에 `mode: 'insensitive'`(= `ILIKE '%term%'`)를 걸고, 이 `where`가 행 조회와 총 카운트 양쪽에 쓰인다(`:164-170`). `pg_trgm` 확장도 GIN 인덱스도 마이그레이션 어디에도 없다. 500ms 디바운스 이후의 모든 키 입력이 `srs` 전체 순차 스캔 2회 + `users`/`clients`와의 중첩 루프 조인 3회를 트리거한다. → `CREATE EXTENSION pg_trgm` + `srs.title`, `srs.sr_number`, `clients.name`, `users.name`에 GIN trgm 인덱스. 최소한 `srNumber`를 `startsWith`로 앵커하고 최소 검색 길이 2~3자 요구.

- **SR 상세와 댓글 엔드포인트가 자식 컬렉션을 상한 없이 조회** — `getSRDetailsById`가 activities와 comments는 `take: 20`으로 제한하지만 `attachments`(`sr.service.ts:492-494`)와 `statusHistory`(`:495-502`)에는 `take`가 없다. `GET /api/srs/[id]/comments`(`comments/route.ts:34-48`)와 `/activities`(`activities/route.ts:27-41`)도 `take`가 없다 — 같은 서비스에 커서 페이징된 `getSRComments`(`:718-737`)와 `getStatusHistory`(`:611`)가 이미 있는데도 그렇다. → `attachments`에 `take: 50`, `statusHistory`에 `take: 20` 추가, 두 REST 라우트를 서버 액션이 이미 쓰는 커서+limit 계약으로 전환(또는 UI가 액션 경로를 쓴다면 삭제).

- **`sr_number` 채번이 UTC 날짜 사용, 시퀀스 행이 전체 SR 생성 트랜잭션 동안 잠김** — `sr.service.ts:56-57`이 `today.toISOString().slice(0, 10)`으로 dateStr을 만들고 `ON CONFLICT DO UPDATE`가 `sr_sequences(date)`에 건 행 잠금이 `sR.create` + 중첩 자식 insert 2개까지 커밋 시점에 유지된다. 10:00 KST 생성 SR은 `SR-20260730-0001`인데 08:00 KST 생성 SR은 `SR-20260729-xxxx`가 된다. → dateStr을 비즈니스 타임존에서 계산(3.25와 함께), 잠금 단축을 위해 시퀀스를 짧은 별도 트랜잭션에서 획득 검토.

- **스키마/마이그레이션 드리프트** — `schema.prisma`의 `NotificationType`은 `EMAIL/IN_APP/PUSH`인데 DB에는 `MATTERMOST`가 있고(`prisma/migrations/0_init/migration.sql:11`), `client_handlers.mattermost_id` 컬럼이 `0_init:158`에서 생성되고 `20260623055403:213`에서 여전히 alter되지만 `ClientHandler` 모델(`schema.prisma:197-214`)에 해당 필드가 없다. `prisma migrate dev`가 드리프트를 감지해 DB 리셋을 제안하며, `migrate status`를 배포 게이트로 신뢰할 수 없다. → 컬럼 삭제 + enum 재구축 마이그레이션 추가, CI에 `prisma migrate diff --exit-code` 스텝 추가.

- **`prisma.$transaction` 재래핑과 빌드 타임 폴백** — `src/lib/prisma.ts:30-33`이 모듈 평가마다 `$transaction`을 래핑하는데, dev에서 `globalThis` 재사용 + HMR 재실행으로 **이미 래핑된 함수 위에 또 래핑**된다. N회 리로드 후 모든 트랜잭션이 N중 `transactionLocalStorage.run` 프레임에서 실행되고 이벤트 버퍼를 N회 플러시해 **로컬에서 도메인/실시간 이벤트가 중복 발행**된다 — 알림 버그가 간헐적으로 보이는 원인. `:62`의 `safePrisma = prisma ?? ({} as PrismaClient)`는 `DATABASE_URL` 부재 시 임의 라우트에서 `TypeError: Cannot read properties of undefined`를 만든다. → `if (prisma && !(prisma as any).__txPatched) { ...; __txPatched = true; }` 가드 추가, `{}` 폴백을 접근 시 명확한 에러를 던지는 Proxy로 교체.

- **`getCachedUsers`/`getCachedClients`가 스코프되지 않음** — `src/lib/cache.ts:13-19`가 테넌트 필터도 `take`도 없이 모든 활성 사용자의 id/name/email을 반환하고, `srs/page.tsx:22-23, 187-188`이 무조건 호출해 `<SRsDataTable clients={clients} users={users} />`로 클라이언트 번들에 직렬화한다. 같은 페이지가 SR 쿼리는 clientId로 신중히 스코프하면서(`:66-87`) 이 두 조회에는 적용하지 않는다. CLIENT_USER가 `/srs`를 로드하면 **시스템 내 모든 활성 사용자의 id·이름·이메일**을 RSC 페이로드로 받는다. 300초 메모이제이션 키가 고정(`['users']`/`['clients']`)이라 모든 역할에 동일 결과가 서빙된다. → 두 캐시 헬퍼를 호출자 스코프로 파라미터화(또는 외부 사용자는 캐시 우회), `src/actions/client.actions.ts:151-155`의 올바른 패턴 미러링.

### 4.3 API · 도메인 로직

- **접수 버튼이 ENGINEER 에게만 숨겨져 있다(미해소, 반대 방향의 같은 발산)** — `SRStatusActions.tsx` 의 `canAccept = hasRole(['ADMIN','MANAGER'])` 가 REQUESTED 상태의 접수 버튼을 게이트하는데, `TRANSITION_ROLES.REQUESTED.INTAKE` 와 `api/srs/[id]/intake/route.ts:32` 는 둘 다 ENGINEER 를 허용한다. 서버는 되는데 UI 가 가리는 형태라 4.3 의 '보이는데 거부됨'과 반대로 무해한 방향이지만 같은 종류의 발산이다. 재오픈 수정으로 도입한 `canPerformTransition()` 을 나머지 버튼(접수·거절·진행 시작·완료·보류·재개)에도 적용하면 한 번에 제거된다. 다만 이는 ENGINEER 가 실제로 보게 되는 액션이 늘어나는 **운영 정책 변경**이므로 소유자 확인 후 진행한다. 확인(CONFIRMED) 버튼은 예외로 둬야 한다 — status 라우트가 요청자 본인만 허용하므로 역할 표대로 CLIENT_ADMIN 에게 노출하면 새 막다른 길이 생긴다.

- **모든 텍스트 필드에 최대 길이 없음, nginx 본문 상한 100MB** — `src/lib/schemas.ts:85` 등에서 `min`만 있고 `max`가 없다: `srCreateSchema.title/description`, `srUpdateSchema.resolutionDescription/rejectionReason/intakeNotes`, `intakeSchema.intakeNotes`, `roleCreateSchema.name/description`, `clientCreateSchema.code/name/address`, `serviceCategoryCreateSchema.*`, `comments/route.ts:12-14`의 인라인 `commentSchema`. `passwordSchema`와 `userCreateSchema.name`만 `.max()`가 있다. 인증된 단일 POST가 ~100MB 텍스트를 Postgres text 컬럼에 영속시킬 수 있고, strict 5/min이면 분당 500MB다. → 모든 문자열 필드에 명시적 `.max()` 추가(title 200, description 10000, comment 5000, 이름류 100), 쓰기 라우트에서 `content-length` 사전 가드(>1MB는 413), nginx `/api/` location의 `client_max_body_size`를 실제 첨부 상한에 맞춰 하향.

- **깨진/빈 JSON 본문이 400이 아닌 500** — `src/lib/api-helpers.ts:15`의 `validateRequestBody`가 `await request.json()`을 try 블록 **밖에** 두어 SyntaxError가 일반 Error로 탈출한다. 헬퍼를 쓰지 않고 인라인된 6곳도 동일(`srs/route.ts:82`, `roles/route.ts:30`, `clients/route.ts:79`, `srs/[id]/status/route.ts:27`, `srs/[id]/comments/route.ts:63`, `settings/system/route.ts:45`). `permissions/check/route.ts:22`는 더 나쁘다 — 구조 분해이므로 `null` 본문에서 TypeError. 5xx만 재시도하는 클라이언트가 절대 성공할 수 없는 요청을 재시도한다. → `validateRequestBody` 내부로 파싱을 옮기고 `BadRequestError`를 던지는 `parseJsonBody(request)` 헬퍼를 만들어 6곳 전부에 적용.

- **SR 목록 쿼리 파라미터가 검증 없이 Prisma enum으로 캐스팅** — `src/app/api/srs/route.ts:51`이 `status: (searchParams.get('status') as SRStatus)`, `priority: (... as SRPriority)`로 raw 캐스트하고 `my-requests/route.ts:31`도 `status as any`다. `?status=FOO`가 `PrismaClientValidationError` → 500 + 전체 Prisma 에러 텍스트 유출이 된다. 400이어야 할 것이 5xx다. → 핸들러 상단에서 zod로 전체 쿼리 파싱(`z.nativeEnum(SRStatus).optional()` 등), ZodError는 이미 `handleApiError`가 400으로 매핑한다.

- **SSE 엔드포인트가 nginx에 버퍼링되고, stream cancel 핸들러 없고, 25 동시 연결에서 리스너 상한 초과** — `src/app/api/realtime/route.ts:119-125`가 `X-Accel-Buffering: no`를 설정하지 않고, `nginx/nginx.conf`의 `location /` 블록들이 `proxy_buffering off`를 설정하지 않아 기본값 `on`이 적용된다. `ReadableStream`(`:58`)이 `start(controller)`만 구현하고 `cancel()`이 없어 4개 `realtimeEmitter.off`와 `clearInterval(keepAlive)`가 전적으로 `request.signal` abort 리스너(`:107-115`)에만 있다. `realtime-events.ts:12`가 `setMaxListeners(100)`인데 연결당 리스너 4개를 등록한다. 라우트가 `withAuthAndRateLimit`으로 감싸이지 않아 한 클라이언트가 열 수 있는 스트림 수에 상한이 없다. → 응답에 `'X-Accel-Buffering': 'no'` 추가 + nginx에 전용 `location /api/realtime` 블록(`proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s; chunked_transfer_encoding off;`), 정리 로직을 `cleanup()`으로 추출해 abort 리스너·새 `cancel()`·enqueue catch 블록에서 호출, `withAuthAndRateLimit` 적용, 초기 `: connected\n\n` 프레임으로 헤더 즉시 플러시.

- **7일 재오픈 창과 요청자 전용 확인이 status 라우트에만 존재** — `src/app/api/srs/[id]/status/route.ts:141-152`(7일 가드)와 `:124-126`(요청자 확인)의 규칙이 `src/lib/sr-state-machine.ts`에도 `srService.updateSR`에도 없다. `PATCH /api/srs/[id]`(`srs/[id]/route.ts:66`)가 status를 받는 raw `srUpdateSchema` 바디로 `updateSR`에 직행하므로 CLIENT_ADMIN/CLIENT_USER가 1년 전 확인된 SR을 재오픈할 수 있고 CONFIRMED가 사실상 비종단 상태가 된다. → 두 규칙을 `validateTransition`(또는 `SRService.updateSR`이 호출하는 가드)으로 이동.

- **상태 전이 인가가 하드코딩 역할명에 기반하고 roles 배열이 비면 검사 자체를 건너뜀** — `src/lib/sr-state-machine.ts:121`의 `if (userRoles && userRoles.length > 0)`가 `[]`일 때 역할 게이트 전체를 건너뛰고 `{ valid: true }`로 떨어진다(fail-open). `src/auth.ts:155, 217`이 사용자 조회 실패 시 `token.roles = []`로 설정한다. 또한 allow-list가 리터럴 역할명(`:33-57`)인 반면 앱의 나머지는 권한으로 인가하므로, 운영자가 만든 커스텀 역할(`SR:UPDATE` + `SR:STATUS_CHANGE` 부여)이 `canUpdateSR`은 통과하지만 **단 하나의 전이도 수행할 수 없다** — RBAC 관리 UI가 조용히 사용 불가한 역할을 생산한다. → 역할 부재 시 fail-closed(`if (!userRoles?.length) return { valid:false, ... }`), 전이 권한을 permission(`SR:INTAKE`, `SR:STATUS_CHANGE`, `SR:CONFIRM`)으로 표현.

- ~~**MANAGER에게 재오픈 버튼을 보여주지만 서버가 항상 거부**~~ — **해소됨(2026-08-01).** 규칙 쪽을 넓혔다: `TRANSITION_ROLES` 의 재오픈 두 엣지(`COMPLETED→IN_PROGRESS`, `CONFIRMED→IN_PROGRESS`)에 MANAGER 를 추가했다. 재오픈은 운영자가 실제로 수행하는 일이고, 확인(`COMPLETED→CONFIRMED`)은 고객 인수 행위이므로 MANAGER 를 넣지 **않았다**. ENGINEER 도 여전히 재오픈할 수 없다. 버튼 가시성은 새 `canPerformTransition()` 헬퍼로 상태 머신에서 도출하므로(`SRStatusActions.tsx`) 규칙만 바꿔도 UI 가 따라온다 — 독립 판단하던 `isManager` 지역 변수는 제거했다. 상세 페이지가 `userPermissions` 를 함께 넘겨 커스텀 역할도 같은 경로로 판정된다. 기존 테스트 `'enforces client-only roles on CONFIRMED -> IN_PROGRESS reopen'` 은 당시 정책을 정확히 기록한 것이었으므로, 정책 변경 사실과 근거를 주석에 남기고 갱신했다. 재오픈 엣지의 `TRANSITION_PERMISSIONS` 는 처음에 `['SR:CONFIRM','SR:STATUS_CHANGE']` 였는데, 시드 ENGINEER 가 `SR:STATUS_CHANGE` 를 보유하므로 역할 표의 ENGINEER 제외가 권한 경로로 그대로 우회됐다 — 고치려던 것과 같은 발산이라 `['SR:CONFIRM']` 으로 좁혔다(MANAGER 는 역할 경로로 통과한다). 회귀 테스트는 `sr-state-machine.authz.test.ts` 의 `'SR:STATUS_CHANGE 만으로는 재오픈할 수 없다'` 다.

  원문: **MANAGER에게 재오픈 버튼을 보여주지만 서버가 항상 거부** — `src/components/srs/SRStatusActions.tsx:58`의 `isManager = hasRole(['ADMIN','MANAGER'])`가 COMPLETED(`:226`)와 CONFIRMED(`:244`)에서 재오픈 버튼을 렌더링하지만, `sr-state-machine.ts:50-56`의 재오픈 엣지 3개 어디에도 MANAGER가 없다. MANAGER가 재오픈을 클릭하면 항상 `'이 상태 변경을 수행할 권한이 없습니다. (필요 역할: ADMIN, CLIENT_USER, CLIENT_ADMIN)'`을 받는다 — 100% 재현되는 막다른 길. → 규칙을 한쪽으로 정하고, 버튼 가시성을 `getAvailableTransitions()` + `TRANSITION_ROLES`에서 도출해 재발산을 막는다.

- **ENGINEER가 서버에서는 접수·거절 인가되지만 UI가 둘 다 숨김** — `SRStatusActions.tsx:57`의 `canAccept = hasRole(['ADMIN','MANAGER'])`가 `:94`에서 ENGINEER에게 접수하기/거절을 숨긴다. 백엔드는 명시적으로 허용한다(`intake/route.ts:34-36`, `sr-state-machine.ts:35-36`). 게다가 `policies.ts:82-85`의 `canUpdateSR`은 ENGINEER를 `sr.assigneeId === user.id`로 제한하는데 미접수 REQUESTED SR은 이를 만족할 수 없어 **3자 불일치**다. → 하나의 권위를 정하고 세 곳을 정렬.

- **트리아지가 `SR.priority`를 갱신하지 않음** — `createSR`이 `priority: validated.requestedPriority`(`sr.service.ts:81`)로 두 필드를 시드하지만, 접수는 `actualPriority`만 쓰고(`intake/route.ts:135`, PATCH `:415-417`) `priority`는 페이로드에 없다. 그런데 모든 목록/집계 쿼리는 `priority`를 읽는다 — `getAllSRs`가 `priority`를 select하고 `actualPriority`는 하지 않으며(`sr.service.ts:531`), `dashboard/stats/route.ts:97`이 `urgentSRs`를 `COUNT(*) FILTER (WHERE priority IN ('CRITICAL','HIGH'))`로 계산한다. `actualPriority`를 읽는 곳은 상세 페이지(`srs/[id]/page.tsx:260`)와 접수 카드(`IntakeInfoCard.tsx:84-93`)뿐이다. 운영자가 MEDIUM 요청 SR을 CRITICAL로 상향해도 SR 목록·카드·대시보드 '긴급' 카운터가 계속 MEDIUM을 보고한다. 트리아지된 우선순위가 SLA 마감일도 좌우하므로(`intake/route.ts:101`) 마감일과 표시 우선순위가 불일치한다. → 접수 POST/PATCH에서 `priority = actualPriority`를 같은 쓰기에 포함(그리고 `sr.service.ts:251-263`의 `actualPriority` 분기에도), 또는 읽기 측을 `COALESCE(actual_priority, priority)`로 전환. 쓰기 측이 저렴하고 기존 `priority` 인덱스를 유효하게 유지한다.

- **재오픈 시 `completedAt`/`actualCompletionDate`/`confirmedAt`이 초기화되지 않음** — `sr.service.ts:289-296, 297-299`가 COMPLETED/CONFIRMED 전이에서 이들을 설정하지만 재오픈 엣지에 대응 리셋이 없다. `reports/export/route.ts:72-91`이 `sr.status`와 무관하게 `completedAt`이 있으면 완료일과 처리시간을 방출하므로, 재오픈 후 CSV가 IN_PROGRESS인 SR에 완료일과 해결 시간을 보고한다. 게다가 내보내기는 `completedAt - createdAt`을, 대시보드 `avgProcessingHours`는 `completed_at - intake_at`(`stats/route.ts:226`)을 쓰므로 같은 SR의 두 처리시간이 절대 일치하지 않는다. → 재오픈 전이에서 세 필드를 null로(감사 추적은 `SRStatusHistory`에 보존), 내보내기를 `intakeAt` 기준으로 변경하고 COMPLETED/CONFIRMED가 아니면 완료 컬럼 공란.

- **푸시 알림이 사용자 옵트아웃을 무시** — `src/services/listeners/sr-notification.listener.ts:90-97`이 `requester.notificationPreference` 확인 없이 `pushService.sendToUser`를 호출한다(바로 6줄 아래 이메일 분기는 `emailSRStatusChanged ?? false`를 확인). 동일 패턴이 `:37-43`(sr:created), `:145-151`(sr:assigned)에 있다. `prisma/schema.prisma:453`이 `pushSRStatusChanged Boolean @default(false)`를 선언하고, `push.service.ts:281-340`에 preference 인지 `sendForEvent`가 구현되어 있으나 정의 및 테스트 외에 **프로덕션 호출자가 없다**. `pushCommentAdded`는 이중으로 죽어 있다 — `comments/route.ts:153-190`이 이메일만 보내고 pushService를 전혀 건드리지 않는다. 사용자가 설정을 끄고 저장 성공 토스트를 받아도 푸시가 계속 온다. → 세 직접 호출을 `pushService.sendForEvent(...)`로 교체하고 댓글 경로에 `'COMMENT_ADDED'` 호출 추가(또는 존재할 때까지 설정 UI에서 해당 토글 제거).

- **SMTP 실패가 `sendMail` 내부에서 삼켜져 재시도가 전무** — `src/services/email.service.ts:43-53`이 send를 try/catch로 감싸고 로그만 남긴 뒤 void를 반환하며 절대 재던지지 않는다. 모든 호출자가 `Promise.allSettled`로 감싸므로 결과가 **항상 fulfilled**다. 재시도 루프도, 영속 outbox도, dead-letter도 저장소 어디에도 없다. `Notification` 모델(`prisma/schema.prisma:383-399`)이 `status`(PENDING/SENT/FAILED), `sentAt`, `failReason`, 인덱스 3개로 명백히 outbox로 설계되었는데 src 전역에서 `prisma.notification.` 호출이 0건이다. 일시적 SMTP 장애나 그레이리스팅이 알림을 영구히 잃고, 시스템 내 어떤 것도 알림이 밀렸음을 알지 못한다. `src/lib/wait-until.ts:29-34`가 self-hosted Node에서 `@vercel/functions` waitUntil의 throw를 조용히 삼켜 순수 fire-and-forget으로 열화하며, `docker-compose.prod.yml`에 `stop_grace_period`가 없어 재배포 시 기본 10초 후 SIGKILL이 진행 중 전송을 죽인다. → `sendMail`이 reject하게 하고(호출 지점에서 로깅), 일시 실패에 백오프 재시도 추가, 도메인 이벤트를 생산하는 동일 트랜잭션에서 `Notification` 행을 기록하는 트랜잭셔널 outbox 구현 후 리스너가 SENT/FAILED로 마킹(기존 `@@index([status, createdAt])`이 정확히 retry sweeper가 필요로 하는 인덱스다). `stop_grace_period: 30s` 설정.

- **리스너의 DB 조회가 waitUntil 밖에서 실행** — 각 리스너가 `await prisma.user.findMany(...)` 완료 **후에야** `backgroundTask`를 등록한다(`sr-notification.listener.ts:63, 115, 169`). `domainEvents.emit`는 동기이므로 요청이 끝날 수 있는 상태에서 리스너는 아직 첫 쿼리를 await 중이고 waitUntil에는 아무것도 넘겨지지 않았다. `:62`의 주석이 코드가 실제로 제공하지 않는 보장을 단언한다. → 리스너 본문 전체를 감싼다: `domainEvents.on('sr:created', (payload) => backgroundTask(handleSrCreated(payload), 'sr-created'))`.

- **`sr:created`가 모든 ADMIN/MANAGER에게 교차 테넌트로 팬아웃, 행위자 포함** — `sr-notification.listener.ts:19-29`가 클라이언트 스코핑도 `payload.requesterId` 제외도 없이 조회한 뒤 관리자 1인당 `emailService.sendSRCreated`를 1회씩 실행한다(`:47-60`). 댓글 라우트는 올바르게 행위자를 제외한다(`comments/route.ts:158, 172`). 관리자 N명이면 SR 생성마다 단일 풀드 트랜스포트로 N회 순차 SMTP 전송이며, 수십 명 규모에서 SR당 수 초의 백그라운드 버스트이자 메일 제공자 레이트리밋 위험이다. → `payload.requesterId` 제외 + SR의 클라이언트나 서비스 카테고리 담당자(`serviceCategory.handlerId`, `backupHandlerId`)로 스코프, 팬아웃 배치화/상한.

- **SLA 계산이 소수 시간을 절삭하고 4곳에 중복** — `service-category.service.ts:386`의 `dueDate.setHours(dueDate.getHours() + adjustedHours)`에서 multiplier가 0.5/0.75/1.0/1.5(`:18-23`)이므로 `adjustedHours`가 자주 소수다(slaHours 5 × CRITICAL = 2.5). `setHours`는 `ToIntegerOrInfinity`를 적용해 2.5를 2로 만든다 — **SLA 30분이 조용히 증발**한다. 동일 구문이 `:408`, `intake/route.ts:101-103`, `:387-390`에 반복되고 multiplier 테이블 자체도 `service-category.service.ts:18-23`과 `src/lib/constants.ts:99-104`에 중복된다. 홀수 slaHours와 모든 HIGH 우선순위 SR이 계약보다 최대 59분 이른 마감일을 받아 SLA 만료 전에 지연으로 집계된다. → `new Date(startDate.getTime() + adjustedHours * 60 * 60 * 1000)`로 밀리초 계산, multiplier 테이블 하나 삭제, intake 라우트가 `calculateDueDateFromHours`를 호출하게 통일.

- **`updateSRAction`/`deleteSRAction`에 레이트리밋 없음** — `createSRAction`은 `await requireRateLimit('strict')`(`src/actions/sr.actions.ts:25`)로 시작하지만 `updateSRAction`(`:45-68`)과 `deleteSRAction`(`:70-82`)은 `getAuthenticatedSession()` 후 서비스로 직행한다. 대응 REST 라우트는 둘 다 `{ preset: 'strict' }`(`srs/[id]/route.ts:70, 86`)다. 서버 액션은 유효 세션 + `Next-Action` 헤더로 도달 가능한 공개 POST이므로 인증 사용자가 액션 호출로 5/min 제한을 완전히 우회한다. 담당자 변경마다 대상에게 이메일 + 푸시가 발화하므로(`listener.ts:145`) 임의 내부 사용자를 겨냥한 무제한 알림 폭주가 가능하다. → 두 액션의 첫 문장에 `await requireRateLimit('strict')` 추가.

- **응답 봉투가 5종으로 분열, Decimal 직렬화 불일치** — `/api/srs`는 `{ data, meta }`(`srs/route.ts:66-69`), `/my-requests`는 `{ srs, total }`(`:146-152`), `/status-history`는 `{ items, total, page, limit, totalPages }`(`:57-63`), `/status`는 `{ success, data, message }`(`:176-180`), `/intake`는 `{ success, sr, message }`(`:213-220`), `/srs/[id]`와 `/comments`는 raw 엔티티. `/api/srs/[id]` GET은 `serializeResponse`를 거치지만(`:41`) 바로 다음 줄의 PATCH는 raw로 반환하므로(`:68`) `estimatedHours`(Decimal)가 GET에서는 number, PATCH에서는 string이다 — 산술을 하는 클라이언트가 PATCH 후 문자열 연결을 얻는다. → 봉투 하나로 통일, Prisma 행을 반환하는 모든 라우트에 `serializeResponse` 일괄 적용.

- **8개 라우트가 표준 래퍼를 우회하고 `console.error`로 스택 트레이스 출력** — `my-requests/route.ts:154`, `users/[id]/client/route.ts:74, 246`, `clients/public/route.ts:30`, `push/subscribe/route.ts:42, 70, 92`, `settings/notifications/route.ts:32, 64`. 전부 `auth()` 직접 호출 + 자체 try/catch이므로 레이트리밋도 없고 `X-RateLimit-*` 헤더도 없다. 스택이 구조화 로거 대신 raw stdout으로 나가 userId/path/method와 상관관계가 없고 로그 파이프라인에 보이지 않는다 — 정확히 가장 실패하기 쉬운 라우트들의 인시던트 트리아지가 불가능하다. `/api/settings/notifications` PUT과 `/api/push/subscribe` POST는 무제한 쓰기 엔드포인트다. → 8개 전부 `withAuth`/`withAuthAndRateLimit`으로 전환하고 로컬 try/catch 삭제(`handleApiError`가 이미 컨텍스트와 함께 로깅).

- **VAPID 공개키 하드코딩 폴백 + 배포 env의 플레이스홀더 자격증명** — `src/app/api/push/vapid-key/route.ts:8`과 `src/services/push.service.ts:45-47`이 `VAPID_PUBLIC_KEY_FALLBACK = 'BMy2Sare...'`를 하드코딩한다. 배포 env는 리터럴 플레이스홀더를 공급한다: `.env.docker:28-29`의 `"your_vapid_public_key_here"` / `"your_vapid_private_key_here"`, `:23`의 `EMAIL_SERVER_PASSWORD="your_app_password_here"`(`.env.docker.test:16, 20-21`도 동일). `PushService.isConfigured()`(`:89-91`)는 `return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)`이므로 플레이스홀더 문자열이 truthy로 **configured를 보고**하고, `getWebPush()`(`:76-84`)가 실제 65바이트 공개키와 플레이스홀더 개인키를 짝지어 `setVapidDetails`를 호출한다. 두 배포 환경 모두 구문상 존재하고 의미상 무효한 자격증명을 로드하며, 브라우저는 구독을 수락하고 DB는 기록하지만 모든 푸시가 서명 에러로 실패한다 — 구독 시점에 에러가 없어 "알림이 안 온다"로만 표면화된다. Gmail SMTP도 동일. → `ENV_VARIABLES`에 VAPID/EMAIL 변수의 `validate` 술어 추가(`/your_.*_here/` 매칭 거부, VAPID 공개키 87-88 base64url 문자 요구)해 `instrumentation.ts`의 fail-fast가 플레이스홀더를 잡게 하고, `push.service.ts:45-47`의 폴백 삭제 + `isConfigured()`를 길이 검증으로 변경.

### 4.4 프론트엔드

- ~~**클라이언트 `hasPermission` 이 세션과 다른 구분자로 키를 조립해 항상 false**~~ — **감사 이후 발견·해소됨(2026-08-01).** `src/hooks/use-permissions.ts` 가 `` `${resource}.${action}` `` 로 조립하는데 `src/auth.ts:146` 은 세션 토큰에 `` `${resource}:${action}` `` 를 담는다. 따라서 `hasPermission`/`hasAnyPermission`/`hasAllPermissions` 가 어떤 입력에도 false 였다. 현재 호출부(`PermissionGuard`, `Sidebar`)가 모두 `roles` 를 쓰고 있어 증상이 드러나지 않았을 뿐, 권한으로 게이트하는 순간 조용히 막히는 지뢰였다. 구분자를 맞추고 비교를 대소문자 무시로 바꿨다. 기존 테스트 두 개가 `permissions: ['sr.view', ...]` 라는 프로덕션에 존재하지 않는 형태를 픽스처로 써서 점 조립을 정상 동작으로 못 박고 있었으므로 실제 세션 형태로 교체했다.

- **`SessionProvider`에 서버 해석 세션을 전달하지 않음** — `src/components/providers/ClientLayout.tsx:43`의 `<SessionProvider>`가 `session` prop을 받지 않는데, `src/app/(dashboard)/layout.tsx:10`은 이미 `auth()`를 서버에서 await해 Header에만 전달한다. `usePermissions`(`use-permissions.ts:9, 25, 30`)가 `session?.user`가 undefined면 모든 검사에 false를 반환하므로 SSR 동안과 `/api/auth/session` 해석 전까지 사이드바 전체(`Sidebar.tsx:34-52, 66-77`), 상단 nav 필터(`Header.tsx:113-118`), `ExportButton`(`:16-18`)이 비어 있다가 팝인한다. `SRsDataTable.tsx:114`의 `isClientUser = !hasAnyRole([...])`는 더 나쁘다 — 로딩 창 동안 ADMIN이 클라이언트 사용자로 취급되어 퀵필터 바와 상세 필터 버튼(`:315`)이 숨겨졌다가 주입되어 테이블이 밀린다. → `const session = await auth()`를 레이아웃에서 `<SessionProvider session={session}>`로 전달하고, `usePermissions`가 `status`를 노출해 호출자가 'loading'과 'denied'를 구분(스켈레톤 렌더)하게 한다.

- **검색 디바운스 타이머가 낡은 `searchParams` 스냅샷으로 발화** — `SRsDataTable.tsx:156-165`의 디바운스 effect가 deps `[searchQuery]`만 갖는데 본문에서 `handleFilterChange`(`:190`)를 호출하고, 이는 `createQueryString`(`useCallback(..., [searchParams])`, `:175-188`)을 클로저로 잡는다. 사용자가 검색어를 입력하고 500ms 내에 상태 필터를 고르면, Select가 내비게이트한 후 대기 중이던 디바운스 타이머가 내비게이션 이전 searchParams로 만든 URL을 push해 **방금 선택한 상태 필터를 조용히 폐기**한다. 반대 순서도 마찬가지다. 게다가 `:168-173`의 동기화 effect가 searchParams 변경마다 `if (searchQuery !== currentSearch) setSearchQuery(currentSearch)`를 무조건 실행하므로, 모든 필터/정렬/페이지 내비게이션이 **입력 중인 검색어를 지운다**(그 내비게이션들이 pending search 값을 URL에 싣지 않으므로 currentSearch가 ''). → URL을 단일 진실 원천으로: `handleFilterChange`가 현재 `searchQuery`를 `createQueryString`에 포함시키고, 동기화 effect를 이 컴포넌트가 시작한 내비게이션의 에코를 무시하는 ref로 게이트(또는 로컬 상태를 버리고 `filters.search`로 입력을 구동).

- **'긴급' 퀵필터 배지는 CRITICAL+HIGH를 세는데 적용 필터는 CRITICAL만** — `srs/page.tsx:173`이 `urgentCount`를 `priority: { in: ['CRITICAL','HIGH'] }`로 계산해 `globalCounts.urgent`로 넘기고 `SRsDataTable.tsx:382`가 긴급 pill에 렌더링한다. 클릭하면 `handleQuickFilter('urgent')` → `handleFilterChange('priority', 'CRITICAL')`(`:276`) → `srs/page.tsx:62-63`이 `where.priority = 'CRITICAL'`로 변환한다. `activeQuickFilter`(`:261-266`)는 CRITICAL이든 HIGH든 'urgent'로 취급하므로 pill이 **자기가 만들 수 없는 카운트를 표시한 채 활성 상태로 남는다**. 배지가 12를 표시하는데 클릭하면 4행이 보이고, HIGH SR이 트리아지 뷰에서 조용히 사라진다. → 퀵필터가 다중 값 priority를 push하게 하거나(`srs/page.tsx:62`에서 `{ in: [...] }`로 파싱), `:173`의 카운트를 CRITICAL로 좁힌다.

- **Create SR 다이얼로그가 미로드 세션에서 `isClientUser`를 도출하고 플립 시 입력 전체를 삭제** — `useCreateSRForm.ts:33`의 `isClientUser = !hasAnyRole([...])`가 세션 로딩 중 모두에게 true다. `fetchClients`가 `useCallback(..., [toast, isClientUser])`(`:71`)이고 리셋 effect(`:86-98`)의 deps가 `[open, isClientUser, fetchClients, fetchCategories]`이며 본문이 `setTitle(''); setDescription(''); ... setFiles([])`다. 다이얼로그가 열린 채 세션이 해석되면 `isClientUser`가 false로 뒤집혀 `fetchClients` identity가 바뀌고 리셋 effect가 재실행되어 **제목·설명·카테고리·희망 완료일·선택한 첨부 전부가 경고 없이 삭제**된다. → 훅 전체를 `useSession().status !== 'loading'`으로 게이트하고, '폼 리셋' effect(deps `[open]`만)와 '옵션 조회' effect를 분리.

- **조직도 자동 확장 effect가 사용자의 수동 펼침/접기 상태를 덮어씀** — `organization/page.tsx:342-373`의 effect가 deps `[debouncedSearchQuery, clients, clientUsers]`로 `setExpandedClients(matchingClientIds)`(전체 교체)를 실행한다. `toggleClient`(`:69-97`)가 클라이언트를 펼친 뒤 `:81`에서 `setClientUsers`로 `clientUsers`를 변경해 effect를 재트리거하고, `handleToggleClientStatus`/`handleToggleUserStatus`(`:133, 159`)의 `fetchClients()`가 `clients`를 교체해 또 재트리거한다. 검색어가 활성인 상태에서 사용자를 보려고 클라이언트를 펼치면 fetch 완료 → effect 재실행 → 방금 연 노드가 접힌다. → deps를 `[debouncedSearchQuery]`로 축소하고 clients/clientUsers를 ref로 읽거나, 교체 대신 병합(`setExpandedClients(prev => new Set([...prev, ...matchingClientIds]))`).

- **`(dashboard)` 내부 `error.tsx` 없음, `global-error.tsx` 없음** — `find src/app -name 'error.tsx' -o -name 'global-error.tsx'`가 `src/app/error.tsx`만 반환하고, 그것은 `flex h-screen w-full`(`:20`)로 전체 뷰포트를 점유해 대시보드 셸(Header/Sidebar/Footer, `(dashboard)/layout.tsx:15-21`)을 대체한다. SR 목록 로딩 중 일시적 DB 에러가 내비게이션도 헤더도 없는 맨 화면으로 사용자를 떨어뜨린다. `global-error.tsx`가 없어 루트 레이아웃이나 ClientLayout 프로바이더 트리의 throw는 Next 기본 무스타일 에러 페이지를 렌더링한다. `:16`의 `console.error`는 프로젝트 자체 `no-console` 규칙에 반한다. → `src/app/(dashboard)/error.tsx`(셸 내부 렌더, h-screen 없이, 다시 시도 + 대시보드로 이동)와 `src/app/global-error.tsx` 추가, `console.error`를 프로젝트 로거로 교체하고 `error.digest`를 노출.

- **대시보드와 my-requests가 abort 불가 raw fetch를 하는 클라이언트 컴포넌트** — `dashboard/page.tsx:144-159`가 `fetch('/api/dashboard/stats')` 후 `setStats(data)`를 AbortController·재시도·재검증 없이 수행하고 `:161-163`의 effect가 마운트 시 1회 실행한다. `my-requests/page.tsx:98-129`도 동일. 랜딩 페이지에서 HTML → JS 하이드레이션 → 세션 fetch → stats fetch의 보장된 워터폴이며, AbortController가 없어 이동 중 응답이 언마운트된 트리에 setState한다. 3.26과 결합해 대시보드가 사실상 페이지 로드 시점의 정적 스냅샷이다. → 서버 컴포넌트로 전환해 stats 서비스를 직접 호출하고 onClick이 필요한 부분만 작은 클라이언트 leaf로 전달(`dashboard/loading.tsx`를 Suspense fallback으로 유지). 클라이언트 유지 시 `useQuery({ queryKey: ['dashboard-stats'] })`로 이동해 기존 SSE 무효화가 살아나게 한다.

- **클라이언트 목록이 키 입력마다 스로틀·abort 없는 fetch, 순서 역전 시 낡은 결과 렌더** — `clients/page.tsx:95-106`의 `fetchClients`가 deps에 `searchQuery`를 포함하고 effect가 `useEffect(() => { fetchClients(); }, [fetchClients])`다. 검색 상자(`:229-234`)는 디바운스도 AbortController도 없다(대조적으로 `organization/page.tsx:339`는 디바운스한다). 10자 검색이 10회 DB 왕복이며, 응답이 해석 순서대로 무조건 적용되므로 **느린 이전 요청이 마지막에 도착하면 사용자가 이미 지나친 접두사의 결과가 테이블에 남는다** — 낭비가 아니라 조용한 오데이터 렌더다. → 기존 `useDebounce` 훅으로 감싸고 fetch에 signal 전달, effect cleanup에서 abort.

- **SR 상세 쿼리가 권한/미존재 실패에도 2회 재시도** — `use-sr.ts:12-25`가 `retry: 2` + 지수 백오프를 설정하는데, 서버 액션이 HTTP 상태 대신 판별 결과를 반환하므로 던져진 Error에 상태 코드가 없어 재시도가 구분할 수 없다. 권한 없는 SR이나 삭제된 SR을 열면 3회 왕복 후 ~4초 스피너를 본다. → 액션이 타입된 에러 코드(`{ success: false, code: 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL' }`)를 반환하고 `retry: (count, err) => count < 2 && err.code === 'INTERNAL'`.

- **SR 삭제 시 '불러올 수 없습니다' 에러 화면이 깜빡이고 삭제된 SR을 3회 재조회** — `use-sr.ts:128-144`의 `useDeleteSR` onSuccess가 `setQueryData(['sr', srId], null)` 후 `removeQueries(...)`를 `router.push('/srs')` 전에 실행한다. 상세 페이지(`srs/[id]/page.tsx:67, 81-101`)가 아직 마운트되어 해당 키를 구독 중이므로, null 설정이 `!sr`을 참으로 만들어 파괴적 에러 카드를 렌더링하고, 활성 옵저버가 있는 쿼리를 제거하면 TanStack Query가 재생성·재조회해 존재하지 않는 행에 대해 `retry: 2`로 3회 헛된 왕복을 만든다. → 먼저 내비게이트하고 라우트 변경 후 `onSettled`에서 캐시 정리(또는 `setQueryData(null)` 없이 `removeQueries`만 하고 페이지가 언마운트되게).

- **댓글 헤더 카운트가 로드된 페이지만 반영** — `SRComments.tsx:112-113`이 `data?.pages.flatMap(p => p.comments).length`를 `:171`에서 `댓글 ({totalCount})`로 렌더링하는데, 상세 페이지는 별도로 권위 있는 `sr._count.comments`를 탭 트리거에 표시한다(`srs/[id]/page.tsx:341`). 한 페이지 이상인 SR에서 카드 헤더는 `댓글 (20)`, 바로 위 탭은 `댓글 (57)` — 같은 화면의 두 모순된 카운트. → 댓글 액션이 `nextCursor`와 함께 `totalCount`를 반환하게 하거나 상세 페이지의 `sr._count.comments`를 prop으로 전달.

- **`eslint-config-next`가 flat config에 연결되지 않음** — `package.json:123`이 `"eslint-config-next": "^16.1.6"`을 devDependency로 싣지만 `eslint.config.mjs`는 `js.configs.recommended`, `tseslint.configs.recommended`, security, simple-import-sort, storybook만 조합한다 — `next/core-web-vitals`도, `eslint-plugin-react-hooks`도, `eslint-plugin-jsx-a11y`도 없다. 따라서 `react-hooks/exhaustive-deps`와 `rules-of-hooks`가 **한 번도 실행된 적이 없다**. 직접 관찰 가능하다: `useEditSRForm.ts:146`의 deps `[open, srId]`가 본문에서 hasAnyRole/toast/fetchClients/fetchCategories를 읽는데 eslint-disable 주석이 없고, `SRsDataTable.tsx:165`와 `:173`도 마찬가지. 위에 열거한 훅 의존성 버그 대부분을 잡았을 유일한 규칙이 돌지 않고, a11y 규칙 세트도 없어 최근 a11y 커밋의 'lint 에러 0' 주장이 실제보다 훨씬 약하다. → `eslint.config.mjs`에 Next flat preset(또는 `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`)을 `tseslint.configs.recommended` 뒤에 spread, `react-hooks/exhaustive-deps: 'error'` 설정 후 기존 위반을 수정하거나 명시적으로 disable.

- **SR 행/카드의 클릭 타겟에 역할이 없거나(tr) 링크·버튼을 품은 role=button** — `SRListItem.tsx:67-73`이 `<TableRow onClick onKeyDown tabIndex={0} aria-label>`로 `<tr>`를 포커스·활성화 가능하게 만들되 암묵 `row` role을 남긴다 — 스크린리더는 행으로 읽어 aria-label과 Enter/Space를 액션으로 전달하지 않는다. 모바일 카드(`:172-179`)는 `role="button"` 하위에 같은 href의 `<Link>`(`:183-189`), `<CopyButton>`(`:190-194`), 접수 `<Button>`(`:204-211`)을 포함해 ARIA의 button role 포커스 가능 자손 금지 규칙을 위반한다. → 행 레벨 click/keydown/role을 제거하고 기존 `<Link>`를 키보드 경로로 삼되 stretched-link 의사요소로 마우스 히트 영역을 확장.

- **권한 그룹 토글 Switch에 접근 가능한 이름 없음** — `PermissionBoard.tsx:216-224`의 `<Switch checked={isAllSelected} onCheckedChange={...} />`에 id도 aria-label도 연결된 Label도 없다(개별 권한 스위치는 `:235`/`:248`로 올바르게 연결). RBAC 관리 화면에서 리소스 전체 권한을 부여하는 고위험 컨트롤을 스크린리더 사용자가 이름 없는 'switch'로만 듣는다. → `aria-label={\`${resource} 전체 권한\`}` 추가, 부분 선택 시 '일부 선택됨' 접미사.

- **`SRAttachments`의 하드코딩 DOM id, accept 필터 없음, stale closure setState** — `SRAttachments.tsx:183-189`의 `id="file-upload"` + `document.getElementById('file-upload')?.click()`(`:204`)은 컴포넌트가 두 번 마운트되면 잘못된 picker를 연다. `accept` 속성이 없어 OS 다이얼로그가 모든 타입을 제안하고 사용자는 전체 업로드 왕복 후에야 거부를 안다(`CreateSRDialog.tsx:203-209`의 FileUpload도 accept 없이 `*/*`). `:98`의 `setAttachments([newAttachment, ...attachments])`와 `:139`의 filter가 함수형 업데이터를 쓰지 않아 업로드와 삭제가 같은 틱에 해석되면 하나가 유실된다. → `useRef` + `ref.current?.click()`, 서버 allowlist와 일치하는 `accept` 전달, 두 setState를 함수형으로.

- **`prefers-reduced-motion` 미대응, skip-to-content 링크 없음** — `src/app/globals.css`에 `prefers-reduced-motion` 매치가 없고 UI는 `animate-spin` 스피너와 `transition-all`에 크게 의존한다. 대시보드 셸(`(dashboard)/layout.tsx:15-21`)에 nav 앞 우회 링크가 없어 키보드 사용자가 매 페이지 로드마다 상단 nav + 모든 사이드바 링크를 탭해야 SR 테이블에 도달한다. → globals.css에 reduced-motion 블록 추가, 대시보드 레이아웃 첫 자식으로 시각적 숨김 '본문으로 건너뛰기' 앵커 추가.

- **서버 전용 `SRService`가 `'use client'` 모듈에 값 import** — `SRsDataTable.tsx:39`가 타입 위치(`:50`)에서만 쓰면서 `import { SRService } from '@/services/sr.service'`를 값으로 import한다. `sr.service.ts`는 `@/lib/prisma`, `@/lib/policies`, `@/lib/domain-events`, `@/services/audit.service`를 import하고 `push.service.ts:2`와 달리 `import 'server-only'` 가드가 없다. tsconfig에 `verbatimModuleSyntax`가 없어 제거가 transpiler의 미사용 바인딩 분석에 전적으로 의존한다. → `import type { SRListItem } from '@/types/sr.types'`로 교체(동일 타입이 이미 export됨), 모든 `src/services/*.service.ts`와 `src/lib/prisma.ts` 상단에 `import 'server-only'` 추가.

### 4.5 성능 · 확장성

- ~~**대시보드 stats 캐시가 죽은 코드**~~ — **해소됨(2026-08-02).** 죽은 `baseCacheKey`/`cacheKey`/`noCache` 와 중복 주석을 제거해 코드가 현실과 일치하게 했다. 캐시를 연결하는 대신 삭제를 택한 이유를 주석에 남겼다 — 이 엔드포인트는 SSE 로 실시간 갱신되는 대시보드가 소비하므로 서버 TTL 캐시를 두면 사용자가 SR 을 바꾼 직후 재조회해도 옛 수치를 보게 되어 실시간 갱신을 다시 깨뜨린다. `?nocache=1` 탈출구는 호출하는 곳이 없었다(src 전역 grep 0건).

  원문: **대시보드 stats 캐시가 죽은 코드** — `dashboard/stats/route.ts:23-30`이 `baseCacheKey`/`cacheKey`를 계산한 뒤 **다시 읽지 않는다**(파일 내 `cacheKey` grep 결과 `:24`, `:26`뿐). `:28-29`의 중복 주석이 존재하지 않는 캐싱을 주장하고 `:30`은 평범한 async IIFE다. `src/lib/cache.ts`가 존재하지만 여기서 import되지 않는다. 매 요청이 `Promise.all` 9쿼리(`:51-242`) + `client.findMany`(`:294`) = 10 왕복, 그중 3개가 `srs` 전체 집계 스캔이다. `?nocache=1` 탈출구도 무력하다. → `cache.getOrSet(cacheKey, 30_000, ...)`으로 연결하거나 `baseCacheKey`/`cacheKey`/`noCache`와 오도하는 주석을 삭제해 코드가 현실과 일치하게 한다.

- **nginx가 요청마다 앱에 새 TCP 연결** — `nginx/nginx.conf:65-67`이 `set $upstream_prod http://app:3000; proxy_pass $upstream_prod;`와 `proxy_http_version 1.1`을 쓰지만 파일 어디에도 `upstream {}` 블록이 없다 — nginx는 `keepalive N`을 가진 명명 upstream을 대상으로 할 때만 연결을 재사용할 수 있다. 게다가 `:69`가 `proxy_set_header Connection 'upgrade'`를 `map $http_upgrade $connection_upgrade`의 '' 기본값 없이 무조건 설정해 모든 평범한 HTTP 요청도 가짜 upgrade 헤더를 실어 재사용을 봉쇄하고 프로토콜 비준수다. 스테이징 블록(`:98-101`)도 동일. 이미 9~10 쿼리로 팬아웃되는 대시보드에서 순수 추가 지연이며 양쪽 컨테이너의 소켓 처닝과 TIME_WAIT를 부풀린다. → `upstream sr_app { server app:3000; keepalive 32; }` 추가 후 그리로 proxy_pass, `map $http_upgrade $connection_upgrade { default upgrade; '' close; }` 게이트. 이 리팩터가 `/api/realtime` 전용 `proxy_buffering off` location을 넣을 자연스러운 자리도 만든다.

- **HSTS·HTTP/2·nginx 레이트리밋·443 default_server 부재, 본문 상한 과대** — 443 블록이 `listen 443 ssl;`로 `http2` 없이(`:51-52, 84-85`), `limit_req_zone`/`limit_req`가 어느 레벨에도 없고, `default_server`가 없어 미인식 SNI 요청이 프로덕션 vhost로 떨어진다. `ssl_session_cache`, `ssl_stapling`, `server_tokens off`도 없다. `client_max_body_size 100m`(`:78`)이 앱의 최대 타입별 상한 50MB보다 크므로, 클라이언트가 100MB를 Node에 밀어넣어 완전히 버퍼링(`storage.ts:56-58`)된 후에야 50MB에서 거부된다 — nginx가 먼저 413으로 거부해야 한다. → HSTS 추가, `http2 on`, `map` 기반 Connection, 443 중 하나를 `default_server`로(또는 444 반환 catch-all), `client_max_body_size`를 앱 상한에 맞춤, 인증 경로에 `limit_req_zone` 적용, `ssl_session_cache shared:SSL:10m` + `server_tokens off`.

- **컨테이너 메모리/CPU 제한 없음, 앱 healthcheck 없음** — `docker-compose.prod.yml:23-74`의 세 서비스 어디에도 `mem_limit`/`cpus`/`deploy.resources`가 없다. 유일한 제어가 `NODE_OPTIONS=--max-old-space-size=450`(`:32`)인데 이는 V8 old space만 제한하고 네이티브/Buffer 할당은 제한하지 않는다. `scripts/setup-server.sh:13-17`이 OOM 방지를 위해 4GB 스왑을 만드는 것으로 보아 매우 작은 호스트다. Postgres·nginx·Node가 한 작은 VM에서 무제한 경쟁하고, 동시 50-100MB 업로드 버스트가 호스트를 OOM으로 밀면 커널의 oom_score 휴리스틱이 **가장 큰 RSS 프로세스(postgres일 수 있음)를 죽여** 앱이 아니라 DB가 내려간다. 셋 다 `restart: always`이므로 스래시 루프가 될 수 있다. `init: true`도 `stop_grace_period`도 없어 SSE 스트림을 보유한 프로세스에 기본 10초 SIGTERM 창이 적용된다. → 서비스별 `mem_limit`(app 600m, db 300m, nginx 64m), app에 `stop_grace_period: 30s`, `init: true`, Dockerfile HEALTHCHECK + compose healthcheck + nginx `depends_on: condition: service_healthy`.

- **Prisma 연결 풀 사이징·풀 타임아웃·statement timeout 미설정** — `src/lib/prisma.ts:13-17`의 주석은 "연결 풀 최적화 옵션"을 주장하지만 설정은 URL 재기술뿐이다. `connection_limit`/`pool_timeout` 쿼리 파라미터가 붙지 않고 `statement_timeout`도 없다(저장소 전역 grep 무결과). 느린 쿼리 미들웨어는 development로만 게이트되어(`:69`) `scripts/summarize-slow-queries.ts`에 프로덕션 데이터를 공급할 수 없다. SR 목록 search의 5개 ILIKE 같은 병리적 쿼리가 무제한 실행되며 풀 연결을 점유하고, Prisma 기본 풀(num_cpus\*2+1, 작은 VM에서 5-9)이 고갈되면 다른 모든 요청이 큐잉된다. → `?connection_limit=10&pool_timeout=10` 추가, 연결 시 세션 `statement_timeout`(15s) 설정, 느린 쿼리 로거를 env 플래그로 프로덕션에서 활성화.

- **웹 푸시 전송에 timeout 없음** — `src/services/push.service.ts:174`의 `webPush.sendNotification(webPushSub, JSON.stringify(payload))`에 옵션 객체가 없다. 설치된 라이브러리는 지원한다(`node_modules/web-push/src/web-push-lib.js:222` → `:357` → `:396`). 이메일 트랜스포트는 올바르게 제한되어 있다(`email.service.ts:30-32`). 푸시 엔드포인트(FCM/Mozilla/Apple)가 느리거나 블랙홀되면 각 호출이 OS TCP 타임아웃(수 분)까지 걸리고, `sendToUsers`가 모든 수신자의 모든 구독에 `Promise.all`로 팬아웃하므로 **응답 없는 엔드포인트 하나가 전체 알림 배치를 정지**시킨다. → 세 번째 인자로 `{ timeout: 10000, TTL: 3600 }` 전달, 두 `Promise.all` 팬아웃을 `Promise.allSettled`로 전환.

- **SSE 리스너와 keep-alive 타이머가 abort에서만 정리** — `realtime/route.ts:91-104`가 리스너 4개 + 30초 `setInterval`을 등록하고 `:107-115`의 abort 리스너에서만 제거한다. `ReadableStream`에 `cancel(reason)` 핸들러가 없고 `enqueue` 실패는 삼켜진다(`:68`). 장기 실행 컨테이너가 죽은 리스너 클로저(각각 viewer 객체·encoder·controller를 캡처)와 고아 30초 인터벌을 축적한다 — 일주일치 브라우저 탭·랩톱 슬립·프록시 드롭 후에는 매 SR 변경이 수천 개 죽은 구독자에 `canReadSR`을 팬아웃하고 수천 개 인터벌이 30초마다 발화한다. → 정리를 `cleanup()`으로 이름 붙여 abort 리스너·`cancel()`·enqueue catch 세 곳에서 호출, 최대 연결 수명(30분 후 종료, EventSource가 재연결) 검토.

- **레이트리미터의 'O(1)' 샘플링 축출이 실제로는 전체 키 배열 물질화** — `rate-limiter.ts:147`의 `const keys = Array.from(this.buckets.keys());`가 최대 10,000개 문자열 사본을 만든 뒤에야 `:149-156`의 5개 샘플 루프를 돈다(주석 `:144-145`의 O(1) 주장과 불일치). 부하 상황에서 레이트리밋된 요청 10건 중 1건이 요청 임계 경로에서 10,000요소 배열을 할당·즉시 폐기해 450MB 힙에 GC 압력을 더한다 — 모든 `/api/` 요청이 미들웨어와 라우트 리미터를 모두 통과하므로 요청당 2회다. → 키 목록 물질화 없이 샘플링(Map 이터레이터에서 앞 N개, 또는 삽입 순서 커서 유지), 주석 수정, `:161-168` FIFO 분기의 만료 검사 누락도 함께 수정.

- **`status-history` 라우트의 페이지네이션 파라미터 미검증** — `srs/[id]/status-history/route.ts:15-17`의 `parseInt(searchParams.get('page') || '1')` / `parseInt(searchParams.get('limit') || '20')`이 클램프·NaN 가드 없이 `skip`/`take`로 간다(`:49-50`). `?limit=abc`는 500, `?page=0`은 `skip: -20`으로 500, `?limit=100000`은 전체 상태 이력을 사용자 조인과 함께 반환한다. `:62`의 `Math.ceil(total / limit)`도 limit=0에서 NaN/Infinity다. 형제 `/api/srs`가 이미 import하는 `usePagination`을 쓰지 않는다. → 두 `parseInt`를 `usePagination(request)`로 교체.

- ~~**불필요하거나 사용되지 않는 인덱스 4개**~~ — **해소됨(2026-08-02).** 중복 3개(`users_email_idx`, `clients_code_idx`, `notifications_recipient_idx`)를 스키마에서 제거하고 마이그레이션을 추가했다. 실제 Postgres 에 마이그레이션을 적용해 세 인덱스가 사라지고 `users_email_key`/`clients_code_key`/`notifications_recipient_created_at_idx` 는 남는 것, 그리고 스키마 드리프트가 없음을 확인했다. `sr_comments` 는 인덱스를 지우는 대신 감사가 더 낫다고 한 쪽을 택했다 — `isInternal` 이 어디서도 읽히지 않아 **누군가 이 플래그를 세우는 순간 내부 노트가 고객에게 그대로 나가는 함정**이었으므로, 댓글 조회에 `isInternalUser` 기반 필터를 걸었다. 그 결과 3열 인덱스가 비로소 외부 사용자 조회를 실제로 서빙한다.

  원문: **불필요하거나 사용되지 않는 인덱스 4개** — `User.@@index([email])`(`schema.prisma:57`)가 `@unique`(`:23`)의 `users_email_key`와 중복, `Client.@@index([code])`(`:144`)가 `:125`와 중복, `Notification.@@index([recipient])`(`:396`)가 `[recipient, createdAt]`(`:397`)의 접두사, `SRComment.@@index([srId, isInternal, createdAt(sort: Desc)])`(`:345`)의 `isInternal`은 저장소 전역에서 스키마 정의와 인덱스 자신 외에 참조가 없다(댓글 라우트는 `where: { srId: id }`만 쓴다). 가장 비싼 것은 `sr_comments` — 최고 처닝 자식 테이블에서 댓글 삽입마다 인덱스 3개를 갱신하는데 2개면 충분하다. → 3개 삭제 + 마이그레이션. `sr_comments`는 인덱스를 삭제하거나, 더 낫게는 `isInternal`을 실제로 사용해(클라이언트 사용자에게 내부 노트 숨기기) 원래 의도한 기능을 구현.

- **`Notification` 모델이 완전히 죽어 있음** — `schema.prisma:383-399`가 `status`, `sentAt`, `failReason`과 인덱스 3개로 명백한 outbox를 선언하는데 src 전역 `prisma.notification.` grep이 0건이다. 발송은 `backgroundTask(Promise.allSettled(...))`로 직행한다. `Promise.allSettled`가 모든 rejection을 삼키므로 실패한 SMTP나 만료된 푸시 구독이 DB 행도, 재시도도, 호출자 로그도 남기지 않는다. 운영자가 "담당자에게 알림이 갔는가"에 답할 수 없다. 테이블과 3개 인덱스가 아무것도 아닌 것을 위해 DDL로 유지된다. → 삭제하거나(권장하지 않음, 설계가 이미 옳다) 트랜잭셔널 outbox로 구현.

### 4.6 설정 · 도구 · 운영

- **`.npmrc`가 pnpm의 서명·무결성·릴리스 대기 검증을 전부 비활성화하고 Docker 빌드에 복사** — `.npmrc:3-8`이 `minimum-release-age=0`, `verify-store-integrity=false`, `verify-signatures=false`, `registry-signatures-verification=false`, `release-age-verification=false`, `verify-release-age=false`를 설정한다. `Dockerfile:10`이 이를 deps 스테이지로 명시적으로 복사하고 `:13-14`가 `ENV PNPM_VERIFY_STORE_INTEGRITY=false` / `PNPM_VERIFY_SIGNATURES=false`로 보강한다. CI(`ci-cd.yml:51`)도 이 `.npmrc`가 포함된 체크아웃에서 install한다. `minimum-release-age=0`은 침해된 메인테이너 계정이 악성 패치 릴리스를 게시하는 공격(shai-hulud/event-stream 계열)에 대한 pnpm의 주 방어인 쿨다운 창을 제거한다. `shamefully-hoist=true`(`:1`)도 node_modules를 평탄화해 phantom dependency import가 로컬에서는 컴파일되고 도구 변경 시 깨진다. → `:3-8` 삭제, 일시적 레지스트리/CI 실패 회피가 목적이었다면 근본 원인을 고친다. `minimum-release-age=1440`(24h) 최소 설정, `store-dir`과 `registry`만 유지, 특정 패키지가 요구하지 않는 한 `shamefully-hoist=true` 제거.

- **CI의 모든 보안 스캔이 권고 수준** — `ci-cd.yml:236-238`의 `npm audit --production --audit-level=moderate || true`는 절대 실패할 수 없고, 게다가 pnpm 워크스페이스에 `package-lock.json`이 없어 `npm audit` 자체가 에러난다. Trivy 스텝 둘(`:240-255`)은 `exit-code: '1'`을 생략해 CRITICAL/HIGH 발견과 무관하게 0으로 종료하며 SARIF 업로드는 `continue-on-error: true`(`:260`)다. 둘 다 `aquasecurity/trivy-action@master` — 가변 브랜치 ref이므로 업스트림 침해 시 워크플로 secrets 컨텍스트를 읽을 수 있는 잡에서 임의 코드가 실행된다. `.gitleaks.toml`이 루트에 있지만 어떤 워크플로도 gitleaks를 호출하지 않는다 — **이것이 정확히 3.1의 커밋된 시크릿이 살아남은 방식**이다. `scheduled-checks.yml:32, 37, 95`도 전부 `|| true`다. → Trivy 테이블 스텝에 `exit-code: '1'` 설정, `npm audit`을 real `pnpm install` 후 `pnpm audit --audit-level=high`로 교체하고 `|| true` 제거, Trivy를 릴리스 SHA로 핀, gitleaks 스텝 추가, `deployment-ready`에 `needs: [security]` 추가.

- ~~\*\*`pnpm lint`에 `--max-warnings`가 없어~~ — **해소됨(2026-08-02).** `package.json` 의 lint 스크립트에 `--max-warnings 1060` 을 걸고 CI 에 의도를 주석으로 남겼다(숫자는 내리는 방향으로만 쓴다). 규칙 심각도를 낮춰 숫자를 꾸미지 않았고, 대신 실제 결함을 먼저 없애 1117 → 1060 으로 줄였다 — 미사용 import·변수 42개 제거, src 의 `console` 15개를 구조화 로거로 교체. 남은 1060 중 936 이 테스트 mock 의 `any` 다. 래칫이 실제로 실패하는지 경고를 하나 심어 확인했다(exit 1, "maximum: 1060").

  원문: **`pnpm lint`에 `--max-warnings`가 없어 898개 경고가 CI에 영구히 보이지 않음** — `package.json:13`의 `"lint": "eslint . --cache ..."`에 `--max-warnings`가 없고 ESLint는 경고에서 0으로 종료한다. `eslint.config.mjs:45, 54`가 최대 볼륨 규칙 둘을 `warn`으로 설정한다. 디스크의 `lint_output.txt`(2026-06-20 실행)가 `✖ 899 problems (1 error, 898 warnings)`를 기록한다 — `no-explicit-any` 715, `no-unused-vars` 88, `security/detect-object-injection` 34, `detect-possible-timing-attacks` 1, `detect-non-literal-regexp` 1(3.28이 그것이다). 34개 object-injection 경고는 이 프로젝트가 ebf071d에서 이미 패치해야 했던 유형의 이슈를 가린다. → `--max-warnings 899`를 추가하고 정리 PR마다 숫자를 낮춘다. `security/detect-object-injection`과 `no-unused-vars`를 `src/app/api/**`, `src/actions/**`, `src/services/**` 범위에서 즉시 `error`로 승격.

- **타입 인지 ESLint 설정 없음 — `no-floating-promises`/`no-misused-promises` 미실행** — `eslint.config.mjs:35`가 타입 미검사 preset `tseslint.configs.recommended`를 쓰고 `languageOptions.parserOptions.project`가 없다. 서버 액션 7개, 서비스 11개, API 핸들러 40개, 이벤트 리스너 계층을 가진 코드베이스에서 모든 의미 있는 호출이 Promise다. 서버 액션이나 라우트 핸들러의 await 누락은 조용히 에러를 떨구고 서버리스에서는 in-flight 상태로 동결될 수 있다. `sr-notification.listener.ts:31-63`이 이미 이 위험을 알고 `promises[]`를 모아 `backgroundTask`에 넘기지만, 다음 기여자가 맨 `emailService.sendSRAssigned(...)`를 떨구는 것을 막을 것이 없다. → 서버 디렉터리 범위의 타입 검사 블록 추가(`recommendedTypeChecked` + `projectService: true` + 두 규칙을 `error`).

- **`tsconfig`에 `noUncheckedIndexedAccess` 없음** — `tsconfig.json:2-24`가 `"strict": true`만 활성화한다. `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes` 부재. 코드베이스가 인덱스 시그니처에 크게 의존한다(`src/lib/constants/sr.ts:6, 17, 28, 36`의 `Record<string, string>`, `env-validation.ts:273-281`의 `[category]` 조회). `statusLabels[sr.status]`가 맵에 없는 새 enum 값에 대해서도 `string`으로 타입되므로 **상태머신에 상태를 추가하고 `statusLabels` 갱신을 잊으면 타입체크를 통과하고 한국어 UI에 `undefined`가 렌더링**된다 — 생명주기 변경 시 이 앱이 정확히 맞을 실패 모드다. → `noUncheckedIndexedAccess: true` + `noFallthroughCasesInSwitch` + `noImplicitReturns` 활성화. 새 에러는 `!` 단언이 아니라 맵을 `Record<SRStatus, string>`(Prisma enum 키잉으로 exhaustive)으로 타이핑해 해결.

- **`docker-entrypoint.sh`가 어떤 마이그레이션 실패에도 baseline을 기록** — `docker-entrypoint.sh:4-10`의 `if ! prisma migrate deploy; then ... prisma migrate resolve --applied 0_init; prisma migrate deploy; fi`가 에러 코드를 전혀 검사하지 않는다 — 주석은 "likely P3005"라고 하지만 분기는 모든 non-zero 종료(후속 8개 마이그레이션 중 실제 SQL 실패, 일시적 연결 거부, lock timeout 포함)에서 발화하며 `_prisma_migrations`에 0_init 성공 행을 무조건 쓴다. 실제 이유로 실패한 마이그레이션이 0_init을 적용된 것으로 표시해 **마이그레이션 이력이 실제 스키마와 영구히 발산**하고, 이후 배포가 선행 조건 없는 스키마에 후속 마이그레이션을 적용해 애플리케이션 버그처럼 보이는 런타임 에러를 낳으며, `_prisma_migrations` 수동 편집으로만 복구 가능하다. entrypoint이므로 컨테이너 재시작마다 반복된다. → 출력을 캡처해 P3005에만 baseline: `out=$(prisma migrate deploy 2>&1) || { echo "$out"; case "$out" in *P3005*) prisma migrate resolve --applied 0_init && prisma migrate deploy ;; *) exit 1 ;; esac; }`. 더 낫게는 마이그레이션을 entrypoint에서 배포 워크플로의 일회성 스텝으로 이동.

- **`NOT VALID` 없이 추가된 CHECK 제약** — `prisma/migrations/20260703010000_sr_constraints/migration.sql:3, 7-9`가 `ALTER COLUMN "sr_number" TYPE VARCHAR(30)`과 `ADD CONSTRAINT "srs_satisfaction_rating_range" CHECK (...)`를 `NOT VALID` 없이 실행한다. 채워진 프로덕션 DB에서 `srs` 전체 스캔 동안 ACCESS EXCLUSIVE를 잡으며, 그보다 나쁘게는 Zod 우회로 기록된 단 하나의 `satisfaction_rating` 0 또는 6이 문장을 실패시키고 → `migrate deploy` non-zero → entrypoint 폴백 재실행 → 재실패 → `set -e`로 컨테이너 사망 → **앱이 시작되지 않는다**. → 향후 제약은 2단계 패턴(`ADD CONSTRAINT ... NOT VALID` 후 별도 `VALIDATE CONSTRAINT`)을 쓰고 선행 데이터 정리 `UPDATE` 수행.

- **부동 `node:22` base 태그, 런타임 이미지의 전역 Prisma CLI, digest 핀 없음** — `Dockerfile:2, 19, 34`가 마이너 버전도 digest도 없는 부동 태그를 쓰고 `:6`의 `corepack prepare pnpm@latest --activate`(CI는 `PNPM_VERSION: '10'`으로 핀)와 함께 같은 커밋의 두 달 후 재빌드가 다른 이미지를 만든다. `package.json`에 `packageManager` 필드가 없어 corepack이 해석할 대상이 없다. `:59`의 `RUN npm install -g prisma@6.19.0`이 entrypoint 마이그레이션만을 위해 Prisma CLI 전체와 엔진 바이너리(~50-100MB)를 런타임 이미지에 넣으며, `package.json:50, 134`의 `^6.19.0`과 독립적으로 상향 해석되어 클라이언트와 CLI 버전이 어긋날 수 있다. → base 이미지를 패치 버전 + digest로 핀, `"packageManager": "pnpm@10.x.y"` 추가 후 Dockerfile을 `RUN corepack enable`만으로, 런너에서 전역 prisma 제거(마이그레이션을 배포 워크플로의 별도 스텝으로 옮기거나 builder 스테이지에서 `node_modules/prisma` + `node_modules/@prisma`만 복사).

- **`/settings/system`이 nav에서 숨겨졌지만 여전히 라우팅 가능하고 조작된 데이터 + 무동작 버튼 표시** — `src/config/navigation.ts:137-149`가 '일반 설정' 섹션을 주석 처리했지만(`docs/CHANGELOG.md:20`) 페이지는 `src/app/(dashboard)/settings/system/page.tsx`에 남아 있다. `:164`의 `마지막 백업: 2025-01-12 10:30`은 하드코딩된 날짜이고, `:166`의 `지금 백업`과 `:176`의 `캐시 삭제`에는 onClick 핸들러가 없다(`:225-227`, `:237-239`는 영구 비활성화, `:192-203`의 SMTP 입력은 값 바인딩 없이 비활성화). PUT 핸들러(`src/app/api/settings/system/route.ts:45-50`)는 바디를 파싱해 버리고 `'시스템 설정이 저장되었습니다.'`를 200으로 반환하며, 스키마에 Settings 모델이 없고 GET(`:20-27`)은 하드코딩 폴백(`'smtp.example.com'`, `'admin@example.com'`)이 있는 process.env만 읽는다. UI(`page.tsx:67-75`)는 200을 실제로 취급해 성공 토스트를 낸다. 게다가 이 라우트가 읽는 `SMTP_*` 변수는 어디에서도 설정되지 않고 실제 메일 전송은 `EMAIL_SERVER_*`(`email.service.ts:17-18`)를 쓴다 — **관리자가 SMTP 호스트를 바꿔도 아무 효과가 없다**. → 페이지를 완성(백업을 `scripts/backup.sh`에, 캐시 삭제를 `src/lib/cache.ts`에 연결, 실제 마지막 백업 시각 읽기)하고 nav 복원하거나, 페이지와 API 라우트를 삭제. 최소한 지금 두 무동작 버튼과 하드코딩 백업 시각을 제거하고, 시스템 설정 라우트를 `EMAIL_SERVER_*`로 정렬.

- **비밀번호 정책이 3곳에서 서로 다르게 표시** — 실제 규칙은 `src/lib/schemas.ts:18-25`의 min(8) + 대문자·소문자·숫자·특수문자 정규식이고 `src/app/api/profile/password/route.ts:14`가 그대로 쓴다. 그런데 `settings/profile/page.tsx:359`의 placeholder는 `(최소 6자)`, `src/components/profile/ProfileDialog.tsx:342`도 동일, `src/app/api/settings/system/route.ts:27`은 `passwordPolicy: '최소 6자, 영문/숫자 조합'`을 반환하고 `settings/system/page.tsx:235`가 이를 권위 있는 정책으로 렌더링한다. 등록 폼만 올바르다(`RegisterForm.tsx:247`). 사용자가 6자로 시도해 거부당하고, `error.issues[0]`만 표면화되므로 전체 규칙을 절대 알 수 없어 재시도를 반복한다. → `schemas.ts`에 `PASSWORD_POLICY_TEXT` 상수를 export해 4곳에서 사용, 모든 zod issue를 표면화.

- **프로필 이름 변경 후 세션이 갱신되지 않음** — `settings/profile/page.tsx:107-112`가 PATCH 후 성공 토스트와 로컬 `fetchProfile()`만 하고 NextAuth 세션 update를 호출하지 않는다(useSession을 import조차 하지 않음). 다른 표면은 올바르다(`src/components/users/UserActions.tsx:27, 32, 47, 64`; `users/[id]/page.tsx:255`). 헤더는 세션에서 이름을 읽으므로(`Header.tsx:48` → `:141`) 성공 토스트에도 불구하고 헤더가 계속 옛 이름을 표시해 저장 실패로 읽힌다. → `useSession`의 `update`를 destructure해 PATCH 성공 직후 `await update({ name })`.

- **`.env.example`/`.env.docker`/`ENV_VARIABLES` 3중 불일치** — `src/lib/env-validation.ts:51-169`의 `ENV_VARIABLES`에 비-레이트리밋 항목이 4개(DATABASE*URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL)뿐이고 나머지 14개가 전부 `RATE_LIMIT*\*`optional이다.`:35`의 `category`유니온은`'storage' | 'cache' | 'email' | 'webhook'`을 선언하지만 이 네 카테고리에 정의된 변수가 0개다. 실제 사용 중이나 미선언: `NEXT_PUBLIC_APP_URL`(8회), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(5), `EMAIL_SERVER_USER`(4), `EMAIL_SERVER_PASSWORD`(4), `VAPID_PRIVATE_KEY`(3), `STORAGE_DIR`(2, `storage.ts:10`), `EMAIL_FROM`(2), `VAPID_SUBJECT`, `EMAIL_SERVER_HOST/PORT`. 반대로 `.env.example:12, 15-16`은 코드에서 0회 참조되는 `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL/TOKEN`을 선언한다. `STORAGE_DIR`오설정은`storage.ts:18-19`가 의도치 않은 경로에 빈 디렉터리를 만들어 **업로드가 볼륨이 마운트되지 않은 곳에 떨어지고 컨테이너 재시작 시 유실**되게 한다. → 누락 변수를 `ENV_VARIABLES`에 추가(이메일/VAPID는 기능 활성화 조건부 필수), 손으로 만든 배열을 단일 zod 스키마로 교체해 타입된 `env`객체를 export하고 그 모듈 밖의 raw`process.env`접근을 ESLint`no-restricted-properties`로 금지, `.env.example`의 죽은 항목 삭제.

---

## 5. 정리하면 좋을 것 (Low)

- `src/app/api/srs/[id]/attachments/route.ts:201-208`이 `storagePath`를 그대로 반환한다 — `src/app/api/attachments/[id]/route.ts:38-41`은 주석 `'storagePath는 클라이언트에 노출하지 않음'`과 함께 명시적으로 제거하고, `intake/route.ts:294-303`도 명시적 select를 쓴다. `attachmentPublicSelect` 상수 하나를 정의해 4곳 전부에 적용.
- `src/lib/permissions.ts` 전체가 죽은 코드 — 7개 export가 자기 테스트 2개(`__tests__/permissions.test.ts:11`, `permissions.perf.test.ts:3`)에서만 import된다. 실제 시스템은 `permission-helpers.ts`(16개 파일이 import) + `policies.ts`다. 미래 기여자가 grep으로 이 DB 조회 버전을 먼저 찾아 세션/정책 계층을 우회하는 코드를 붙일 위험이 있다. 삭제 후 커버리지 재측정.
- `recharts` 3.7.0이 프로덕션 dependency인데 저장소 전역 참조가 `package.json:89` 자신뿐이다. 대시보드는 `dashboard/page.tsx:527`의 `{/* 상태/우선순위 분포 및 생성 추이 차트 제거됨 */}` 주석과 함께 차트를 제거했으나 `DashboardStats` 인터페이스는 여전히 `byStatus`(`:41`), `byPriority`(`:42`), `trend`(`:111-114`)를 선언하고 API가 계속 계산해 전송한다. `pnpm remove recharts` + 세 필드 제거. `@types/react`/`@types/react-dom`(`package.json:72-73`)도 devDependencies로 이동.
- `tsconfig.full.json`이 죽었고 base보다 **좁다**(`.next/dev/types/**/*.ts`를 누락). 유일한 참조는 `scripts/run-verification.ps1:27`의 캐시 파일명. 이름이 tsconfig.json이 약화된 설정이라는 인상을 주어 리뷰 시간을 낭비시킨다. 삭제.
- 추적된 죽은 아티팩트: `.agent/`·`.gemini/`·`.Jules/`·`.jules/` 45개 파일(`.Jules`와 `.jules`는 대소문자만 달라 Windows/기본 macOS에서 클론 시 충돌해 영구 dirty status), `src/stories/`(수정 없는 Storybook 템플릿, import 0건), `e2e/22-sr-intake-process.patch`(적용 불가능한 플레이스홀더 blob 해시), `public/manifest.json.bak`, `src/services/__tests__/sr.service.test.original.ts`(660줄, vitest include에 미매칭이라 실행 안 되지만 tsconfig가 `**/*.ts`를 포함해 매 type-check마다 컴파일되며 저장소 유일의 `@ts-expect-error` 2건 보유), `.eslintrc.debug.json`/`.eslintrc.minimal.json`(flat config가 무시), `playwright.debug.config.ts`, `vitest.mutation.config.ts`(참조 0건), `src/__tests__/helpers/setup.ts`(존재하지 않는 `@/lib/email`을 mock), `src/__tests__/mocks/prisma.ts`(저장소 유일의 `mockDeep<PrismaClient>` 하네스인데 import 0건 — 이것이 죽어 있어서 모든 서비스 테스트가 부분 Prisma mock을 손으로 만들고, 그 결과 `sr-api.integration.test.ts:19`의 `sr: {...}`(실제 델리게이트는 `sR`) 같은 드리프트가 살아남는다).
- `src/lib/__tests__/storage.test.ts:17, 24`의 4개 테스트가 `expect(typeof uploadAttachmentBlob).toBe('function')`만 단언하고 헤더 주석(`:11-13`)이 storage가 얕게만 테스트된다고 오도하는데, 형제 `storage.coverage.test.ts`가 33개 실테스트로 이미 철저히 커버한다. 삭제하고 비자명한 케이스 하나만 흡수.
- `it.skip` 4건이 실제 갭을 덮는다: `push.service.coverage.test.ts:130`의 410 만료 구독 정리, `api-rate-limit.test.ts:96, 121`의 `X-RateLimit-*`/`Retry-After` 헤더 계약, `EditSRDialog.test.tsx:295`. `e2e/sr-permissions.spec.ts:105`의 `expect(true).toBeTruthy()`는 무결론 실행을 통과로 바꾼다.
- `src/lib/constants.ts`와 `src/lib/constants/` 디렉터리가 공존해 `@/lib/constants` bare specifier가 모호하다(현재 파일이 이김, 각 6개 importer). `src/lib/constants/index.ts`를 추가하는 순간 12개 import의 해석이 조용히 바뀌며 tsc/Turbopack/Vite/Storybook의 해석 순서가 다르다. `constants.ts`를 `constants/app.ts`로 옮기고 명시적 `index.ts` 추가.
- 훅 파일명이 kebab-case 7개와 camelCase 2개(`useCreateSRForm.ts`, `useEditSRForm.ts`)로 분열되어 있고, `src/actions/sr-form.utils.ts`가 서버 액션이 아닌데 액션 디렉터리에 있다. 대소문자 비구분 파일시스템에서 잘못된 케이스 import가 로컬에서는 해석되고 Linux Docker 빌드에서 module-not-found가 된다.
- `src/components/profile/ProfileDialog.tsx`가 렌더링되지 않는 400줄 프로필 페이지 복제본이다(`grep ProfileDialog` 결과 자기 정의뿐). 동일한 낡은 `(최소 6자)` 힌트를 갖고 있어 비밀번호 정책이나 세션 갱신을 고치는 사람이 잘못된 파일을 패치할 수 있다.
- `src/app/api/push/test/route.ts`에 호출자가 없다(`grep 'push/test'` 무결과). 알림 설정 페이지에 `'테스트 알림 보내기'` 버튼을 추가해 사용자가 자가 검증하게 하거나(웹 푸시의 최다 실패 지점이 OS 차단·브라우저 포커스 규칙·VAPID 오설정이므로 가치가 크다) 라우트를 삭제.
- `src/app/(dashboard)/srs/[id]/page.tsx:182-193`의 수정 버튼은 `disabled` prop과 설명 토스트가 정확히 상보 조건이라 **토스트가 도달 불가능한 죽은 코드**다. 모바일에서 아이콘 전용(`:194`)이므로 레이블조차 없어 단순히 고장난 것처럼 보인다. disabled를 제거해 토스트가 발화하게 하거나 설명을 title/aria-describedby로 옮긴다.
- `HoldSRDialog.tsx:109-125`가 보류 사유만 수집하는데 `GEMINI.md` 2절 44행은 **보류 사유와 예상 해제일**을 명시한다. `status/route.ts:9-13`의 스키마도 expectedResumeDate를 받지 않는다. 보류된 SR의 재개 예정일을 조회할 방법이 없고 SLA 마감일도 조정되지 않는다.
- ~~`src/app/(dashboard)/my-requests/page.tsx:231, 234`의 상태 필터가 스키마에 없는 `RESOLVED`/`CANCELLED`를 제공하고(선택 시 `my-requests/route.ts:31`의 `status as any`가 Prisma에 도달해 500) `INTAKE`/`ON_HOLD`/`REJECTED`를 누락한다. `:63-81`의 라벨/색상 맵도 동일하게 낡아 REJECTED SR이 이름 없는 배지로 렌더링된다.~~ **✅ 해결됨 (2026-08-01, 3.40과 함께).** 필터 항목과 라벨/색상 맵을 `SRStatus` enum 에서 도출하고, 라우트는 알 수 없는 상태 값을 필터 없음으로 취급한다(`status as any` 제거).
- `dashboard/page.tsx:279`의 ENGINEER '전체 보기'가 `/srs?assignee=me`로 이동하는데 SR 목록은 `assigneeId`만 읽고(`srs/page.tsx:33`) `'me'` 처리가 없어 파라미터가 통째로 버려진다. `:373`, `:433`, `:453`의 세 카드는 반복 파라미터(`?priority=CRITICAL&priority=HIGH`)를 넘기는데 목록은 첫 값만 취한다(`srs/page.tsx:14-16`) — 카드의 숫자와 드릴다운 결과가 설명 없이 불일치한다.
- `src/app/(dashboard)/srs/[id]/intake/page.tsx:11-62`에 역할/권한 검사가 전혀 없어 CLIENT_USER가 URL로 접근하면 담당자 Select(내부 직원 명단 포함)와 우선순위·예상시간·접수 노트가 담긴 완전한 트리아지 폼을 보고 제출 시점에야 403을 받는다. 대시보드가 이 URL로 직접 링크한다(`dashboard/page.tsx:236`).
- `public/sw.js:96`의 오프라인 폴백 `return cachedResponse || cache.match('/dashboard') || cache.match('/login');`에서 `cache.match()`가 Promise(항상 truthy)이므로 `/login` 분기가 도달 불가능하고, `/dashboard`가 캐시에 없으면 await 값이 undefined가 되어 `respondWith(undefined)`가 reject한다. `/offline` 페이지도 없다. `:157`은 `public/icons/icon-192x192.png`가 존재함에도 `// icon: data.icon, // 아이콘 파일 없음`으로 알림 아이콘을 비활성화했다. `:86-88`이 인증된 HTML을 공유 캐시에 넣고 로그아웃 시 purge하지 않는다.
- `src/app/layout.tsx:7-26`의 metadata에 `manifest:` 키가 없어 `<link rel="manifest">`가 방출되지 않는다. 브라우저는 문서에 manifest 링크가 있어야 `beforeinstallprompt`를 발화하므로 `PWARegistration.tsx:88, 91`의 설치 배너가 절대 나타나지 않고 UA 스니핑 manifest 라우트(`src/app/manifest.json/route.ts`) 전체가 도달 불가능하다. `manifest: "/manifest.json"` 한 줄이면 되고, 그 라우트가 이미 PC에서 `display: 'browser'`로 반환하므로 데스크톱 억제 의도도 보존된다.
- `OrganizationTree.tsx:407, 147`이 `key={user.id || Math.random()}`을 쓴다 — id 없는 항목이 매 렌더마다 새 키를 받아 dnd-kit의 `useDraggable` 노드 등록이 상호작용 중간에 해체되고 포커스가 유실된다. `:299-305`가 `PointerSensor`만 등록해 **키보드/스크린리더 사용자는 사용자 재배정 워크플로에 접근할 경로가 전혀 없다**. `KeyboardSensor` 추가 + 드래그 핸들에 `tabIndex`/aria-label, 그리고 `UserCardContextMenu`에 비드래그 대체 액션 노출.
- `docs/system_manual.md:37, 58, 81, 103` 등의 모든 스크린샷이 `file:///d:/project/sr/public/images/manual/...`로 참조된다. 이미지는 `public/images/manual/`에 실재하므로 `/images/manual/...`로 서빙 가능하며 `file:///` 접두사는 불필요하다. GitHub, 문서 사이트, 내보낸 `docs/system_manual.html`, 다른 경로에 클론한 모든 개발자에게 이미지가 깨진다.
- `README.md:48-50`이 Next.js 16.0.7 / Node 24.x / React 19.2.1을 주장하지만 `package.json:81, 85`는 next 16.1.6, react ^19.2.4이고 `:5-7`은 `engines: { node: 22.x }`다 — 문서화된 Node major가 선언된 지원보다 하나 앞선다. `:5`가 존재하지 않는 `docs/images/overview.png`를 임베드하고, `:182-183`의 닫히지 않은 코드 펜스가 대부분의 렌더러에서 `## 📖 문서` 헤딩을 코드 블록으로 삼킨다. `:127-131`의 환경 변수 표는 `RATE_LIMIT_*` 3개만 문서화하고 DATABASE_URL·NEXTAUTH_SECRET·NEXT_PUBLIC_APP_URL·VAPID 키를 전부 누락한다.
- `START_SERVER.md:19` 등의 모든 명령이 `cd "C:\Users\sanle\OneDrive\문서\GitHub\sr"`로 시작하고(실제 저장소는 d:/project/sr), 예상 출력 블록이 `Next.js 15.0.3`을 주장하며, `'📚 관련 문서'`가 존재하지 않는 파일 4개(EDGE_RUNTIME_FIX.md, SETUP_COMPLETE.md, SUPABASE_SETUP.md, DEVELOPMENT_STATUS.md)를 링크하고, `'첫 사용자 등록'` 절이 Prisma Studio 수동 역할 삽입을 안내하는데 이는 README(`:102`)의 `db:seed`와 모순되며 3.4에 따라 애초에 동작하지 않는다.
- `e2e/26-settings-pages.spec.ts:22-25, 51-53, 122-125, 137-140, 157-159` 등 스위트 전반이 기능 부재를 통과로 변환하는 `if (!visible) { console.log('...스킵'); test.skip(); }` 패턴을 쓴다(27-service-categories 7건, 25-my-requests 6건, 24/26 각 5건, 28 4건). `27-service-categories.spec.ts:52`의 `expect(categories.length).toBeGreaterThanOrEqual(0)`와 `23-role-exclusivity.spec.ts`의 7개 항상-참 단언도 마찬가지. `21-sr-status-transitions.spec.ts:203, 234, 332, 400, 491`은 `console.log('⚠️ 보류 버튼을 찾을 수 없습니다. (UI에 미구현 가능성)')`로 명시적으로 기능 부재를 로그하고 녹색을 유지한다. 존재해야 할 기능은 `await expect(locator).toBeVisible()`로, 미구현 기능은 `test.fixme()` 또는 최상위 `test.skip(reason)`으로 표시.
- `playwright.config.ts:22`의 `retries: process.env.CI ? 2 : 1`이 로컬에서도 재시도를 켜 개발 중 간헐 버그를 숨긴다. e2e 전반에 217개 고정 `waitForTimeout`(21이 27건, 22가 25건, 20이 19건, 19가 16건, 공유 헬퍼에 8건)이 있고 이를 보상하려 타임아웃이 이미 확대되었다(`:11` 30초→60초, `:15` 5초→10초). 평균 1초로 매 e2e 실행의 3~4분이 순수 sleep이며 각각이 느린 러너에서 잠재적 flake다. CI `retries: 2`는 SSE/알림 경로의 실제 경쟁 조건을 녹색으로 재시도해 조사되지 않게 한다. `helpers/test-helpers.ts:61`의 `expect(duration).toBeLessThan(thresholdMs)`와 `src/__tests__/performance/benchmark.test.ts:33, 54, 73, 95, 119`의 20-100ms 벽시계 단언은 부하 있는 GitHub 러너에서 코드 정확성과 무관하게 실패한다.
- `playwright.config.ts:147-164`의 firefox/webkit/Mobile Chrome 프로젝트가 chromium의 `testIgnore`(`:110-120`)를 갖지 않고 `dependencies: ['setup']`만 선언해, `multi-user-setup`이 생성하는 `playwright/.auth/{client,manager,engineer}.json`을 요구하는 08/09/17-23 스펙과 `sr-permissions.spec.ts`를 실행한다. `setup` 프로젝트 자체가 무효다 — `testMatch: /global-setup\.ts/`가 `test()` 호출이 없는 파일을 가리킨다. 결과적으로 DB를 변경하는 멀티유저 워크플로가 하나의 DB에 대해 4개 브라우저에서 `fullyParallel: true`로 병렬 실행되며, HTTP 403을 단언하는 저장소 유일의 두 단언(`sr-permissions.spec.ts:247, 273`)이 auth 파일이 없거나 낡은 상태로 5회 실행된다. 같은 스펙이 파괴적 SR 삭제(`:113-192`)와 감사 로그 단언을 수행하므로 자기 자신과 경쟁한다.
- `e2e/sr-permissions.spec.ts:234`가 `const dbSR = await prisma.sR.findFirst({ orderBy: { createdAt: 'desc' } })`로 대상을 해석한 뒤 403을 단언한다. 모듈 레벨 `srId`(`:10`)는 첫 describe에서 채워지고 그 SR은 `:113-192`에서 **삭제**되며, `:233`의 주석이 워커 격리로 인한 유실 대비임을 인정한다. 가장 최신 SR이 우연히 엔지니어의 클라이언트에 속하거나 그에게 배정되어 있으면 API가 올바르게 200을 반환해 테스트가 실패한다 — 비결정적 오경보. `02-auth.spec.ts`와 `23-role-exclusivity.spec.ts:26-37, 223-233`도 실행마다 계정을 등록하고 정리하지 않아 공유 테스트 DB에 고아가 누적된다.
- `src/actions/__tests__/client.actions.isolation.test.ts:21`이 `vi.mock('@/lib/policies', () => ({ isInternalUser: (user) => ['ADMIN','MANAGER','ENGINEER'].some(...) }))`로 **테스트 대상 정책을 자기 복사본으로 교체**한 뒤 완전히 mock된 `ClientService.prototype.getClientsForSelection`의 호출 인자만 단언한다. `policies.ts`의 `isInternalUser`가 CLIENT_ADMIN을 포함하도록 바뀌어 모든 고객사 관리자가 즉시 교차 테넌트 조직 뷰를 얻어도 이 격리 테스트는 통과한다. `src/lib/__mocks__/auth-wrapper.ts:20-21`이 `withAuth`/`withErrorHandler`를 `handler => handler`로 스텁하는 것도 동일 문제 — 이 mock을 쓰는 모든 라우트 테스트에서 세션·레이트리밋·에러 매핑 계층이 제거된다.
- `e2e.yml:46-51`과 `ci-cd.yml:219-225`가 `playwright-report/`를 업로드하는데 `playwright.config.ts:28-29`가 HTML 리포트와 trace/video/screenshot을 모두 `test-results/`에 쓴다. 매 e2e CI 실행이 빈 아티팩트를 만들고, 스위트가 실패하면 `:49-53`이 올바르게 활성화한 스크린샷·비디오·트레이스에 도달할 수 없다. `if-no-files-found: error`도 함께 추가해 향후 경로 불일치가 조용히 넘어가지 않게 한다.
- `deploy.yml:121`의 스테이징 seed가 그 브랜치에서 `-f`를 생략한 유일한 compose 호출인데(다른 전부는 `-f docker-compose.test.yml`), scp 목록(`:70`)이 루트 `docker-compose.yml`을 서버로 복사하지 않아 폴백할 기본 파일이 없다. 또한 `npx tsx`를 `.next/standalone` 기반(devDependencies 미설치) 런너 이미지 안에서 비특권 `nextjs` 사용자로 실행하므로 런타임에 네트워크에서 tsx를 받아야 한다. `set -e`가 없어 실패가 보이지 않고 스테이징 DB가 E2E 픽스처 기대와 조용히 발산한다.
- `deploy.yml:70`이 프로덕션 `.env.docker`를 배포하지 않아(고의로 `.env.docker.test`만 포함) prod 설정이 **한 VM에 손으로 편집된 파일로만 존재**한다 — 버전 관리 없음, `backup.sh` 대상 아님(DB와 업로드만), 리뷰 불가, 재현 불가. `setup-server.sh`로 호스트를 재구축해도 재생성되지 않고 `docker compose up`은 env_file 부재 시 즉시 실패한다. compose 파일에 변수가 추가되거나 `env-validation.ts:51-87`이 요구하는 변수가 늘면 CI를 통과한 뒤 prod 부팅에서 fast-fail(`instrumentation.ts:29-30`이 `process.exit(1)`)해 크래시 루프가 되며 5초 배포 검사가 이를 못 잡을 수 있다.
- `nginx.conf:70, 103`이 `proxy_set_header Host $host`로 클라이언트 통제 Host를 전달하고 `.env.docker:13`이 `AUTH_TRUST_HOST=true`, `NEXTAUTH_URL`은 주석 처리(`:11`)다. 443 서버 블록 중 `default_server`가 없어 미인식 Host 요청이 프로덕션 vhost로 떨어지고, 공격자가 고른 host가 Auth.js의 origin 개념으로 전파된다 — host-header 기반 open redirect와 auth 플로우 캐시 포이즈닝의 표준 전제 조건. `src/lib/app-url.ts:30-32`의 하드코딩 폴백이 서버 생성 이메일 링크는 보호하지만 요청 시점 auth 표면은 무방비다.
- `scripts/deploy-local.ps1:3, 19, 31`이 로컬 빌드(커밋되지 않은 변경 포함)를 `latest` 태그로 프로덕션에 직접 밀어넣으며 `-o StrictHostKeyChecking=no`로 SSH 호스트 키 검증을 끈다 — DNS/라우트 하이재킹이 SSH 개인키 핸드셰이크와 이미지 tarball을 모두 수신한다. `docker compose down`이 `docker load` **전에** 실행되어 수백 MB 전송 전체 동안 프로덕션이 오프라인이다. break-glass 도구로 명확히 이름 짓고 known_hosts를 쓰며 커밋 SHA + `-local` 접미사로 태깅하고 순서를 뒤집거나, 삭제하고 `workflow_dispatch`를 쓴다.
- 자기 등록 후 승인 대기 중인 사용자가 보이지 않는다 — `users/UsersClient.tsx:42, 58`이 활성 사용자를 기본값으로 하고 카운트 배지 없는 3칩 필터만 제공한다. 자기 등록 ENGINEER는 비활성으로 생성되어(`register/actions.ts:92`) 비활성 탭에만 있고, 자기 등록 CLIENT는 활성이지만 PENDING UserClient 행을 갖는데 승인 컨트롤이 해당 행에만 인라인으로 나타날 뿐 필터·탭·카운트가 없다. 등록 시 알림도 없다(`actions.ts:118-128`이 domainEvents도 emailService도 건드리지 않음). 신규 엔지니어는 `'관리자 승인 후 사용 가능합니다'`를 듣고 `auth.ts:78`에서 설명 없이 차단되며, 관리자는 비활성 칩을 클릭하지 않는 한 그 계정을 영원히 보지 못한다.
- `settings/notifications/page.tsx:214-216, 310-314`가 모든 사용자에게 `emailSRCreated`/`pushSRCreated` 토글을 렌더링하지만 `sr:created` 알림은 ADMIN/MANAGER에게만 발송된다(`listener.ts:19-29, 34-60`). CLIENT_USER가 이를 켜고 저장에 성공한 뒤 한 건도 받지 못하며, 이는 실제로 고장난 푸시 토글(4.3)과 구별되지 않아 진단을 어렵게 한다.
- 리포팅이 필터 없는 CSV 버튼 하나다 — `ExportButton`이 `dashboard/page.tsx:198`에 한 번 렌더링되어 쿼리 스트링 없이 GET하고(`:23`), 라우트(`reports/export/route.ts:22-45`)는 파라미터를 전혀 받지 않으며 ADMIN/MANAGER에 대해 `where = {}`로 최대 5만 행을 내보낸다. `/reports` 페이지도 nav 항목도 없다(`navigation.ts:2`의 `BarChart3` import가 제거된 항목의 잔재). 버튼은 md 브레이크포인트 아래에서 숨겨지고(`:59`) `text/csv`를 방출하면서 `'엑셀 다운로드'`로 레이블된다. PRD의 기간 통계·고객사별 만족도·SLA 준수 리포팅이 부분 구현조차 없다.
- 만족도 평가가 스키마(`prisma/schema.prisma:272-273`), zod(`schemas.ts:123-127`), 서비스(`sr.service.ts:222-225`)까지 배선되어 있으나 이를 수집하거나 표시하는 UI가 전혀 없다 — 확인 완료 버튼(`SRStatusActions.tsx:212`)은 `action:'confirm'`만 POST한다. 프로덕션의 모든 행에서 `satisfaction_rating`이 NULL이므로 PRD가 약속한 `'고객사별 만족도'` 리포트를 생산할 수 없다. 절반 지어진 API 표면은 함정이기도 하다 — 일반 update 엔드포인트로 값을 PATCH할 수 있으나 어떤 UI도 보여주지 않는다.
- 댓글이 생성·조회만 가능하다 — `srs/[id]/comments/route.ts`는 GET(`:17`)과 POST(`:56`)만 export하고 per-comment 라우트가 없으며 `SRComments.tsx`에 편집/삭제 어피던스가 없다. 그런데 `prisma/seed.ts:45-46`이 `COMMENT:UPDATE`/`COMMENT:DELETE`를 시드해 `PermissionBoard.tsx`에 할당 가능한 토글로 노출한다. 오타나 실수로 붙여넣은 자격증명이 담긴 댓글을 작성자도 ADMIN도 제거할 수 없다.
- 인앱 알림 채널이 존재하지 않는다 — Header에 알림 벨/인박스가 없고, `/api/notifications` 라우트도 없으며, `realtime-events.ts:26`의 `NOTIFICATION_RECEIVED`를 발행하거나 수신하는 것이 없다. 이는 `GEMINI.md` 4절 66행의 `'이메일, 웹 푸시(Web Push) 및 인앱 알림(In-App Notification) 알림 채널로 발송된다'`와 모순된다. 브라우저 푸시 권한을 거부하고 알림 메일을 읽지 않는 사용자는 자신에게 SR이 배정되었음을 발견할 방법이 없다.
- `src/lib/prisma.ts:69`의 느린 쿼리 미들웨어가 development로만 게이트되어 `scripts/summarize-slow-queries.ts`와 `report:slow-queries`가 프로덕션 데이터를 받을 수 없다. `scripts/warm-dashboard.ts`는 캐시되지 않은 동일 요청을 재발행할 뿐이라 근본 원인(4.2의 `created_at` 인덱스 부재)을 가린다.
- `SRAttachment.uploadedBy`(`prisma/schema.prisma:358`)가 `@db.VarChar(30)`도 relation도 없다 — 스키마의 다른 모든 user 참조는 명시적 onDelete를 가진 실제 relation이다(`SRActivity.user` RESTRICT 등). `hardDeleteUser`(`user.service.ts:493-508`)가 SR/activity/comment/statusHistory만 검사하고 첨부를 누락하므로, 업로드만 한 사용자가 4개 가드를 전부 통과해 하드 삭제되고 `sr_attachments.uploaded_by`가 DB 레벨 에러 없이 존재하지 않는 id를 가리키게 된다.
- `service_categories.client_id`가 `ON DELETE SET NULL`(`schema.prisma:187`, `0_init/migration.sql:480`)이고 NULL clientId가 '글로벌 카테고리'의 인코딩이다(`service-category.service.ts:78-87, 106-121`). `ClientService.deleteClient`(`client.service.ts:222, 233-235`)의 애플리케이션 가드를 거치지 않는 모든 경로(수동 psql 정리, 미래의 관리 엔드포인트, seed/reset 스크립트)가 해당 클라이언트의 비공개 카테고리를 **글로벌로 전환**해 다른 모든 테넌트의 드롭다운에 떠난 클라이언트의 내부 카테고리명과 SLA 정책을 노출한다. `onDelete: Restrict`로 변경하거나 명시적 `isGlobal Boolean` 플래그 도입.
- `20260623055403_db_optimization` 마이그레이션이 FK 27개를 drop하고 17개 테이블의 PK를 drop/재생성하며(`:345-366` 등) `estimated_hours`를 `DOUBLE PRECISION`에서 `DECIMAL(10,2)`로 손실 축소했다(`:354`). 이미 적용되었으므로 되돌릴 것은 없지만, 채워진 프로덕션에서 이는 17개 테이블에 동시에 락을 잡는 단일 트랜잭션 내 다분 아웃티지였고 소수점 2자리 초과 값은 복구 불가하게 반올림되었다. 향후 타입 변경은 신규 컬럼 추가 → 배치 백필 → 짧은 락으로 교체 → 구 컬럼 삭제 패턴을 쓰고, `DROP CONSTRAINT ... _pkey`나 `SET DATE TYPE`을 포함하는 마이그레이션을 수동 리뷰로 플래그하는 CI 검사를 추가.
- SLA 마감일 계산에 영업일/영업시간 처리가 없다 — `service-category.service.ts:368-389, 399-411`과 `intake/route.ts:102-103`이 `startDate`에 순수 벽시계 시간을 더하고, `date-utils.ts:1-14`의 `getDaysUntilDue`도 평범한 달력일 차이다. 스키마에 휴일/영업 캘린더 테이블이 없다. 금요일 17:00에 8시간 SLA로 접수된 SR은 토요일 01:00 만기이며 월요일 아침 즉시 위반으로 보고된다. 24x7이 의도라면 `ServiceCategory.slaHours`에 명시적으로 문서화.
- `updateSR`의 no-op 업데이트가 relation 미로드 SR을 반환한다 — `sr.service.ts:331`의 `let currentSR = existingSR`(include 없는 `findUnique`, `:146`)가 `Object.keys(updateData).length > 0`일 때만 relation 로드 결과로 교체된다(`:333`). 모든 필드가 현재 값과 일치하는 PATCH는 client/requester/assignee/serviceCategory가 빠진 JSON을 반환해 `sr.assignee.name`을 읽는 UI가 다음 refetch까지 undefined를 렌더링하고, `:415`의 `emitRealtimeEvent`가 무조건 실행되어 가짜 `sr:updated` SSE를 브로드캐스트한다.

---

## 6. 잘 되어 있는 부분

이 절은 립서비스가 아니다. 아래는 소스에서 직접 확인한, 이 규모 사내 앱의 평균을 명확히 상회하는 구현들이다.

**동시성 제어와 트랜잭션 설계**

- 낙관적 잠금이 **모든** SR 변경 경로에 일관되게 구현되어 있다: `tx.sR.updateMany({ where: { id, status: <스냅샷 상태> } })` 후 `count === 0`을 충돌로 처리해 행 잠금 획득과 lost update 감지를 동시에 한다(`src/services/sr.service.ts:339-347`, `intake/route.ts:111-117` 이중 접수 방지, `:437-445`). 주석으로만 존재하는 동시성 대책이 아니라 실제 답이다.
- SR 번호 채번이 진짜 원자적이다 — `INSERT INTO sr_sequences ... ON CONFLICT (date) DO UPDATE SET seq = seq + 1 RETURNING seq`를 SR insert와 동일 트랜잭션에서 실행한다(`sr.service.ts:60-69`). read-modify-write 경쟁도, 중복 SR 번호도 없다.
- 외부 부수 효과가 트랜잭션 밖으로 유지된다. `prisma.$transaction`이 래핑되어(`src/lib/prisma.ts:33-58`) 트랜잭션 중 호출된 `domainEvents.emit`(`domain-events.ts:55-61`)과 `emitRealtimeEvent`(`realtime-events.ts:33-38`)가 AsyncLocalStorage 컨텍스트에 버퍼링되고 **커밋 후에만** 플러시된다. 롤백된 트랜잭션이 유령 알림을 만들 수 없고, 이메일/푸시/SSE가 DB 연결을 붙잡지 않는다.
- 감사 로그가 트랜잭셔널이다 — `auditService.createLog(tx, ...)`가 트랜잭션 클라이언트를 받고 실패 시 재던져 전체 작업을 롤백시킨다(`audit.service.ts:18-55`). 역할·사용자·SR 삭제·멤버십 승인 플로우에서 올바르게 사용된다.

**데이터 모델링과 쿼리**

- 비정규화 카운터 드리프트를 패치가 아니라 제거로 해결했다 — `20260703000000_drop_dead_sr_counters/migration.sql`이 `attachment_count`/`comment_count`를 drop하고 모든 읽기 경로가 Prisma `_count`를 쓴다(`sr.service.ts:560-565`). 존재하지 않는 카운터는 드리프트할 수 없다.
- 핫 목록 쿼리가 대용량 `description` TEXT 컬럼을 의도적으로 제외하는 명시적 `select`를 쓰고(`sr.service.ts:526-566`), SR 상세의 activities/comments는 `take: limit + 1`의 정통 커서 페이지네이션이다(`:677-696, 718-737`).
- 대시보드 집계가 JS가 아니라 SQL로 밀려 있다 — 요약 타일에 `COUNT(*) FILTER (...)`, 30일 추이에 `GROUP BY DATE(created_at)`, 모두 `Prisma.join`으로 파라미터화(`dashboard/stats/route.ts:90-117, 208-220`). SQL 인젝션 표면이 없고 8회 왕복 대신 1회다. `scripts/benchmark-dashboard-stats.ts`가 이 결정의 근거가 된 인메모리 비용을 문서화한다 — **추측이 아니라 측정된 결정**이다.
- SR 자식 테이블의 FK 삭제 동작이 명시적이고 정확하다 — activities/comments/attachments/status-history에 `onDelete: Cascade`(`schema.prisma:324, 341, 361, 414`), `srs.client_id`/`srs.requester_id`에 `ON DELETE RESTRICT`(`0_init/migration.sql:498-501`)이므로 라이브 SR 아래에서 클라이언트나 요청자가 삭제될 수 없다.
- 데이터 무결성 제약이 Zod가 아닌 DB로 내려가 있다 — `srs_satisfaction_rating_range` CHECK, 그리고 승인 상태 마이그레이션이 NOT NULL 컬럼을 **기본값과 함께 추가하고 백필**하는 안전 패턴을 쓴다(`20260703020000_user_client_approval/migration.sql:7-12`).
- 파괴적 작업 전 참조 무결성 사전 검사가 철저하다 — 클라이언트 삭제가 SR/사용자/카테고리/핸들러를 세고(`client.service.ts:219-241`), 역할 삭제가 사용자 배정을 확인하며(`role.service.ts:95-103`), 하드 사용자 삭제가 SR/activity/comment/statusHistory 참조로 차단한다(`user.service.ts:493-566`).
- 인덱스 커버리지가 사려 깊고 4개 마이그레이션에 걸쳐 반복 개선되었다 — `[clientId, status]`, `[assigneeId, status]`, `[status, dueDate]`, `[assigneeId, dueDate]`(`schema.prisma:288-296`)와 `sr_comments`/`sr_activities`의 `DESC` 정렬 복합 인덱스(`20260619_improve_indexes_and_sorting/migration.sql:7-9`)가 페이징된 댓글/활동 쿼리의 `orderBy: { createdAt: 'desc' }`와 정확히 일치한다.

**보안 기본기**

- 인증 라우트 래퍼가 일관되다 — `withAuth`/`withAuthAndRateLimit`(`auth-wrapper.ts:43-138`)이 40개 핸들러 중 37개에 적용되고, 직접 구현한 3개도 `session?.user?.id`를 먼저 확인한다. `src/app/api/**` 어디에도 미인증 쓰기 엔드포인트가 없다.
- 진짜 정책 계층이 존재한다 — `policies.ts`가 `canReadSR`/`canUpdateSR`/`canDeleteRole`/`canAssignRole`을 `ensureCan*`(ForbiddenError 던짐)와 함께 중앙화하고 14개 라우트 파일과 서비스 계층이 import한다. SR 인가가 3개 진입점 중 무엇을 쓰든 `srService.updateSR`에서 한 번만 강제된다.
- 첨부 처리가 잘 하드닝되어 있다 — 파일이 웹루트 밖에 기록되고(`storage.ts:10-12`), 파일명이 sanitize되며 해석된 경로가 `STORAGE_DIR` 아래인지 봉쇄 검사를 거치고(`:32-51`), 내용이 확장자가 아닌 매직 바이트로 검증되며(`file-validator.ts:121-158`), 다운로드가 `ensureCanReadSR` + `X-Content-Type-Options: nosniff` + `Cache-Control: private, no-store` + SVG/HTML을 `attachment`로 강제하는 `isInlineSafe()` allowlist로 게이트된다(`attachments/[id]/download/route.ts:19-22, 47, 63-71`).
- SQL 인젝션 표면이 0이다 — 모든 raw 쿼리가 동적 테넌트 절에 `Prisma.sql`/`Prisma.join`을 쓰는 태그드 템플릿이고, `$queryRawUnsafe`/`$executeRawUnsafe`가 어디에도 없으며 `src/`의 `dangerouslySetInnerHTML`도 0건이다.
- 자기 등록이 테넌트 접근을 부여할 수 없다 — `register/actions.ts:107-115`가 `UserClient` 행을 `PENDING`으로 만들고 JWT 콜백이 `APPROVED` 멤버십만 `token.clientIds`에 넣는다(`auth.ts:126-133, 180-187`).
- 로그인이 타이밍 세이프하고 fail-closed다 — `verifyPassword`가 사용자 부재 시 더미 bcrypt 비교를 실행하고(`security.ts:19-29`) 비활성 사용자는 비교 **후에** 거부된다(`auth.ts:78-81`).
- 실시간 SSE가 브로드캐스트가 아니라 연결별 인가 필터링이다 — `realtime/route.ts:47-56`이 enqueue 전 모든 이벤트에 `canReadSR(viewer, ...)`를 실행하고 이벤트를 유발한 행위자에게는 에코를 억제한다(`:48`).
- 역할/권한 변경 엔드포인트가 트랜잭셔널이며 id를 사전 검증해 잘못된 요청이 역할의 모든 권한을 벗겨낼 수 없게 한다(`roles/[id]/permissions/route.ts:47-69`, `users/[id]/roles/route.ts:69-75, 143-151`).
- 신뢰 프록시 IP 해석이 정확하다 — `getClientIp`가 `X-Real-IP`를 우선하고 `X-Forwarded-For`의 **마지막** 항목을 취해(`rate-limiter.ts:261-281`) 스푸핑 가능한 첫 항목을 피하며, `nginx.conf:72-73`과 일치한다.
- 저장소 루트의 SSH 개인키가 `.gitignore:30`의 `*.key`로 올바르게 무시되고 `git log --all -- '*.key'`가 무결과다 — **한 번도 커밋된 적이 없다**.
- 레이트리미터에 진짜 OOM 방어가 있다 — 무한 Map이 아니라 O(1) 확률적 샘플 축출 + 하드 10,000키 상한(`rate-limiter.ts:143-168`)이며, Edge 호환성을 위해 `setInterval`을 의도적으로 버린 이유가 주석에 있다.

**성능 엔지니어링**

- 첨부 다운로드가 버퍼링 없이 스트리밍한다 — `fs.createReadStream`을 `Readable.toWeb`으로 파이프하고 `fs.promises.stat`에서 정확한 `Content-Length`를 얻는다(`attachments/[id]/download/route.ts:55-71`).
- 파일 타입 검증이 전체가 아닌 첫 4100바이트만 읽고 그 이유를 주석으로 설명한다(`file-validator.ts:191-194`).
- SMTP가 완전히 제한되고 풀링된다 — `pool: true`, `connectionTimeout: 10_000`, `greetingTimeout: 10_000`, `socketTimeout: 15_000`(`email.service.ts:15-33`) — 멈춘 메일 서버가 요청 슬롯을 묶을 수 없다.
- 독립 쿼리가 일관되게 `Promise.all`로 병렬화된다 — 대시보드 9개(`:61`), SR 목록 페이지 9개(`:163`), `/api/srs`의 목록+카운트(`:56`).
- `serializeResponse`(`serialization.ts:13-79`)가 흔한 `JSON.parse(JSON.stringify(x))` 해킹이 아니라 Prisma Decimal → number, Date → ISO, JSON.stringify의 NaN/Infinity/undefined/function/symbol 시맨틱을 올바르게 처리하는 손수 만든 재귀 walker이며 전용 벤치마크 스크립트가 있다.
- 인증이 JWT 전략으로 roles/permissions/clientIds를 로그인 시 토큰에 굽고(`auth.ts:100-159`), 라우트가 이를 활용한다(`session.user.clientIds` 조회 대신) — 요청당 `auth()` 호출이 DB 쿼리 0건이다.
- 빌드/전달 위생: `output: 'standalone'` + 3단계 Dockerfile, `ANALYZE=true` 뒤의 `@next/bundle-analyzer`(`next.config.ts:4-6, 48`), `ssr: false`로 코드 분할된 React Query devtools(`ClientLayout.tsx:14-16`), 웹폰트 다운로드 0건(시스템 폰트), nginx gzip, 3개 서비스 전부의 Docker 로그 로테이션.

**프론트엔드**

- SR 목록 라우트가 교과서적 RSC다 — `srs/page.tsx`가 auth를 해석하고 명시적 테넌트 격리로 Prisma where를 만든 뒤 단일 `Promise.all`로 9개 쿼리를 발사(`:153-189`)하고 순수 props를 클라이언트 테이블에 넘긴다. 클라이언트 측 데이터 페칭도, 워터폴도 없으며, 통계가 의도적으로 별도 `whereStats`를 써서 임시 필터가 배지 카운트를 왜곡하지 않는다(`:134-144`에 이유가 문서화되어 있다).
- React Query 뮤테이션이 정통 낙관적 패턴을 정확히 따른다 — `use-sr.ts:43-89`(useUpdateSR)와 `:178-229`(useChangeSRStatus)가 cancelQueries → 스냅샷 → setQueryData → onError에서 context로 롤백 → onSettled에서 invalidate를 수행하고, useChangeSRStatus는 `router.refresh()`(`:227`)까지 호출해 서버 렌더 셸을 동기화한다.
- 로딩/빈/에러 상태가 사후 고려가 아니다 — `SRsDataTable`이 '필터 하에 결과 없음'과 '데이터 자체 없음'에 각각 올바른 복구 액션을 가진 별도 EmptyState를 제공하고(`:698-723`), SR 상세가 다시 시도(refetch)와 목록으로 돌아가기를 둘 다 제공하며(`srs/[id]/page.tsx:81-101`), SRComments/SRAttachments가 각자의 로딩·에러 분기를 갖는다.
- 최근 a11y 커밋(cc59bf9)의 주장이 실제로 검증된다 — 7개 정렬 가능 헤더 전부에 `aria-sort`가 올바르게 설정되고(`SRsDataTable.tsx:594-688`), 두 날짜 입력을 포함한 모든 고급 필터 컨트롤이 실제 `Label htmlFor`/`id` 쌍을 가지며(`:415-527`), 대기 오버레이가 `role="status"` + `aria-live="polite"` + sr-only 안내 + 아이콘 `aria-hidden`을 갖고(`:577-587`), 접기 트리거가 레이블된 region을 가리키는 `aria-expanded`/`aria-controls`를 갖는다(`:394-396, 406-410`).
- `Toaster`가 대부분의 shadcn 복사본이 건너뛰는 것을 한다 — destructive 토스트를 Radix `type="foreground"`(assertive)로, 나머지를 `background`(polite)로 매핑해 에러 안내는 끼어들고 일상적 안내는 그러지 않는다(`toaster.tsx:20-26`).
- 공유 `FileUpload`가 제대로 접근 가능하다 — `useId` 생성 `aria-describedby`가 입력을 '최대 5개, 파일당 10MB 이하' 제약 텍스트에 묶고(`:53, 168, 176`), 투명 오버레이 입력에 `aria-label`, 드롭 존에 focus-within 링(`:148`), 파일별 '삭제' aria-label(`:203`), effect cleanup에서 revoke되는 object-URL 프리뷰(`:13-20`, 누수 없음).
- 의도적인 번들·렌더 규율: `SRTableRow`/`SRCardItem` 둘 다 `memo()`(`SRListItem.tsx:40, 146`), `UserNav`가 레이아웃 시프트 방지 스켈레톤과 함께 `ssr:false` 동적 import(`Header.tsx:24-27`), `QueryDevtools`가 동적 + NODE_ENV 게이트(`ClientLayout.tsx:14-16, 52`), `QueryClient`가 `useState` 내부 생성이라 요청 간 공유 불가(`:24-39`), lucide가 namespace가 아닌 named import라 tree-shake됨.
- 접수 플로우가 제대로 만들어진 유일한 폼이다 — zodResolver를 쓰는 react-hook-form(`useIntakeForm.ts:55-56`), 한국어 필드별 메시지를 가진 선언된 스키마(`:23-36`), 비-JSON 에러 바디에도 견디는 에러 추출(`:186-212`), 이중 제출 방지를 위해 성공 내비게이션 동안 submitting을 true로 의도적으로 유지(`:235-236` 주석).

**API 계층**

- 구조화된 에러 taxonomy와 올바른 HTTP 상태 매핑 — `errors.ts`가 NotFound(404)/Forbidden(403)/Conflict(409)/ReferentialIntegrity(409)/Duplicate(409)/TooManyRequests(429)를 정의하고 `handleApiError`(`:15-23`)가 `error.statusCode`를 존중해 비즈니스 에러가 무차별 500이 되지 않는다.
- CSV 수식 인젝션 방어가 존재하고 정확하다 — `csvCell`이 `=+-@\t\r`를 따옴표로 접두하고 내장 따옴표를 이중화하며(`reports/export/route.ts:14-20`), 방어적 5만 행 상한(`:9`)과 Excel/한국어용 BOM(`:94`)까지 있다.
- 멀티테넌트 격리가 UI가 아닌 API 경계에서 일관되게 강제된다 — 외부 사용자가 목록(`srs/route.ts:29-47`), 생성(`:88-93`), 접수(`intake/route.ts:79-84`), 사용자 목록(`users/route.ts:27-41`)에서 `session.user.clientIds`로 고정된다.
- 페이지 크기가 공유 페이지네이션 스키마에서 100으로 제한되고 `.catch()` 폴백이 있어 쓰레기 입력이 예외 대신 기본값으로 열화한다(`pagination.ts:28-33`).
- 헬스 엔드포인트가 의도적으로 DB 에러 상세를 withhold하고 500이 아닌 503을 반환하며 드라이버 메시지는 서버에만 로깅한다(`health/route.ts:12-25`).

**테스트(작동하는 부분)**

- 상태머신이 진짜로 잘 테스트된다 — `sr-state-machine.test.ts`(24 its) + `sr-state-machine.coverage.test.ts`(43 its)가 실제 모듈을 import해 허용 전이와 금지 전이 양쪽을 단언한다(`canTransition('REQUESTED','COMPLETED')` false, `CONFIRMED → REQUESTED` false).
- `storage.coverage.test.ts`(33 its)가 저장소 최고의 파일이다 — 실제 구현에 대해 `resolveAttachmentFilePath` 봉쇄 거부, `../` traversal 탈출, 선행 슬래시 절대 경로 처리, 파일명 sanitize, 'traversal 감지 시 쓰지 않음' 경로를 검증한다.
- `sr.service.optimistic-lock.test.ts:66-92`가 진짜 행위 테스트다 — 상태 가드가 0행에 매칭될 때 `ConflictError`를 단언하고 **동시에 `sR.update`가 호출되지 않았음**을 단언한다(동시성 제어 경로의 올바른 부정 단언).
- `31-api-error-simulation.spec.ts`가 모범 e2e 스펙이다 — `/api/service-categories`를 500으로, 서버 액션을 403으로 인터셉트한 뒤 정확한 사용자 가시 토스트를 `await expect(errorToast).toBeVisible()`로 단언한다. soft-pass 가드도, `console.log` 대체도 없다.
- 단위 단언 밀도가 높고 약한 단언이 드물다 — 1208개 테스트 블록에 2292개 `expect(` 호출, 약한 형태는 ~54개(`toBeDefined()` 30, `not.toThrow()` 20, `toBeTruthy()` 2)뿐이고 단언 없는 단위 테스트는 1개다.
- 보안 초점 단위 테스트가 의도적 카테고리로 존재한다 — `*.security.test.ts` / `*.privilege-escalation.test.ts` / `*.isolation.test.ts` 10개 파일(예: `client.service.security.test.ts`가 Prisma `select`에 `password`가 절대 없음을 단언).
- 뮤테이션 테스트가 CI 비용을 지능적으로 스코프한다 — `scripts/stryker-ci.ts`가 PR base 브랜치와 diff해 변경된 `src/**/*.ts`만 뮤테이트한다.
- `e2e/sr-permissions.spec.ts:113-192`가 드물고 가치 있는 일을 한다 — UI 삭제 후 Prisma로 실제 DB를 폴링해 `auditLog` 레코드의 전체 형태(actionType, targetEntity, targetId, 역직렬화된 `changes.srNumber`)를 단언한다.

**설정·도구·인프라**

- TypeScript가 진짜 strict이며 우회되지 않는다 — `tsconfig.json:6`의 `"strict": true`, `next.config.ts:12`의 `typescript.ignoreBuildErrors: false`(켜지 말라는 경고 주석 포함), `eslint.ignoreDuringBuilds` 없음. `tsconfig.json:25-31`이 `**/*.ts`를 포함해 scripts/·e2e/·설정 파일까지 전부 타입 검사한다 — **검사 범위가 실제보다 좁지 않다**.
- 저장소 전역 `@ts-ignore` 0건, `@ts-expect-error` 2건(둘 다 죽은 테스트 파일), 프로덕션 `src/`의 non-null 단언 0건, `eslint-disable` 주석 13건(전부 방어 가능 — logger/instrumentation의 no-console, Playwright fixture의 no-empty-pattern).
- `instrumentation.ts:19-26`이 잘 추론된 가드다 — `isProduction`을 하드코딩하고 프로덕션에서 `SKIP_ENV_VALIDATION`/`PLAYWRIGHT_TEST`를 존중하기를 거부하며 이유를 주석으로 설명한다. 누락되거나 짧은 `NEXTAUTH_SECRET`으로 prod 부팅이 불가능하다(`env-validation.ts:315`가 `process.exit(1)`).
- `.gitignore`가 규율 있고 효과적이다 — `git ls-files`로 검증: `lint_output.txt`(106KB), `tsconfig.tsbuildinfo`(562KB), `ssh-key-2026-01-18.key`, `.env`, `coverage/`, `.next/`, `.stryker-tmp/`가 디스크에 존재함에도 **전부 미추적**이며 `coverage/`·`.next/`·`.stryker-tmp/` 아래 추적 파일이 0개다.
- `.husky/pre-commit`이 lint-staged 전에 `pnpm type-check`를 실행하고, lint-staged(`package.json:153-158`)가 스테이지된 .ts/.tsx에 eslint --fix + prettier + `vitest related --run --project=unit`을 돌린다 — 진짜 강한 로컬 게이트다.
- Node 버전 핀이 3개 표면에서 일관된다 — `package.json:6`의 `engines.node: "22.x"`, `Dockerfile:2/21/36`, 모든 GitHub 워크플로(`ci-cd.yml:26`, `e2e.yml:30`, `prewarm.yml:29`, `scheduled-checks.yml:27/57/87`). 드리프트 없음.
- 컨테이너 기본기가 준수하다 — 3단계 빌드, 전용 non-root 사용자 + 명시적 HOME, `/app/var/uploads`를 `nextjs:nodejs` 소유로 사전 생성해 named volume이 올바른 소유권으로 초기화(`Dockerfile:44-50, 67-70` — 보통 놓치는 미묘한 디테일). `docker-compose.prod.yml:57-60`이 Postgres를 호스트에 공개하지 않고 **그 이유를 문서화**한다.
- nginx가 변수 + 명시적 Docker resolver로 upstream을 해석해(`set $upstream_prod` + `resolver 127.0.0.11 valid=30s`, `:31, 65-66, 98-99`) 앱 컨테이너 재생성이 nginx reload를 요구하지 않고 낡은 IP에 물리지 않는다.
- `backup.sh`가 단순 덤프가 아니라 진짜 무결성 검사를 한다 — 빈 파일에서 중단하고 **오래된 백업을 삭제하기 전에 `pg_restore -l`로 덤프를 재검증**하며(`:29, 43-52`), 바이너리 스트림 손상을 피하려 `docker exec -t`를 올바르게 회피한다. `restore.sh`는 파괴적 경로에 RESTORE 타이핑을 요구하고 `pg_restore --clean --if-exists --no-owner --no-privileges`를 쓴다(`:29-41`). `docs/backup-and-restore.md:64-78`이 오프사이트 복제 미구성과 복구 리허설 필요성을 **솔직하게 인정**한다.
- 최신 커밋(de6ca1c)의 진단이 정확하다 — 이전 배포가 컨테이너 이름 충돌 시 조용히 no-op할 수 있었고, `down --remove-orphans` + `docker rm -f` + `--force-recreate` + `exit 1`하는 배포 후 running 상태 단언이 그 거짓 성공 보고를 실제로 고친다(`deploy.yml:148-157`).
- 이전의 파괴적 배포 스텝이 좋은 근거를 주석으로 보존한 채 제거되었다 — `prisma db push --accept-data-loss`와 무조건 재시드가 프로덕션 경로에서 사라졌다(`deploy.yml:163-168`).
- `src/lib/policies.ts`가 깔끔하게 팩터된 인가 계층이다 — `SRAccessFields = Pick<SR, 'id'|'clientId'|'requesterId'|'assigneeId'>`(`:20`)와 이 좁은 타입이 라우트의 `as any` 캐스트를 피하기 위해 존재한다는 명시적 주석(`:16-19`), SR/Client/User/Role에 걸친 대칭적 `canX`/`ensureCanX` 쌍.
- 도메인 리스너가 요청별 지연 등록이 아니라 서버 시작 시 정확히 한 번 등록된다(`src/instrumentation.ts:15`).
- Result<T> + errorToResult가 7개 액션 파일 전체에 균일하게 쓰이고, `src/actions`와 `src/services`에 무시된 에러 결과나 await되지 않은 promise가 (의도적 `backgroundTask` 헬퍼 외에) 없다.

---

## 7. 우선순위 로드맵

### Phase 1 — 1주 내 (배포 차단 해제)

| 작업                                                                                                                                    | 영역        | 공수 | 기대 효과                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | :--: | ---------------------------------------------------------------------- |
| `NEXTAUTH_SECRET`/`AUTH_SECRET`/DB 비밀번호를 환경별로 신규 발급, `.env.docker*` 추적 해제 + 이력 삭제, GitHub Secrets 주입 (3.1, 3.13) | 보안/설정   |  M   | 세션 위조 경로 차단 — **이것이 해결되기 전 나머지 보안 수정은 무의미** |
| `deploy.yml:121`의 자동 seed 중단 + `prisma/seed.ts`의 무조건 비밀번호 리셋 제거 + 스테이징 admin/engineer 계정 삭제 (3.2)              | DevOps      |  S   | 공개 자격증명으로의 스테이징 ADMIN 로그인 차단                         |
| `docker-compose.test.yml`의 `3001:3000`/`5433:5432` 제거 + `setup-server.sh:41` 방화벽 규칙 제거 (3.12)                                 | DevOps      |  S   | 인터넷 노출 DB·평문 앱 제거, `X-Real-IP` 스푸핑 경로 봉쇄              |
| `deploy.yml`을 CI 성공에 의존시키기(`needs`/`workflow_run`) + `concurrency` + `paths-ignore` (3.3)                                      | DevOps      |  S   | 품질 게이트가 실제로 배포를 막게 됨                                    |
| `canReadClient`/`canReadUser`/`canUpdateUser`에 테넌트 술어 추가 (3.6, 3.7, 3.10)                                                       | 보안        |  M   | 교차 테넌트 조회 3경로와 자가 테넌트 가입 차단                         |
| `updateSR`/`createSRAction`의 `clientId` 소속 검증 (3.8, 3.9)                                                                           | 도메인      |  S   | 교차 테넌트 데이터 주입·오배치 차단                                    |
| `deepSerialize`에 bigint 분기 추가 + 첨부 반환 5개 라우트에 `serializeResponse` 적용 (3.14)                                             | 데이터/API  |  S   | 첨부파일 REST 기능 전체 복구, 중복 업로드·고아 행 발생 중단            |
| `LoginForm.tsx:62`의 비밀번호 저장 제거 + 부팅 시 기존 키 정리 (3.5)                                                                    | 프론트/보안 |  S   | 평문 자격증명 영구 노출 제거                                           |
| `srs/page.tsx:25-26`의 `page`/`itemsPerPage` 클램프 (3.20)                                                                              | 성능        |  S   | 단일 URL OOM 경로 차단                                                 |
| `DELETE /api/srs/[id]` 응답 바디 수정 + `PATCH /api/users/[id]/client`를 409로 (3.15, 3.16)                                             | API         |  S   | 성공을 실패로/실패를 성공으로 보고하는 두 라우트 정상화                |

### Phase 2 — 1개월 내 (기능 결함 · 안전망 복구)

| 작업                                                                                                                                                                              | 영역          | 공수 | 기대 효과                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | :--: | ----------------------------------------------------------------- |
| ✅ `coverage.include` + Stryker `thresholds.break` (3.33, 3.36) — 완료(이전 세션)                                                                                                 | 테스트        |  M   | 커버리지·뮤테이션 게이트가 실제 신호를 내기 시작                  |
| ✅ 보안 E2E의 `console.log`를 `expect`로 치환(이전 세션) + `expect` 없는 테스트를 실패시키는 CI 검사 (3.34) — **완료 2026-08-01**                                                 | 테스트        |  M   | RBAC·권한상승 회귀가 CI에서 잡힘                                  |
| ✅ CI에 Postgres 서비스 + migrate + seed + e2e 실행 (3.35) + DB 통합 테스트 이식 (3.37) — **완료 2026-08-01**                                                                     | 테스트/DevOps |  M   | 마이그레이션 검증 + e2e 실행 가능 + DB 기반 통합 테스트 기반 확보 |
| ✅ MANAGER/CLIENT_ADMIN 페르소나 추가 + 세션 역할 단언 (3.38) — 완료(이전 세션)                                                                                                   | 테스트        |  S   | 5개 역할 중 검증되지 않던 2개 커버                                |
| ✅ 부트스트랩 경로 구현 — entrypoint 기준 데이터 seed + env 기반 ADMIN 부트스트랩 (3.4) — **완료 2026-08-01**                                                                     | UX/DevOps     |  M   | 신규 인스턴스가 사용 가능해짐                                     |
| ✅ 서비스 카테고리 생성/편집/삭제 UI + 신규 클라이언트 기본 카테고리 시드 (3.18) — **완료 2026-08-01**                                                                            | UX            |  M   | 신규 고객사 온보딩 경로 개통                                      |
| ✅ 카테고리 선택을 clientId로 스코프 + 서버 측 소속 검증 (3.19) — **완료 2026-08-01**                                                                                             | 도메인/보안   |  S   | 교차 테넌트 카탈로그 유출 + SLA 오염 차단                         |
| ✅ 관리자 비밀번호 재설정 구현 + 로그인 페이지 복구 안내 (3.17) — **완료 2026-08-01**                                                                                             | UX/보안       |  S   | 유일한 계정 복구 수단 복구                                        |
| ✅ `TZ=Asia/Seoul` + 날짜 포맷 타임존 명시 + SR 번호/대시보드 그룹핑 KST 정렬 (3.25) — **완료 2026-08-01**                                                                        | 프론트/데이터 |  M   | 하이드레이션 불일치·마감 배지 오류·CSV 날짜 밀림 동시 해결        |
| ✅ intake POST/PATCH에서 도메인·실시간 이벤트 발행 (3.21) — **완료 2026-08-01**                                                                                                   | 도메인        |  S   | 접수·배정·재배정 알림 복구                                        |
| ✅ SSE 핸들러에 `router.refresh()` 추가 + 죽은 쿼리 키 정리 (3.26) — **완료 2026-08-01**                                                                                          | 프론트        |  S   | 실시간 갱신 실제 동작                                             |
| ✅ `updateSR` 필드 단위 인가 분리 (3.22) + 담당자 존재/활성 검증 (3.23) — 완료(이전 세션)                                                                                         | 도메인        |  M   | SLA·우선순위·배정 위조 차단, 고아 SR 방지                         |
| ✅ `useEditSRForm`의 희망 우선순위/완료일을 `srUpdateSchema`에 추가 (3.27) — **완료 2026-08-01**                                                                                  | 프론트/API    |  S   | 조용한 데이터 소실 제거                                           |
| ✅ `highlightText` 정규식 이스케이프 (3.28) + 유휴 타임아웃 ref 리팩터 (3.24) — **완료 2026-08-01**                                                                               | 프론트        |  S   | 조직도 크래시 제거, 자동 로그아웃 실동작                          |
| ✅ `/api/srs/my-requests` 페이지네이션 + CSV 스트리밍·레이트리밋 + 업로드 Content-Length 선검사 + 클라이언트 상세 `srs: true` 제거 (3.39, 3.40, 3.41, 3.42) — **완료 2026-08-01** | 성능          |  M   | 4개 OOM 경로 전부 봉쇄                                            |
| ✅ 앱 HEALTHCHECK + compose healthcheck + nginx `service_healthy` + `mem_limit` + SHA 태깅 + 롤백 경로 + 배포 전 백업 (3.32) — **완료 2026-08-01**                                | DevOps        |  M   | 배포 아웃티지 축소, 롤백 가능, 마이그레이션 사고 복구 지점 확보   |
| ✅ certbot 갱신 자동화 (3.29) — **완료 2026-08-01**                                                                                                                               | DevOps        |  S   | 90일 후 전면 TLS 만료 방지                                        |
| pino 종료 플러시 ✅ **완료 2026-08-01** / `/api/health` 를 기존 uptime-kuma 감시에 등록 (3.30, 서버 측 작업 남음) — Sentry 는 소유자 결정으로 제외                                | DevOps        |  S   | 탐지 시간(MTTD) 확보                                              |
| 백업 암호화·리허설 워크플로 ✅ **완료 2026-08-01** / 오프사이트 복제는 **수용된 위험**(소유자 결정 2026-08-01) (3.31)                                                             | DevOps        |  M   | 논리적 손상 복구는 확보. **디스크·VM 유실은 여전히 미보호**       |

### Phase 3 — 분기 내 (구조 개선 · 재발 방지)

| 작업                                                                                                                                    | 영역        | 공수 | 기대 효과                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | :--: | ------------------------------------------------------ |
| `eslint-config-next` 연결 + `react-hooks/exhaustive-deps: 'error'` + 타입 인지 lint(`no-floating-promises`) (4.4, 4.6)                  | 설정        |  M   | 훅 의존성·부유 Promise 버그 클래스 전체를 CI에서 차단  |
| `pnpm lint --max-warnings` 도입 후 898 → 0 ratchet, `noUncheckedIndexedAccess` 활성화 (4.6)                                             | 설정        |  L   | 715개 `any`와 34개 object-injection 경고의 점진적 제거 |
| `.npmrc` 공급망 검증 복구 + gitleaks/Trivy를 실제 게이트로 + 액션 SHA 핀 (4.6)                                                          | 설정/DevOps |  S   | 의존성 침해·시크릿 커밋 재발 방지                      |
| `srs(created_at)` 및 `(client_id, created_at)` 인덱스 + `pg_trgm` GIN 검색 인덱스 (4.2)                                                 | 데이터      |  M   | 최다 호출 쿼리와 검색의 스캔 제거                      |
| 대시보드 stats 캐시 실제 연결 + `/srs`의 5개 badge 카운트를 단일 `FILTER` 집계로 (4.5)                                                  | 성능        |  M   | 대시보드·목록 DB 부하 대폭 감소                        |
| 첨부 쓰기 3경로 트랜잭션화 + SR 삭제 시 blob 정리 + intake PATCH activity를 트랜잭션 내부로 (4.2)                                       | 데이터      |  M   | 고아 행·고아 파일·감사 추적 유실 제거                  |
| Notification 트랜잭셔널 outbox 구현 + SMTP 재시도 + 푸시 preference 존중 (4.3)                                                          | 도메인      |  L   | 알림 전달 보장과 사용자 설정 실동작                    |
| 상태 전이 인가를 permission 기반으로 전환 + fail-closed + UI를 `getAvailableTransitions`에서 도출 (4.3)                                 | 도메인      |  M   | 커스텀 역할 사용 가능, UI-백엔드 발산 재발 방지        |
| 레이트리미터·SSE 에미터·첨부 저장소를 프로세스 외부로(Redis/Postgres LISTEN-NOTIFY/S3) (4.5)                                            | 성능        |  L   | 복제본 증설 가능, 레이트리밋 실효화                    |
| 모든 텍스트 필드 `.max()` + 쿼리 파라미터 zod 검증 + `sortBy` allowlist + 응답 봉투 통일 (4.3)                                          | API         |  M   | DB 팽창·스키마 유출·페이지네이션 불안정 동시 해결      |
| ✅ DB 기반 통합 테스트 14건 이식(교차 테넌트 필터, 트랜잭션 원자성, 동시 채번) (3.37) — **완료 2026-08-01**                             | 테스트      |  M   | 목 기반으로는 잡을 수 없는 결함 클래스 커버            |
| `NEXT_PUBLIC_APP_URL`/`STORAGE_DIR`/VAPID/EMAIL을 `ENV_VARIABLES`에 등록 + 플레이스홀더 거부 validate (4.6)                             | 설정        |  S   | 알림 링크 오도메인·푸시 무동작·업로드 유실 방지        |
| 죽은 코드 정리 — `permissions.ts`, `recharts`, `tsconfig.full.json`, `ProfileDialog`, 45개 에이전트 스크래치, 6개 테스트 아티팩트 (5절) | 설정        |  S   | 리뷰 노이즈 제거, mock/스키마 드리프트 차단            |
| 인앱 알림 채널 구현 또는 GEMINI.md 정정, 만족도 평가 UI, 댓글 편집/삭제, 리포트 필터 (5절)                                              | UX          |  L   | PRD-구현 격차 해소                                     |
| 문서 정합 — README 버전/펜스/env 표, START_SERVER.md 재작성, system_manual.md 이미지 경로 (5절)                                         | 문서        |  S   | 온보딩 경로 실동작                                     |

---

## 8. 검토 범위와 한계

### 분석한 것

**전수 읽기**: `prisma/schema.prisma`(494줄) 및 마이그레이션 8개 전부, `src/lib/`의 30개 모듈 전체(policies, permissions, permission-helpers, security, rate-limiter, api-rate-limit, api-helpers, api-error-handler, pagination, storage, file-validator, env-validation, action-helpers, app-url, serialization, cache, domain-events, realtime-events, transaction-context, prisma, logger, auth-wrapper, wait-until, sr-state-machine, schemas, errors, result, constants, date-utils, user-helpers), `src/services/` 11개 전부 + `listeners/`, `src/actions/` 7개 전부 + `register/actions.ts`, `src/app/api/**/route.ts` **40개 전부**(핸들러와 가드 열거, 인가 로직을 가진 24개는 전문), `src/auth.ts` + `auth.config.ts` + `src/proxy.ts`(Next 16에서는 이것이 미들웨어이며 `src/middleware.ts`가 없는 것이 정상), `src/hooks/` 9개 전부, `src/components/providers/` 전부, `src/config/navigation.ts`, `src/types/` 전부.

**인프라·설정**: `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`, `docker-compose{,.prod,.test}.yml`, `nginx/nginx.conf`, 워크플로 6개 전부(`ci-cd`, `deploy`, `e2e`, `backup`, `prewarm`, `scheduled-checks`), `.github/dependabot.yml`, `.gitleaks.toml`, `scripts/`(backup, restore, setup-server, setup-letsencrypt, deploy-local, run-verification, warm-dashboard, summarize-slow-queries, benchmark-dashboard-stats, stryker-ci), `.husky/pre-commit`, `tsconfig.json` + `tsconfig.full.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `tailwind.config.ts`, `.npmrc`, `package.json`(스크립트 46개 + 의존성 95개), `.gitignore`, `.vercelignore`, `vercel.json`, `.env.example`, `.env.docker`, `.env.docker.test`, `vitest.config.ts` + `vitest.stryker.config.ts` + `vitest.mutation.config.ts`, `stryker.config.mjs`, `playwright.config.ts`.

**교차 검증**: `git ls-files`로 추적/미추적 상태 확인(`.env.docker`·`.env.docker.test`·`.npmrc`·`public/uploads/attachments/*` 7개·에이전트 스크래치 45개는 추적, `lint_output.txt`·`tsconfig.tsbuildinfo`·`ssh-key-2026-01-18.key`·`.env`는 미추적), `git log --all -- '*.key'`로 SSH 키 커밋 이력 부재 확인, `git show 587e5d2`/`cc59bf9`로 최근 커밋 주장 검증. 커밋된 `coverage/coverage-final.json`(2026-06-30자)을 스크립트로 집계해 111/233 파일 실측. `node_modules`의 실제 구현 확인 — `next/dist/server/web/spec-extension/response.js:94-97`(NextResponse.json 위임), `vitest/dist/chunks/defaults.BOqNVLsY.js:15-31`(coverage 기본값)과 `coverage.AVPTjMgw.js`(`getUntestedFiles`), `web-push/src/web-push-lib.js:222,357,396`(timeout 지원). e2e 168개 테스트 바디의 `expect(` 존재 여부를 자동 스캔. `src/lib` 30개 모듈에 대한 orphan-module 스캔과 18개 의존성 사용처 확인.

**부분 읽기 / grep 기반**: `src/components/`의 clients/·users/·roles/ 하위 다이얼로그류, `src/app/(dashboard)/`의 일부 페이지(clients, users, roles, settings/profile, settings/system), e2e 31개 스펙 중 ~10개는 전문·나머지는 자동 스캔 + 발췌, `src/**/__tests__`의 136개 파일은 단언 밀도·import 그래프 grep + 핵심 파일 전문, `docs/`(LLD.md 3910줄, TRD.md, DESIGN.md, DB.md는 grep만).

### 분석하지 않은 것 · 한계

1. **빌드·테스트·실행을 하지 않았다.** 모든 발견은 정적 소스 읽기에서 도출되었다. 익스플로잇 체인은 시연이 아니라 소스를 통해 추적되었다.

2. **쿼리 플랜을 측정하지 않았다.** `EXPLAIN`을 실행하지 않았으므로 인덱스 사용 주장은 선언된 인덱스에 대한 쿼리 형태 추론이다. 실제 테이블 크기를 모르므로 성능 발견은 확장 리스크로 기술했다.

3. **번들 크기를 측정하지 않았다.** `next build --analyze`를 실행하지 않았다. `recharts`가 프로덕션 dependency지만 import 사이트가 0인 것은 확인했으나, 실제 클라이언트 번들 포함 여부는 `pnpm analyze`로 확인이 필요하다.

4. **프로덕션 VM의 실제 상태를 확인할 수 없었다.** `/home/opc/sr`의 `.env.docker` 실제 내용, 서버 crontab에 out-of-band로 추가된 certbot 갱신이나 백업 존재 여부, Oracle Cloud security list가 3001/5433 포트를 차단하는지 여부는 저장소에서 확인 불가하다. 3.1의 프로덕션 부분은 `docker-compose.prod.yml`이 **선언하는 것**과 스테이징이 **증명 가능하게 사용하는 것**을 근거로 작성했다.

5. **GitHub branch protection 규칙은 in-repo로 표현되지 않는다.** "배포가 게이트되지 않음"은 워크플로 트리거만으로 판단했다.

6. **커버리지·lint 수치는 커밋된 스냅샷 기준이다.** 84.23%/111파일은 2026-06-30자 `coverage-final.json`, 899 problems는 2026-06-20자 `lint_output.txt`에서 나온 값이며 현재 실행 결과는 다를 수 있다.

7. **뮤테이션 점수는 저장소에 존재하지 않는다.** Stryker를 실행하지 않았고 어떤 리포터도 결과를 영속화하지 않으므로 보고할 점수가 없다.

8. **의존성·죽은 export 판정은 grep 기반이다**(AST 기반이 아님). 계산된 specifier의 동적 `import()`나 배럴 재-export 체인으로만 소비되는 export는 위양성일 수 있다. `recharts`와 `src/lib/permissions.ts`는 node_modules/lockfile/.next를 제외한 전 저장소에 대해 이중 확인했다.

9. **런타임 동작 미검증 영역**: 다중 복제본에서의 in-process EventEmitter 동작(`docker-compose.prod.yml`이 replicas를 선언하지 않아 검증 불가), 실제 모바일 렌더링과 시각적 정확성, 서비스 워커의 실제 오프라인 동작, SSE의 nginx 버퍼링 실측 지연.

10. **e2e 스펙 31개 중 ~20개는 전문을 읽지 않았다.** 자동화된 `expect(` 존재 분석을 사용했으며, 이 분석은 `30-accessibility`의 5개 테스트(`checkA11y` 헬퍼에 위임)와 `capture-manual`의 3개(스크린샷 유틸리티)를 단언 없음으로 계수한다 — 실제 단언 없는 테스트는 41개가 아니라 ~33개다.

11. **다음 영역은 이 감사에서 다루지 않았다**: `docs/LLD.md`·`TRD.md`·`DESIGN.md`·`DB.md`의 구현 대비 드리프트(grep만 수행), `public/sw.js`의 전체 리뷰(오프라인 폴백과 아이콘 라인만 확인), 접근성의 실제 스크린리더 검증(정적 마크업 분석만), 그리고 `src/components/`의 약 절반(clients/·users/·roles/ 다이얼로그류의 이중 제출·포커스 동작).
