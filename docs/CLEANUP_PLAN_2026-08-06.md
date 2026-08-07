<!-- 생성: 2026-08-06 / 6축 병렬 감사 + 반증 검증(132건 확정, 1건 기각) -->

> **직접 재검증 완료 항목** (계획 작성자와 독립적으로 확인):
> `vitest.config.ts:16` include 미매칭으로 `sr.service.test.original.ts` 미실행 / `eslint-plugin-react-hooks` 팬텀 의존성 /
> `recharts`·`msw` 참조 0 / server action 5개 프로덕션 호출 0 / `src/stories/` 앱 참조 0 / e2e bare `test.skip()` 정확히 29곳 /
> import 그래프상 완전 고아 파일 `ProfileDialog.tsx` 1개 / `src/lib/permissions.ts` 프로덕션 importer 0.
>
> **ESLint 실측**(`eslint . --format json`): 에러 0, 경고 1056 =
> `no-explicit-any` 932(**프로덕션 121 / 테스트 811**) + `no-console` 47(**전량 `prisma/seed.ts`**) +
> `security/detect-object-injection` 41 + `no-unused-vars` 35 + `detect-possible-timing-attacks` 1.
> → `no-console` 47건은 `eslint.config.mjs:118` override 대상에 `prisma/**` 를 추가하는 것만으로 소멸한다(코드 수정 불필요).
> → `eslint.config.mjs:118` 의 테스트 override 가 `**/*.test.ts` 만 잡고 `**/*.test.tsx` 를 빠뜨린 것도 같이 정정할 것.

# SR 프로젝트 소스 정비 세부 계획 (Cleanup Plan)

> 기준: 6개 독립 감사 → 132건 검증 완료(adversarial refutation 통과). 모든 항목은 **동작 보존(behavior-preserving)** 범위로 좁혀서 배치했다.
> 검증 명령 주의: `pnpm test` 는 watch 모드(`vitest`)다. CI 동등 검증은 **`pnpm test:coverage`**(= `vitest run --coverage`, ci-cd.yml:188 게이트)를 쓴다.

---

## 1. 현황 요약

- **죽은 소스 코드 약 2,100 LOC** — `src/lib/permissions.ts`(114L, 프로덕션 호출자 0), 서비스 메서드 **23개**(permission 6 + client/service-category/user/sr 17개, 전부 `*.coverage.test.ts` 만이 소비자), server action **5개**(`getSRAction`/`getUserAction`/`getClientAction`/`getRoleAction`/`getAllRolesAction` — 모두 `'use server'` 공개 RPC 표면), 렌더링되지 않는 컴포넌트 1개(`ProfileDialog.tsx` 376L).
- **죽은/중복 테스트 약 4,300 LOC** — 실행조차 되지 않는 `sr.service.test.original.ts` 660L, 프로덕션 코드를 하나도 import 하지 않는 `src/__tests__/integration/` 439L + `performance/benchmark.test.ts` 123L, 상위집합에 완전 포섭된 primary 스위트 7개 640L, 그 외 중복 스위트 8개.
- **정적 자산·아티팩트 약 16MB** — 루트 gitignore 생성물 7개 4.0MB(`.dockerignore` 미등록 → `Dockerfile:31 COPY . .` 로 매 빌드 레이어에 구워짐), `.stryker-tmp/` 2.1MB(44 샌드박스), 커밋된 11.5MB 테스트 픽스처(`playwright/.test-files/test-large-file.bin` — 스펙이 런타임에 자가 생성함), Storybook 스톡 스캐폴드 `src/stories/` 416L + assets 757KB.
- **중복 정의 카운트** — `['ADMIN','MANAGER','ENGINEER']` 리터럴 **31곳**(이름 붙은 상수가 이미 3개), `{id,name,email}` Prisma select **42곳/12파일**, `statusLabels`/`priorityLabels` **4벌**, Badge variant 색상 맵 **3벌**(+ 변형 1), 로딩 스피너 마크업 **6곳**, `interface Client` **12곳** / `interface User` **7곳**, `vi.mock('@/lib/prisma')` 인라인 팩토리 **55개 파일**(공용 목 `src/__tests__/mocks/prisma.ts` 는 importer 0).
- **불필요 의존성 5개 + 고아 설정 4개** — `recharts`, `@radix-ui/react-visually-hidden`, `msw`, `@storybook/nextjs`, `@storybook/addon-onboarding` / `.eslintrc.debug.json`, `.eslintrc.minimal.json`, `tsconfig.full.json`, `playwright.debug.config.ts`, `vitest.mutation.config.ts`. 추가로 `eslint-plugin-react-hooks` 는 **미선언 팬텀 의존성**인데 `pnpm lint`(CI 필수 게이트) 가 그 위에 얹혀 있다.

---

## 2. 정비 원칙

| #   | 원칙                              | 구체 규칙                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **동작 보존**                     | 사용자에게 보이는 출력·HTTP 상태코드·응답 봉투·인가 판정은 이번 정비에서 절대 바꾸지 않는다. 바뀌는 것은 별도 티켓(§5 참조).                                                                                                                                                                          |
| P2  | **Phase 당 PR 1개**               | 되돌리기 단위 = PR 1개 = `git revert <merge-sha>`. Phase 간 순서를 건너뛰지 않는다.                                                                                                                                                                                                                   |
| P3  | **삭제 → 리팩터 → 개명 순서**     | 개명은 삭제와 같은 커밋에 섞지 않는다(리뷰 diff 가 읽히지 않게 된다). Phase 4 의 파일 개명은 마지막.                                                                                                                                                                                                  |
| P4  | **테스트는 소스와 같은 커밋에서** | 죽은 메서드를 지우면 그 `describe` 블록도 같은 커밋에서 지운다. 빨간 중간 커밋을 남기지 않는다.                                                                                                                                                                                                       |
| P5  | **커버리지 래칫 동시 재측정**     | 테스트/소스를 지우는 모든 커밋은 `pnpm test:coverage` 로 재측정 후 `vitest.config.ts:99-103`(statements 47.2 / branches 40.8 / functions 45.9 / lines 46.7)을 같은 커밋에서 조정한다. 수치 하락을 회귀로 오인하지 않는다. `vitest.config.ts:57-58` 주석대로 CI 수치는 storybook 프로젝트 포함 값이다. |
| P6  | **`--max-warnings` 는 내리기만**  | `package.json:13` 의 1056 을 올려서 통과시키지 않는다(ci-cd.yml:62-66 정책). Phase 마다 실측해 내린다.                                                                                                                                                                                                |

---

## 3. 단계별 실행 계획

### Phase 0 — 되돌리기 쉬운 청소 (zero-risk)

**목표:** 추적조차 되지 않거나 어떤 코드도 참조하지 않는 것만 제거. 소스 코드 무변경.

**대상 (PR 0-A: 워크트리 잔여물 / git 미추적)**

```
actions_runs.json, build_error.log, project.tar.gz, output.css,
coverage_summary.txt, coverage_summary_utf8.txt, tsconfig.tsbuildinfo   (합계 4.0MB)
.stryker-tmp/           (44 샌드박스 2.1MB, 각 디렉터리에 Windows 예약어 `nul` 포함)
test-results/           (537KB)
ssh-key-2026-01-18.key  (평문 RSA 개인키 1675B — 커밋 이력 0건, history rewrite 불필요)
```

1. 삭제 전 `tar czf <scratchpad>/phase0-backup.tgz` 로 7개 파일 백업(미추적 = git 복구 불가).
2. `ssh-key-2026-01-18.key` 를 `~/.ssh/` 로 이동. `.github/workflows/deploy.yml:101,124` 는 `secrets.SERVER_KEY` 를 쓰므로 배포 영향 0.
3. `.stryker-tmp` 는 PowerShell `Remove-Item -LiteralPath "\\?\D:\project\sr\.stryker-tmp" -Recurse -Force` (`\\?\` 접두사가 `nul` 예약어 파싱 우회).
4. `.dockerignore` 에 `*.tar.gz`, `*.tsbuildinfo`, `coverage_summary*.txt`, `actions_runs.json`, `output.css` 추가.

**대상 (PR 0-B: 추적 중인 고아 파일·설정)**
| 경로 | 근거 |
|---|---|
| `.eslintrc.debug.json`, `.eslintrc.minimal.json` | ESLint 9 flat config(`eslint.config.mjs`) 체제라 로드 자체가 안 됨 |
| `tsconfig.full.json` | 참조 0, include 가 base 의 **진부분집합**(`.next/dev/types/**` 누락). **동시에 `scripts/run-verification.ps1:27` 의 `"tsconfig.full.tsbuildinfo",` 행 삭제** |
| `playwright.debug.config.ts` | `test:e2e:debug` 는 `--config` 없이 기본 설정 사용 |
| `vitest.mutation.config.ts` | `stryker.config.mjs:9` 는 `vitest.stryker.config.ts` 를 가리킴 |
| `public/manifest.json.bak` | 권위 매니페스트는 `src/app/manifest.json/route.ts`. `Dockerfile:80` 이 public/ 을 통째 복사해 프로덕션에서 `/manifest.json.bak` 로 서빙됨 |
| `e2e/22-sr-intake-process.patch` | 85L, `index 1234567..abcdefg` 가짜 blob 해시 → 적용 불가 |
| `.gemini/tasks/` **26개** | 전부 `[x]` 완료된 일회성 작업 로그. **단 `20260618-…md:8`, `20260619-…md:8` 이 `scripts/deploy-local.ps1` 의 유일 참조이므로 `scripts/README.md` 에 한 줄 남길 것** |
| `.Jules/palette.md`, `.jules/bolt.md`, `.jules/sentinel.md` | 대소문자만 다른 두 경로가 인덱스에 공존 → Linux CI 에서 트리 분기 |
| `playwright/.test-files/` 5개 | `e2e/19-file-upload-download.spec.ts:52-85` 가 전부 자가 생성. `e2e/README.md:343` 도 자동 생성이라 명시 |

5. `.gitignore` 에 추가: `*.bak`, `*.orig`, `*.original.*`, `playwright/.test-files/`, `.jules/`.
6. `.gitignore:22` 의 `.vercelignore` 행 삭제(이미 추적 중이라 효과 없는 죽은 규칙).
7. Jules 는 디렉터리 pathspec 금지(core.ignorecase=true): `git rm --cached -- .Jules/palette.md .jules/bolt.md .jules/sentinel.md` → 워킹트리 병합 디렉터리 1회 삭제 → `git ls-files | grep -i '^\.jules'` 빈 출력 확인.
8. `playwright/.test-files` 는 `git rm -r --cached` 만(디스크 파일은 스펙이 재생성).
9. `.dockerignore` **내용 매칭으로** 편집(줄번호 신뢰 금지): 중복 `playwright-report` 1행 제거(:50 또는 :51), `vapid.json`/`vapid_final.json` 제거(:79-80, 실존 안 함), 중복 `README.md` 제거(:75, 두 줄 아래 `*.md` 가 이미 커버), `vitest.stryker.config.ts`·`vitest.integration.setup.ts` 추가.

**대상 (PR 0-C: 의존성 — 순서 중요)**

1. **먼저** `pnpm add -D eslint-plugin-react-hooks@7` (현재 `eslint.config.mjs:9` 가 import 하고 :59-60 에서 error 로 켜는데 미선언. `.npmrc:27 shamefully-hoist=true` 덕에 우연히 동작 중 → `eslint-config-next` 를 먼저 지우면 CI lint 가 즉사).
2. `src/components/dashboard/StatsCard.stories.tsx:1` 의 import 를 `@storybook/nextjs-vite` 로 통일.
3. `pnpm remove recharts @radix-ui/react-visually-hidden msw @storybook/nextjs @storybook/addon-onboarding eslint-plugin-import`
4. 동반 정리: `.storybook/main.ts:10`(addon-onboarding 행), `pnpm-workspace.yaml:2`(`- msw`), `package.json:151` trustedDependencies 의 msw, `docs/LLD.md:3386`(msw 를 공식 테스트 스택으로 문서화한 행).
5. `@types/react`, `@types/react-dom` 를 dependencies(package.json:74-75) → devDependencies 로 이동. **근거는 이미지 크기 절감이 아니라 나머지 `@types/*` 3종과의 컨벤션 일관성**(runner 스테이지는 `.next/standalone` 기반이라 애초에 미포함).
6. `eslint-config-next` 제거는 react-hooks 승격 완료 확인 후 별도 판단.

**대상 (PR 0-D: package.json 스크립트)**

- 삭제: `test:e2e:collaboration`, `test:e2e:reassignment`, `test:e2e:files`, `test:e2e:notifications`(package.json:33-36 — e2e 파일명 하드코딩, 호출 0건, `pnpm test:e2e e2e/17-….spec.ts` 로 동일).
- **존치**: `test:e2e:multi-user`(:31), `test:e2e:setup`(:32) — `playwright.config.ts:115/165` 실제 프로젝트명과 1:1.

**대상 (PR 0-E: 문서 정정 — 소스 무관)**

- `README.md`: 버전표(:46-58, 6개 중 5개 오류) 삭제 → "의존성 버전은 package.json 이 단일 진실" 한 줄로 대체 / `:49 Node.js 24.x` → `22.x`(package.json:5-7 engines 와 정면 충돌) / `:40` 의 Vercel Blob·Redis 주장 삭제(코드 참조 0) / `:5` 깨진 이미지 `docs/images/overview.png` 행 삭제 / `:183` 고아 코드펜스 제거(📖 문서 절 전체가 코드블록에 갇혀 있음) / 문서 목록에 `docs/LLD.md`·`TRD.md`·`DB.md`·`SERVER_RUNBOOK_2026-08-01.md`·`backup-and-restore.md`·`SECRET_ROTATION.md` 추가.
- `START_SERVER.md` 삭제, `:133-167` 부트스트랩 시딩 절차만 README '시작하기'로 흡수(나머지는 타인 PC 경로 `C:\Users\sanle\…` 3회, Next 15 표기, 죽은 링크 3개).
- `docs/system_manual.md` 상단에 "정본은 이 파일, `.html`/`.pptx` 는 생성물" 명시(3중 사본, `.pptx` 는 50KB zip 바이너리라 diff 불가).
- `docs/archive/PROJECT_AUDIT_2026-07-29.md:1520-1522, :1742` (2026-08-07 아카이브 이동) 에 처리 커밋 SHA 를 달아 항목 종료.

**검증:** `pnpm type-check && pnpm lint && pnpm test:coverage && pnpm build`, 그리고 0-B 의 `.dockerignore` 변경 후 `docker build .` 1회.
**예상 정리:** 소스 LOC ~600 + 아티팩트 **~16MB** + deps 6개 + 스크립트 4개.
**위험도:** 없음(0-C 만 낮음 — 실행 순서 위반 시 lint 즉시 파손).
**롤백:** `git revert` (0-A 는 백업 tarball 복원).

---

### Phase 1 — dead code 제거

**목표:** 프로덕션 호출자가 0인 코드와, 그 코드만 부양하던 테스트를 같은 커밋에서 제거.

**1-1. 권한 계층 (가장 큰 단일 덩어리, ~1,100 LOC)**

1. `src/lib/permissions.ts`(114L) + `src/lib/__tests__/permissions.test.ts`(171L) + `permissions.perf.test.ts`(80L) 삭제. 세션 권한은 `src/auth.ts:82-91` 이 독립적으로 구성하므로 영향 없음. 세 번째 PermissionService 싱글턴(`permissions.ts:4`)도 함께 사라짐.
2. 캐스케이드 — `src/services/permission.service.ts` 의 6개 메서드 삭제: `checkAnyPermission`(:99), `checkRole`(:153), `getUserRoles`(:164), `getUserPermissions`(:191), `requireRole`(:211), `getUsersWithPermissions`(:218).
3. **같은 커밋에서** 테스트 블록 삭제: `permission.service.coverage.test.ts` 의 `:25`(checkRole) `:45`(requireRole) `:59`(getUserRoles) `:81`(getUserPermissions) `:136`(getUsersWithPermissions), `permission.service.test.ts` 의 `:83`(checkAnyPermission) `:155`(getUserPermissions), 그리고 `permission.service.perf.test.ts` 전체(getUsersWithPermissions 전용).
4. `src/lib/permission-helpers.ts:58-64` 의 `hasAnyPermissionFlag`/`hasAllPermissionFlags` 삭제 + `permission-helpers.test.ts:37, :51` describe 삭제. **`src/hooks/use-permissions.ts` 는 손대지 않는다**(대소문자 정규화가 `hasPermissionFlag` 와 비등가 — 동작 변경).
5. `src/services/service-registry.ts:34-36` 의 `srService` getter 삭제(프로덕션·테스트 모두 참조 0). **레지스트리 자체는 존치**(:19-24 가 SR 알림 리스너를 생성자 부수효과로 등록하고 `instrumentation.ts:15` 가 이를 의도적으로 트리거).

**1-2. 서비스 메서드 17개 + 대응 테스트 (~620 LOC)**

- `client.service.ts`: `:127 getClientByName`, `:133 getAllClients`, `:303 activateClient`, `:312 deactivateClient`, `:321 getClientsByUserId`
- `service-category.service.ts`: `:79 getById`, `:289 activate`, `:304 deactivate`, `:323 assignHandler`, `:347 assignBackupHandler`, `:371 unassignHandler`, `:386 unassignBackupHandler`, `:469 getAllWithStats`
- `user.service.ts`: `:143 getUserByClientId`, `:383 updatePassword`, `:425 activateUser`
- `sr.service.ts`: `:843 getStatusHistory`(라우트가 `status-history/route.ts:36-55` 에서 동일 쿼리를 인라인 재구현)
- **영향 테스트 파일 11개**: `client.service.{test,coverage}.test.ts`, `service-category.service.{test,coverage}.test.ts`, `user.service.{test,coverage,coverage2}.test.ts`, `sr.service.{test,mutation,extended.coverage}.test.ts`, 그리고 `src/actions/__tests__/client.actions.security.test.ts:11/42`(`ClientService.prototype.getAllClients` 스텁).

**1-3. Server action 5개 (~98 LOC + 테스트 ~200 LOC)** — 미사용 `'use server'` export 는 클러터가 아니라 **활성 공격 표면**이다(형제 export 가 클라이언트 번들에 들어가므로 각각 action id 를 부여받음).

- `sr.actions.ts:93 getSRAction`, `user.actions.ts:76 getUserAction`, `client.actions.ts:124 getClientAction`, `role.actions.ts:76 getRoleAction`, `role.actions.ts:91 getAllRolesAction`.
- 동반 삭제: `client.actions.access.test.ts` 전체(getClientAction 테넌트 격리 전용), `sr.actions.security.test.ts:80-110`, `role.actions.security.test.ts:28-40`, `sr.actions.{coverage,integration,test}`·`user.actions.{coverage,security}`·`client.actions.coverage`·`role.actions.test` 의 해당 describe.

**1-4. 죽은 UI·라우트 (~1,000 LOC)**

1. `src/components/profile/ProfileDialog.tsx`(376L) 삭제 + 빈 디렉터리 제거. 이어서 그것만이 부양하던 `user.actions.ts:20 updateUserAction`, `:47 changePasswordAction` 삭제, `user.actions.password.test.ts` 전체 삭제, `user.actions.coverage.test.ts` 의 `:78-162`/`:163-244` **두 describe만** 삭제(같은 파일의 `:245 getUserAction`·`:310 getProfileAction`·`:343 getSRHandlersForSelection` 은 살아 있는 코드 커버 — 파일 통째 삭제 금지). `src/app/api/users/[id]/route.ts:64` 주석의 `changePasswordAction` 언급을 `POST /api/profile/password` 로 정정(+ `route.password-reset.test.ts:9` 동일 문구).
2. REST RBAC 라우트: `src/app/api/roles/[id]/route.ts` 삭제, `src/app/api/roles/[id]/permissions/route.ts` 삭제, `src/app/api/roles/route.ts` 는 **POST(:27-42)만 제거하고 GET(:13-25)은 존치**(roles/page.tsx:48 등 3곳이 소비).
3. `src/components/dashboard/StatsCard.tsx`(45L) + `__tests__/StatsCard.test.tsx`(52L) + `e2e/visual/dashboard.spec.ts:26-58` 3개 테스트 + 스냅샷 3장 삭제. **`StatsCardSkeleton.tsx` 는 존치**(DashboardSkeleton.tsx:1,10-13 이 4회 렌더) — `StatsCard.stories.tsx` 를 통째로 지우지 말고 `LoadingSkeleton` 스토리를 `StatsCardSkeleton.stories.tsx` 로 옮긴 뒤 나머지를 삭제.
4. `src/stories/` 통째 삭제(416L + Configure.mdx 451L + assets 757KB). `vitest.config.ts:42, :121` 의 `'src/stories/**'` 제외 2행도 무의미해짐. **주의: storybook vitest 프로젝트는 CI `pnpm test:coverage` 에 포함되어 커버리지 분자에 기여하므로(vitest.config.ts:57-58 주석) 같은 커밋에서 임계값 재측정 필수.**
5. `src/app/globals.css`: 사용처 0인 `.sr-*` 클래스 47개만을 셀렉터로 갖는 규칙 블록 71개(약 294L, 파일의 33%) 삭제. `--sr-*` 커스텀 프로퍼티 10개는 전부 사용 중이므로 손대지 않는다.

**1-5. 죽은 export·분기 (~250 LOC)**
| 대상 | 조치 |
|---|---|
| `src/lib/constants/sr.ts:17-25 statusColors`, `:36-41 priorityColors` | 삭제(25L, importer 0). **`statusLabels`/`priorityLabels` 는 6개 파일이 import — 존치** |
| `src/lib/constants.ts` `CLIENT_QUERY(:48-66)`, `TIME_MS(:78-86)`, `SLA(:88-108)` 전체 | 삭제(importer 0). 살아 있는 SLA 배율 정본은 `service-category.service.ts:19-24` Map |
| `src/lib/date-utils.ts:111-117 formatDate`, `:119-127 formatDateTime` | 삭제 + `__tests__/date-utils.test.ts:182~` describe 삭제. `getDaysUntilDue` 는 un-export. **`dashboard/page.tsx:177-184` 는 손대지 않는다**(D-day 산출식이 달라 표시값 변경) |
| `src/lib/storage.ts:137-146 listAttachmentBlobs` | 삭제 + `storage.test.ts:36-40`, `storage.coverage.test.ts:306-309`(및 import :48) + `docs/LLD.md:2727, :2737` 갱신 |
| `src/lib/notification-outbox.ts:76 enqueueEmail` | 삭제(프로덕션은 `enqueueEmails` 사용). **`stopNotificationDispatcher` 는 존치**(instrumentation.ts:19-20 인터벌의 유일 teardown) |
| 빈 constructor 5개 | `permission.service.ts:16`, `role.service.ts:33`, `service-category.service.ts:35`, `sr.service.ts:121`, `user.service.ts:57` |
| `UserTable.tsx:22-24, :36-38` 콜백 prop 3개 + `UsersClient.tsx:434-436` 전달 | 삭제(언더스코어 개명 = "죽었는데 지우기 무서웠다"의 표식) |
| `UserDialog.tsx:55, :65 roles prop`, `:245 roleIds`, `:67 자리표시자 주석` + `UsersClient.tsx:484 roles={roles}` | 삭제(역할 배정은 AssignRolesDialog 담당) |
| `UserDialog.tsx:110 + :112-121` 도달 불가 else, `:377, :400` 항상 참인 `Array.isArray` | 삭제 |
| `rate-limiter.ts:231-234 startCleanup`(본문이 `return;` 뿐) + `:97-98` 호출 | 삭제. 실제 정리는 `performIncrementalEviction`(:110) |
| `rate-limiter.ts:37-47 skipSuccessfulRequests/skipFailedRequests` + `:93-94` | 삭제, `Required<RateLimitConfig>` → `RateLimitConfig` |
| `env-validation.ts:35` 유니온의 `storage`/`cache`/`webhook` + `:473, :474, :476` 맵 항목 | 삭제(어떤 ENV_VARIABLES 항목도 이 카테고리를 안 씀) |
| `sr-state-machine.ts:255-259` 도달 불가 else | 삭제(REQUIRED_FIELDS 키가 3종뿐) |
| `user.service.ts:278-302`, `:554-582` 가짜 사용자 조작 분기 | 삭제 → `if (!beforeUser) throw new NotFoundError` 만 남음. **동시에 `user.service.coverage.test.ts:95-98`, `user.service.test.ts:114-123` 이 findUnique 를 실제로 목킹하도록 수정** |

**1-6. 죽은/자기충족 테스트 (~2,200 LOC)**
| 삭제 | LOC | 근거 |
|---|---|---|
| `src/services/__tests__/sr.service.test.original.ts` | 660 | vitest include(`src/**/*.test.ts`) 미매칭 → 한 번도 실행 안 됨. 고유 it 25개 중 23개가 sr.service.test.ts 와 문자열 동일 |
| `src/__tests__/integration/{system-integration,sr-flow}.test.ts` | 439 | `@/` import 0건. 존재하지 않는 `@/repositories/*` 를 mock. 리터럴 자기 단언뿐 |
| `src/__tests__/performance/benchmark.test.ts` + `.github/workflows/scheduled-checks.yml:98` | 123 | V8 벽시계 측정. 20ms 임계값이 **차단 CI 경로**(`pnpm test:coverage`)에 존재 |
| `src/lib/__tests__/permissions.perf.test.ts` | 80 | if/else 로 어떤 구현이든 통과 + 벽시계 단언 (1-1 에서 동반 삭제) |
| `src/lib/__mocks__/auth-wrapper.ts` | 22 | 21개 테스트가 전부 인라인 팩토리 → 로드 0회 |
| `src/__tests__/helpers/setup.ts` | 65 | importer 0, 존재하지 않는 `@/lib/email` 을 mock |
| `src/actions/__tests__/sr.actions.coverage.test.ts` | 71 | 3개 전부 sr.actions.test.ts 에 동일 이상으로 존재, 고유 단언 0 |
| `src/actions/__tests__/client.actions.isolation.test.ts` | 71 | coverage 형제(:329,:345)에 완전 포섭 + 테스트 안에 정책 로직 복제 |
| `src/services/__tests__/sr.service.coverage.test.ts` | 167 | it 2개. `:122` SRSequence 채번만 고유 → sr.service.test.ts createSR describe 로 **선이관 후** 삭제 |
| `push.service.coverage.test.ts` | 155 | it 3개 중 1개는 영구 `it.skip`. `:59 saveSubscription upsert` 만 고유 → **선이관 후** 삭제 |
| strict subset primary 7개: `storage.test.ts`(43), `logger.test.ts`(39), `sr-state-machine.test.ts`(158), `role.service.test.ts`, `service-category.service.test.ts`(`:57` 빈 배열 케이스 선이관), `use-toast.test.ts`, `api-helpers.test.ts` | ~640 | 각각 `*.coverage.test.ts` / `api-helpers.json.test.ts:59-83` 의 진부분집합 |
| `src/components/__tests__/Badge.test.tsx` | 25 | 3개 it 전부 `container.firstChild).toBeInTheDocument()` 무의미 단언 + 3중 중복 |
| `src/components/__tests__/{Button,Input}.test.tsx` | 98 | **선이관 필수**: Button 의 "disabled 시 onClick 억제"(:25-40)와 Input 의 `userEvent.type` 누적 입력(:14-22)은 ui 판에 없음 → 각각 `ui/__tests__/button.test.tsx`, `input.test.tsx` 로 옮긴 뒤 삭제 |
| `sr.service.update.coverage.test.ts` | ~260 | **6개 선이관 필수**: `:68`(NotFound client), `:102`/`:124`(외부 사용자 테넌트 이전 음/양성), `:153`(교차 테넌트 카테고리), `:195`(dueDate 재계산), `:173`(**실제** state machine 의 required-field 규칙 — `sr.service.coverage.test.ts:104` 는 state machine 을 mock 하므로 대체 불가) |
| `sr.service.extended.coverage.test.ts:171-195` deleteSR describe | 25 | `sr.service.test.ts:656-698` 과 축자 복제. 나머지는 존치(개명은 Phase 4) |
| `user.service.coverage2.test.ts:253`, `:332` | ~20 | **이 두 케이스만** 삭제(coverage:185, :377 에 포섭). 나머지 ~10개는 password-stripping 계약 등 유일 커버 — 파일 존치 |

**검증:** 각 커밋마다 `pnpm type-check` → `pnpm lint` → `pnpm test:coverage`(임계값 조정) → 마지막에 `pnpm build`, `pnpm test:e2e`.
**예상 삭제:** **~6,500 LOC** (소스 ~2,100 / 테스트 ~4,300 / CSS 294).
**위험도:** 낮음. 단 1-4-4(src/stories)와 1-6 은 커버리지 임계값에 직접 영향 → P5 필수.
**롤백:** PR 단위 revert. 1-2/1-6 은 소스·테스트가 짝지어 revert 되어야 하므로 커밋을 쪼개지 말 것.

---

### Phase 2 — 중복 통합 (duplication → shared helper)

**목표:** "같은 규칙이 두 곳에 있다"를 "한 곳"으로. **동작 동일성이 증명된 것만.**

**2-1. 상수·라벨 (LOC ~130)**

1. `src/components/srs/constants.ts:1-15` 의 `statusLabels`/`priorityLabels` 정의를 제거하고 `export { statusLabels, priorityLabels } from '@/lib/constants/sr';` 로 재-export. **삭제만 하면 `SRListItem.tsx:14`, `SRsDataTable.tsx:41`(`from './constants'`)가 즉시 컴파일 불가.**
2. `src/app/(dashboard)/clients/[id]/page.tsx:80-95` 의 세 번째 라벨 사본 삭제 → `@/lib/constants/sr` import.
3. Badge variant 맵 통합: `lib/constants/sr.ts` 에 `statusBadgeVariants`/`priorityBadgeVariants` 신설(Tailwind 판과 이름 충돌 회피) → `components/srs/constants.ts:18-33`, `clients/[id]/page.tsx:97-112`, `dashboard/page.tsx:117-132` 를 그것으로 교체. **`my-requests/page.tsx:98-106`(값에 `'outline'` 포함, 라벨 문구도 다름)는 명시적으로 제외** — 화면별 문구 차이가 의도인지 표류인지는 소유자 결정 사항.
4. `INTERNAL_ROLES` 를 `policies.ts:13` 에서 export, `user.service.ts:39 SR_HANDLER_INTERNAL_ROLES` 삭제, `policies.ts:398 SYSTEM_ROLES`(= `['ADMIN','USER','GUEST']`)를 `RESERVED_ROLE_NAMES` 로 개명(이름 혼동 제거). 리터럴 치환은 **인가 판정 용도에만**: `dashboard/stats/route.ts:17-19`, `intake/route.ts:38`, `users/[id]/client/route.ts:120,:125`, `users/[id]/roles/route.ts:82`, `user.service.ts:328`, `srs/page.tsx:53`. **`sr-state-machine.ts:80-93`(8곳)와 `config/navigation.ts:70-110`(6곳)은 리터럴 유지** + "INTERNAL_ROLES 와 별개" 주석만.

**2-2. 라우트 헬퍼 채택 (LOC ~90)**

1. 인라인 zod 검증 9줄 블록 5곳 → `validateRequestBody(request, X)` 한 줄: `profile/password/route.ts:35-45`, `profile/route.ts:78-87`, `roles/[id]/permissions/route.ts:22-31`(Phase 1 에서 파일 삭제되면 자동 해소), `srs/[id]/comments/route.ts:81-90`, `users/[id]/roles/route.ts:29-38`. `srs/route.ts:106-109`, `users/route.ts:66-67` 의 catch-less 변종도 통일(응답 바디·상태코드 동일함이 검증됨).
2. `srs/[id]/status-history/route.ts` — 이 엔드포인트는 소비자·e2e·유닛 테스트가 **전부 0**이므로 리스크 없이 정리: `:14-17` 수동 parseInt → `usePagination(request)`, `:56-62` 수동 봉투 → `createResponse(items, total)`, `:28-32` try/catch → 래퍼 위임. 커밋 메시지에 "봉투가 `{items,total,page,limit,totalPages}` → `{data,meta}` 로 바뀌지만 소비자 0" 명시.
3. 테넌트 스코프: `src/lib/policies.ts` 옆에 `getSRScopeFilter` / `resolveClientIdFilter` 신설 → **첫 타깃은 글자까지 동일한 두 블록만**(`srs/route.ts:52-70`, `users/route.ts:27-41`). 다른 8곳은 술어가 실제로 다르므로(ENGINEER 취급이 route 마다 상이) 이번 범위 밖.
4. 권한 검사: `users/route.ts:76-95`, `users/[id]/roles/route.ts:23-27`, `:77-80` 의 인라인 `roles.includes('ADMIN') || permissions.includes('ROLE:ASSIGN')` → `ensureCanAssignRole`(policies.ts:536). 의미 동등 검증 완료(메시지 문구만 변경). **`users/[id]/roles/route.ts:82-138` 의 3분기 상호배타 블록은 손대지 않는다** — `e2e/23-role-exclusivity.spec.ts:189-220` 이 `body.systemRoles`/`clientRoles`/`assignedClients` 필드를 단언.

**2-3. Prisma select/템플릿 (LOC ~150)**

1. `src/lib/prisma-selects.ts` 신설: `USER_SUMMARY_SELECT {id,name,email}`(42곳), `CLIENT_SUMMARY_SELECT {id,code,name}`(15곳), `USER_WITH_ROLES_INCLUDE`(user.service.ts:74-79, :134-136, :148-150, :273-276, :560-563 5곳). **제외**: 알림 수신자 형태 `{id,email,notificationPreference}`, `user.service.ts:242-243` 의 중첩 client 변형(다른 projection).
2. 최우선 타깃 = `src/app/api/srs/[id]/intake/route.ts` — 31줄 include 가 `:144-165`(POST)와 `:469-499`(PATCH)에 축자 복제. `SR_INTAKE_INCLUDE` 상수 1개로. 같은 파일 `:545`/`:572` 의 `newAssigneeName` 중복 계산도 `:544` 이전으로 호이스팅.
3. `user.service.ts`: `private async applyUserUpdateWithAudit(tx, userId, data, actionType, changes, actorId, ipAddress)` 추출 → `activateUser`/`deactivateUser`/`changePassword` 에서 호출. **`deactivateUser:460-485` 의 진행중 SR 검사는 반드시 트랜잭션 안에 유지**(`:456-459` 주석이 TOCTOU 수정임을 명시).
4. `sr.service.ts:893-929` / `:934-970` 의 커서 페이지네이션 → `cursorPage<T>()` 헬퍼. 기본 limit 20 은 `PAGINATION.DEFAULT_LIMIT` import.
5. `service-category.service.ts`: `private async ensureExists(id)` 추출 → `:290-293, :305-308, :323-326, :347-350, :371-374, :386-389` 6곳의 5줄 전문을 1줄로. **`update`/`delete` 는 `existing` 을 실제로 쓰므로 제외.**
6. `env-validation.ts:184-263` → `positiveIntegerVar(name, description)` 팩토리로 10줄화(80L 감소). 같은 파일 `:394-402` 를 `if (!value) { if (envVar.required) missing.push(...); continue; }` 한 블록으로 합쳐 `:412`, `:428` 의 잉여 `value &&` 제거.

**2-4. 컴포넌트 중복 (LOC ~250)**

1. `SRStatusChangeDialog.tsx` 1개로 `Complete/Hold/Reject/Reopen SRDialog`(621L) 통합. 가변 축 7개를 props(icon, iconClassName, title, description, fieldLabel, placeholder, helpText, action, bodyKey, submitLabel, submitVariant, disabledReason)로. Reopen 의 7일 가드는 `disabledReason?: string | null` 로 흡수. 호출부는 `SRStatusActions.tsx:14-17, :286-310` 한 곳, vi.mock 4건 → 1건. **`submitLabel` 문자열은 글자 그대로 보존**(`e2e/helpers/test-helpers.ts:561` 이 셀렉터 근거로 문서화).
2. `InlineSpinner` 추출 → 6곳(`ClientTable:51`, `ClientMobileList:33`, `UserTable:68`, `UserMobileList:45`, `RegisterForm:440`, `OrganizationTree:421`).
3. `ResponsiveTableShell`(`hidden md:block overflow-x-auto` + `<Table className="sr-table-template">`) → 4곳(`ClientTable:31`, `RoleTable:26`, `UserTable:42`, `SRsDataTable:598`).
4. `MobileListCard`(`border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden`) → 3곳(`ClientMobileList:53`, `RoleMobileList:41`, `UserMobileList:60`). 컨테이너 `md:hidden space-y-3 px-3 pb-4` 도 **3곳만**(`SRsDataTable:740` 은 `p-3` 로 패딩이 달라 제외 — 합치면 SR 모바일 뷰 상단 패딩이 바뀜).
5. `Role` 인터페이스(`RoleTable.tsx:7-15` = `RoleMobileList.tsx:8-16`, 글자 동일) → `src/types` 로 승격.
6. `RegisterForm.tsx:286-367` → `<PasswordRequirement met label />` + 배열 map. **표시 순서 length→uppercase→lowercase→number→special 을 배열로 명시**(checks 객체 선언 순서 `:53-59` 는 lowercase/uppercase 가 뒤바뀌어 있어 `Object.entries` 순회는 금지).
7. `users/[id]/page.tsx:70-81 getUserTypeBadgeVariant` 만 삭제 → `@/lib/user-helpers` import(완전 동일 = 무변경). **`:53-67` 의 로컬 `getUserTypeLabel` 은 삭제하지 말고 `getUserTypeLabelLegacy` 로 개명 + "공용판과 판정 순서가 다름(userType 미사용)" 주석** — 통합하면 표시 문구가 실제로 바뀐다.
8. `src/lib/schemas.ts` 로 **순수 이동**만: `commentSchema`, `statusActionSchema`, `clientAssignSchema`, `roleAssignSchema`(규칙 동일). **`profile/route.ts:15-18` 의 `updateProfileSchema` 는 이동 금지** — `:17` 의 `.or(z.literal(''))` 이 "아바타 지우기" 경로(`settings/profile/page.tsx:103`)이며 `schemas.ts:259` 에는 그 분기가 없다.
9. `profile/password/route.ts:17-26` 의 중복 `changePasswordSchema` — **1단계(순수 de-dup)만 수행**: `schemas.ts` 에서 단일 정의를 export 하고 라우트가 소비하되, 페이지가 보내는 필드명 `confirmPassword` 를 유지하도록 `settings/profile/page.tsx:145-149` 를 같은 커밋에서 맞춘다. **2단계(서비스 위임으로 PASSWORD_CHANGE 감사로그 복구, 401→400)는 명시적 동작 변경이므로 별도 티켓.**

**검증:** `pnpm type-check && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e`. 2-4-1 은 `e2e/` 상태 변경 시나리오 전량 필수.
**예상 정리:** **~620 LOC 감소** (신설 헬퍼 코드 제외한 순감).
**위험도:** 중(2-2-3/2-2-4/2-4-1). 각 항목을 개별 커밋으로 쪼개 bisect 가능하게 유지.
**롤백:** 항목별 커밋 revert. 2-4-1 은 4개 원본 파일이 같은 커밋에서 삭제되므로 revert 로 완전 복원.

---

### Phase 3 — 큰 파일 분리 및 가독성

**목표:** "한 화면에 안 들어오는 함수"와 "경계에서 타입을 버리는 코드"를 정리. **삭제 아님, 이동/좁히기.**

**3-1. `SRService.updateSR` 분해** (`sr.service.ts:266-664`, 399L 단일 메서드 / 단일 try)

1. `collectOperatorFieldChanges(validated, existingSR, assigneeId): string[]` 추출 ← `:338-410`(주석만 18줄).
2. `buildSRUpdateData(...): Promise<{ updateData: Prisma.SRUncheckedUpdateInput; statusChanged: boolean; assigneeChanged: boolean }>` 추출 ← `:412-555`. **async 필수**(`:479-491` 에 `serviceCategoryService.calculateDueDate` I/O 존재), **반환에 두 플래그 필수**(`:620`, `:629` 이벤트 발행부가 소비).
3. 남는 본문 = 사전조건 → 조립 → 트랜잭션 → 이벤트 4단계.
4. `sr.service.ts:822-825` 의 `deleteClient = tx && 'sR' in tx && … ? tx : prisma` 폴백을 `await tx.sR.delete({ where: { id } })` 로 환원 + 테스트 4곳(`sr.service.test.ts:436, :673`, `sr.service.mutation.test.ts:226`, `sr.service.extended.coverage.test.ts:191`)의 `$transaction` mock 이 `sR.delete` 를 가진 tx 를 넘기도록 수정.

**3-2. `user.service.ts` 프리즈마 폴백 체인 21곳 제거** — **순서 고정**

1. **먼저** `user.service.coverage.test.ts:10-22` 의 prisma mock 에 `$transaction: vi.fn(cb => cb(prisma))` 와 `rolePermission.findMany` 추가, 각 테스트가 `prisma.user.findUnique` 로 실제 레코드를 반환하도록 보강. (현재 `$transaction` 자체가 없어 `runInTransaction:60` 이 false 로 떨어짐 → 먼저 안 고치면 updateUser 계열 6개가 즉사.)
2. 그 다음 `tx?.x?.y || (prisma as any).x?.y || (prisma as any).default?.x?.y` 21곳을 `private getClient(tx)` 또는 직접 `tx.x.y(...)` 로 환원(`:309, :317-320, :391, :432, :489, :615, :651-652, :669-672, :683-686, :699-702, :714-720, :817-820, :839-840`).
3. `:508-534` 의 `typeof x.count === 'function' ? … : async () => 0` 5모델 반복(20L) 제거.

**3-3. 타입 경계 정리 (LOC ~200)**
| 대상 | 조치 |
|---|---|
| `SRsDataTable.tsx:39, :50` | `import { SRService }`(서버 모듈) 삭제 → `import type { SRListItem } from '@/types/sr.types'`(:87-114). 두 타입이 동일함 검증 완료 |
| `UserTable.tsx:14-26`, `UserMobileList.tsx:15-26`, `UsersClient.tsx:35-36` | `any[]` → `User[]`/`Client[]`/`Role[]`. 본문 `(ur: any)`(:115,:163), `(uc: any)`(:135) 애노테이션 삭제(추론) |
| `useEditSRForm.ts:38 sr: any` | `EditSRDialog.tsx:39-70 interface SR` 을 `export interface EditableSR` 로(또는 `src/types/sr.types.ts` 이동) → 유일 호출부와 타입 일치 |
| `useEditSRForm.ts:71`, `useCreateSRForm.ts:40` 의 `(profileResult.data as any).clients` | 캐스팅 삭제 — `getProfileAction` 반환 타입에 `.clients` 가 이미 존재(순수 잉여) |
| `push.service.ts:11-35` 손수 베낀 Prisma 모델 2개 | `import type { NotificationPreference, PushSubscription as DBPushSubscription } from '@prisma/client'` 로 교체. `:243 webPush: any` → `typeof import('web-push')`(같은 파일 :150 이 이미 정확히 알고 있음) |
| `sr-state-machine.ts:7-14` 손수 선언한 SRStatus | `import type { SRStatus } from '@prisma/client'; export type { SRStatus };` — VALID_TRANSITIONS/REQUIRED_FIELDS 의 키 누락을 컴파일러가 잡게 됨 |
| `srs/page.tsx:92-102` | `SRStatus`/`SRPriority` import 후 `as SRStatus` / `as SRPriority` 로 축약(캐스팅 동작 동일). **zod 검증 도입은 응답이 바뀌므로 별도 티켓** |
| `src/types/user.ts` | 삭제 금지. Prisma 모델명 5개를 그림자처럼 가리므로 `src/types/user-view.ts`(`UserListItem`/`UserRoleView`/`UserClientView`)로 **개명** + 유일 importer `UsersClient.tsx:18` 갱신. `src/lib/user-helpers.ts:1-21` 의 세 번째 사본은 그 뷰 타입에 대한 `Pick<>` 로 |
| `interface Client` 12곳 / `interface User` 7곳 / Attachment 3곳 | `{id,name,code}` 3필드 Client 는 `@/types` 로 치환(`RegisterForm.tsx:35-39`, `UserDialog.tsx:25-29`, `useCreateSRForm.ts:13-17`, `useEditSRForm.ts:12-16`). `clients/[id]/page.tsx:63-78` 은 `ClientDetail` 로 개명. Attachment 는 `createdAt: Date \| string` 을 정본으로(SRAttachments.tsx:27 의 타입이 넓어짐을 커밋 메시지에 명시) |

**3-4. 구조 정리**

1. `src/actions/sr-form.utils.ts`(`'use server'` 없는 순수 빌더) → `src/lib/sr-form.utils.ts` 이동. `src/actions/sr.actions.ts:21`, `src/actions/__tests__/sr.actions.helpers.test.ts:3` 갱신. `SRUpdateInput`(참조 0) 삭제, `SRCreateInput` un-export. → `src/actions/` 아래는 전부 action 이라는 규칙이 성립.
2. `src/components/ui/index.ts` 에 `export * from './copy-button';` 추가(알파벳 순 `./context-menu` 앞) → 배럴 우회 3곳(`srs/[id]/page.tsx:30`, `SRListItem.tsx:9`, `SRsDataTable.tsx:37`) 을 `@/components/ui` 로 통일. 규칙 명문화: **앱 코드는 배럴, `ui/` 내부는 서브경로**.
3. 훅 파일명 kebab-case 통일 — `useCreateSRForm.ts`, `useEditSRForm.ts`, `src/components/srs/intake/useIntakeForm.ts` 3건만 `git mv`(→ `src/hooks/use-*.ts`). 규칙 문장: **"기능 컴포넌트만 PascalCase, `components/ui` 의 shadcn 원시 컴포넌트·훅·유틸·서비스는 kebab-case, 훅은 `src/hooks` 아래"**(`src/components` 하위 46개 소문자 파일이 이미 이 규칙).
4. 설명 주석 3개 추가(다음 사람이 되돌리지 않도록): `transaction-context.ts` 상단 "prisma↔events import cycle 차단용, 병합 금지" + `TransactionEventContext` un-export / `api-rate-limit.ts:24` "프로덕션은 `rateLimit({limiter})` 만 사용, 나머지 옵션은 `__tests__/api-rate-limit.test.ts:107,154,182,209` 전용" / `src/lib/pagination.ts` 상단에 응답 봉투 규약(list⇒`{data,meta}`, single⇒bare, body-less mutation⇒`{success}`)과 **예외 목록**(roles, permissions, service-categories, clients/[id] GET).

**검증:** `pnpm type-check`(3-3 의 주 게이트) → `pnpm lint` → `pnpm test:coverage` → `pnpm build` → `pnpm test:e2e`.
**예상 정리:** 순감 ~200 LOC. 최대 산출물은 LOC 가 아니라 **`as any`/`: any` 33개 파일 → 대폭 감소, `user.service.ts` 27건(전체 1위) 해소**.
**위험도:** 중(3-1, 3-2). 3-2 는 테스트 선수정 없이는 절대 착수 금지.
**롤백:** 항목 단위 revert. 3-1 은 순수 함수 추출이라 revert 시 부작용 없음.

---

### Phase 4 — 테스트/도구 정리

**목표:** 파일 이름만 보고 무엇을 검증하는지 알 수 있게. **삭제 없음, 개명·재배치만.**

**4-1. `.coverage.test.ts` 접미사 제거 (형제 없는 6개 = 실제로는 primary)**

```
auth-wrapper.coverage.test.ts            → auth-wrapper.test.ts
service-registry.coverage.test.ts        → service-registry.test.ts
sr-notification.listener.coverage.test.ts→ sr-notification.listener.test.ts
client.actions.coverage.test.ts          → client.actions.test.ts
user.actions.coverage.test.ts            → user.actions.test.ts
schemas.coverage.test.ts                 → schemas.test.ts   ※ 기존 schemas.limits.test.ts 와 역할 분담 정리 후
client.service.coverage.test.ts          → client.service.queries.test.ts
permission.service.coverage.test.ts      → permission.service.roles.test.ts
audit.service.coverage.test.ts           → audit.service.test.ts   ┐ 이름 맞바꿈
audit.service.test.ts                    → audit-logging.integration.test.ts ┘ (후자는 실제로 Role/User 서비스 경유 통합 테스트)
user.service.coverage2.test.ts           → user.service.returns.test.ts
sr.service.extended.coverage.test.ts     → sr.service.branches.test.ts
sr.actions.integration.test.ts           → sr.actions.delegation.test.ts (DB 통합 아님, 목 기반 위임 검증)
```

어떤 워크플로·package.json 스크립트·stryker 설정도 이 파일명을 참조하지 않음(검증 완료) → 개명 안전.

**4-2. `.perf.test.ts` 접미사 정정** — 벽시계가 아니라 쿼리 횟수 회귀 가드다.

```
push.service.perf.test.ts        → push.service.query-count.test.ts
permission.service.perf.test.ts  → permission.service.query-count.test.ts
api/dashboard/stats/__tests__/route.perf.test.ts → route.query-count.test.ts
```

`sr.service.perf.test.ts` 는 **삭제 금지** — `:141` 의 `expect(domainEvents.emit).toHaveBeenCalledWith('sr:created', …)` 가 저장소 전체에서 유일한 단언이다. `it` 제목만 실제 단언에 맞게 고쳐 `sr.service.test.ts` 의 createSR describe 로 이관.

**4-3. UI 프리미티브 테스트 1컴포넌트=1파일 재배치** — 잡동사니 4개(`simple-components`, `additional-components`, `layout-components`, `form-components`, 총 ~380L)를 분해:
`badge.test.tsx`, `progress.test.tsx`, `skeleton.test.tsx`, `textarea.test.tsx`, `alert.test.tsx`, `table.test.tsx`, `tabs.test.tsx`, `checkbox.test.tsx`, `switch.test.tsx`, `select.test.tsx`, `radio-group.test.tsx`, `avatar.test.tsx`, `card.test.tsx`, `label.test.tsx`, `separator.test.tsx`. 중복 4쌍(Badge×2, Progress×2, Skeleton×2, Textarea×2)은 병합 시 강한 쪽 단언만 남긴다. `button/input/pagination/password-input/file-upload.test.tsx` 는 이미 규칙 준수 → 무변경.

**4-4. prisma mock 전략 확정(둘 중 하나 선택, 반드시 결정)**

- (A) `src/__tests__/mocks/prisma.ts`(mockDeep + mockReset, importer 0)를 정본으로 선언하고 서비스 테스트부터 점진 채택. `vitest-mock-extended` 는 이미 devDep 이고 `push.service.coverage.test.ts:2` 가 실사용 중.
- (B) 채택 의사가 없으면 파일 삭제. **지금처럼 "있는데 아무도 안 쓰는" 상태를 유지하지 않는다**(55개 테스트가 각자 763줄로 재선언 중).

**4-5. e2e 정리**

1. bare `test.skip()` **29곳**(`27-service-categories` 7, `25-my-requests-page` 6, `24-organization-page` 5, `26-settings-pages` 5, `28-sr-activities-history` 4, `17-multi-user-collaboration` 2)을 실제 단언으로. 요소가 없어야 정상이면 `await expect(el).toBeHidden()`, 있어야 정상이면 skip 제거해 실패하게 둔다. `17-multi-user-collaboration.spec.ts:525, :531` 은 미구현 플레이스홀더 → `test.fixme` 로 전환하거나 삭제. **파일 자체는 삭제 금지**(해당 화면의 유일 커버).
2. `e2e/capture-manual.spec.ts`(243L, 단언 없이 스크린샷 생성)를 `scripts/` 로 이동하고 `.spec.ts` 확장자 제거 → playwright 수집 대상에서 제외. **동시에 `ci-cd.yml:523`, `e2e.yml:155` 의 `--grep-invert "Dashboard Visual & Performance|Manual Screen Captures"` 문자열 갱신.**
3. `e2e/visual/dashboard.spec.ts` — 리눅스 스냅샷을 생성해 CI 에 편입하거나 삭제. 현재는 `*-win32.png` 뿐이라 로컬에서만 도는 죽은 게이트.
4. `playwright.config.ts:219/225/232` 의 firefox·webkit·Mobile Chrome 프로젝트 — `testIgnore` 를 맞춰 CI 에 넣거나 설정에서 제거(주석 `:210-217` 이 "켜면 항상 빨간불" 이라 기록).
5. `src/services/__tests__/sr.service.mutation.test.ts`(322L, sr.service.test.ts 와 광범위 중복) — **단독 판단**: `pnpm test:mutation` 을 삭제 전후로 돌려 mutation score 가 동일할 때만 삭제. `vitest.stryker.config.ts:80` 에 매칭되어 `ci-cd.yml:287` 게이트에 기여 중이므로 blind 삭제 금지.

**검증:** `pnpm test:coverage`(개명은 수치 불변이어야 함 — 변하면 include 글롭 확인), `pnpm test:e2e`, `pnpm check:e2e-assertions`.
**예상 정리:** 삭제 LOC ~0(중복 단언 병합분 ~80). **개명 15개 파일, 재배치 ~380L.**
**위험도:** 낮음. 4-5-1 은 skip 을 단언으로 바꾸면서 **숨어 있던 실패가 드러날 수 있음**(그것이 목적).
**롤백:** revert. 4-5-1 이 실패를 드러내면 revert 가 아니라 별도 버그 티켓으로 처리.

---

### Phase 5 — 재발 방지 (guardrails)

**목표:** Phase 0-4 가 지운 것이 6개월 뒤 다시 쌓이지 않게.

1. **knip 도입** (dead file/export/dependency 를 한 도구로)
   - `pnpm add -D knip`
   - `knip.json`: `entry` 에 Next 관례 진입점 전부 등록 — `src/app/**/{page,layout,loading,error,global-error,not-found,route,template,default}.tsx`, `src/app/**/route.ts`, `src/middleware.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `src/auth.ts`, `src/auth.config.ts`, `next.config.ts`, `prisma/**`, `src/**/*.stories.tsx`, `e2e/**`, `scripts/**`, `*.config.{ts,mjs}`.
   - `ignoreDependencies`: config-only 소비자(postcss/tailwind 플러그인, eslint 플러그인, storybook 애드온, `@types/*`, `cross-env`, `lint-staged`, `concurrently`, `@vitest/coverage-v8`, `@stryker-mutator/core`).
   - script: `"check:dead": "knip --max-issues 0"`. **처음에는 `--max-issues <현재값>` 으로 baseline 을 박고 `--max-warnings` 와 동일한 단조 감소 래칫 정책 적용.**
2. **ESLint 규칙 승격** (`eslint.config.mjs`)
   - `@typescript-eslint/no-unused-vars` 를 `{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }` 로 두되, **언더스코어 개명 자체를 리뷰 체크리스트 항목으로** 명시(이번 감사에서 `UserTable`/`UserDialog` 의 죽은 prop 4건이 정확히 이 패턴으로 숨어 있었다).
   - `import/no-cycle` 은 `eslint-plugin-import` 를 제거했으므로 대신 knip 의 순환 리포트 사용.
3. **`--max-warnings` 래칫 문서화** — `package.json:13` 위(또는 `ci-cd.yml:62`)에 `pnpm lint -f json` 규칙별 집계 상위 4개와 건수를 한 줄 주석으로. warn 8종은 `no-console`(:62), `no-unused-vars`(:64), `no-explicit-any`(:73), `security/detect-object-injection`(:97), `detect-non-literal-regexp`(:98), `detect-child-process`(:101), `detect-possible-timing-attacks`(:105), `detect-pseudoRandomBytes`(:106). `security/detect-object-injection` 이 대량 오탐이면 규칙을 끄는 편이 정직하다(`:122-123` 에 이미 부분 override 존재).
4. **e2e bare skip 검출** — 이미 존재하는 `scripts/check-e2e-assertions.ts`(`package.json:46 check:e2e-assertions`)에 "인자 없는 `test.skip()` 금지" 규칙 추가. 이것이 29곳 재발의 유일한 자동 방어선.
5. **CI 스텝 추가** (`.github/workflows/ci-cd.yml`, lint 스텝 바로 뒤)
   ```yaml
   - name: Dead code check
     run: pnpm check:dead
   - name: E2E assertion check
     run: pnpm check:e2e-assertions
   ```
6. **`.gitignore` / `.dockerignore` 동기화 규칙** — 새 생성물 패턴은 **양쪽에 동시 추가**(이번에 4MB 가 `.gitignore` 만 통과하고 `Dockerfile:31 COPY . .` 로 빌더 레이어에 구워진 원인). PR 템플릿에 체크박스 한 줄.
7. **감사 문서 수명** — `docs/PROJECT_AUDIT_2026-07-29.md`(312KB, docs/ 전체의 1/3)는 항목 소진 후 `docs/archive/` 로 이동. 이번 계획 문서도 완료 시 동일 처리.

**검증:** `pnpm check:dead` 가 baseline 에서 0 issue 로 통과, CI 전체 그린.
**예상 LOC:** 신규 설정 ~60L 추가(삭제 아님).
**위험도:** 낮음(단, knip baseline 을 0 으로 잡으면 CI 가 즉시 빨개짐 → 반드시 현재값으로 시작).
**롤백:** CI 스텝 2줄 제거.

---

## 4. 우선순위 표 — Top 20

| #   | 항목                                                               | 위치                                                                                                                 | 종류        | 삭제 LOC          | 위험    | 노력    | Phase |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------- | ------- | ------- | ----- |
| 1   | 실행되지 않는 유령 테스트                                          | `src/services/__tests__/sr.service.test.original.ts`                                                                 | dead-file   | 660               | 없음    | trivial | 1     |
| 2   | 루트 생성물 7개 + `.stryker-tmp` + 11.5MB 픽스처                   | 루트, `.stryker-tmp/`, `playwright/.test-files/`                                                                     | clutter     | 0 (≈16MB)         | 없음    | trivial | 0     |
| 3   | Storybook 스톡 스캐폴드                                            | `src/stories/` 전체                                                                                                  | clutter     | 867 (+757KB)      | 낮음¹   | trivial | 1     |
| 4   | 자기충족 가짜 통합/벤치 테스트                                     | `src/__tests__/integration/`, `src/__tests__/performance/benchmark.test.ts`                                          | test-bloat  | 562               | 없음    | trivial | 1     |
| 5   | DB 기반 권한 API 전체 사망                                         | `src/lib/permissions.ts` + 테스트 2개                                                                                | dead-file   | 365               | 없음    | trivial | 1     |
| 6   | 렌더링 안 되는 프로필 다이얼로그 + 액션 2개                        | `src/components/profile/ProfileDialog.tsx` 외                                                                        | dead-file   | 430               | 없음    | small   | 1     |
| 7   | 사용처 0인 CSS 클래스 47개(규칙 71블록)                            | `src/app/globals.css`                                                                                                | dead-branch | 294               | 낮음    | small   | 1     |
| 8   | 프로덕션 호출자 0인 서비스 메서드 17개                             | client/service-category/user/sr.service.ts                                                                           | dead-export | 320 (+테스트 300) | 낮음    | medium  | 1     |
| 9   | 호출자 0인 `'use server'` 액션 5개 (공격 표면)                     | `sr/user/client/role.actions.ts`                                                                                     | dead-export | 98 (+테스트 200)  | 낮음    | small   | 1     |
| 10  | 상위집합에 포섭된 primary 스위트 7개                               | `storage/logger/sr-state-machine/role.service/service-category.service/use-toast/api-helpers.test.ts`                | duplication | 640               | 낮음    | small   | 1     |
| 11  | PermissionService 죽은 메서드 6개 + 테스트                         | `src/services/permission.service.ts:99,153,164,191,211,218`                                                          | dead-export | 180 (+150)        | 낮음    | small   | 1     |
| 12  | 호출자 0인 REST RBAC 라우트 3개                                    | `api/roles/[id]/route.ts`, `api/roles/[id]/permissions/route.ts`, `api/roles/route.ts:27-42`                         | dead-file   | 190               | 낮음    | small   | 1     |
| 13  | 고아 설정 4개 + `.patch` + `manifest.json.bak`                     | `.eslintrc.{debug,minimal}.json`, `tsconfig.full.json`, `playwright.debug.config.ts`, `vitest.mutation.config.ts` 외 | dead-file   | 150               | 없음    | trivial | 0     |
| 14  | ESLint 팬텀 의존성 (CI lint 붕괴 위험)                             | `eslint.config.mjs:9` ↔ `package.json` 미선언                                                                        | tooling     | 3                 | **중²** | small   | 0     |
| 15  | 미사용 deps 5종                                                    | `recharts`, `@radix-ui/react-visually-hidden`, `msw`, `@storybook/nextjs`, `@storybook/addon-onboarding`             | tooling     | 5                 | 없음    | trivial | 0     |
| 16  | SR 상태 다이얼로그 4벌 통합                                        | `Complete/Hold/Reject/Reopen SRDialog.tsx` (621L)                                                                    | duplication | 450               | 중      | medium  | 2     |
| 17  | `user.service.ts` 테스트용 폴백 체인 21곳 + 가짜 사용자 생성 2블록 | `src/services/user.service.ts`                                                                                       | clutter     | 130               | 중³     | medium  | 1·3   |
| 18  | `updateSR` 399줄 god method 분해                                   | `src/services/sr.service.ts:266-664`                                                                                 | complexity  | 0 (재배치 330)    | 낮음    | medium  | 3     |
| 19  | `['ADMIN','MANAGER','ENGINEER']` 리터럴 31곳 + 이름 3개            | `policies.ts:13`, `user.service.ts:39`, `users/[id]/roles/route.ts:82` 외                                            | duplication | 45                | 낮음    | medium  | 2     |
| 20  | e2e bare `test.skip()` 29곳 (실패가 초록불로 보고됨)               | `e2e/24~28`, `17-multi-user-collaboration`                                                                           | dead-branch | 29                | **중⁴** | large   | 4     |

¹ 커버리지 분자 감소 → 같은 커밋에서 임계값 재측정 필수.
² 실행 순서 위반 시 `pnpm lint`(CI 필수 게이트) 즉시 module-not-found.
³ 테스트 mock 선수정 없이 착수하면 updateUser 계열 6개 즉사.
⁴ 숨어 있던 실패가 드러날 수 있음 — 이것이 목적이므로 revert 대신 버그 티켓.

---

## 5. 하지 말아야 할 것 (죽은 것처럼 보이지만 살아 있음)

**Next.js 관례 진입점 — importer 0이어도 절대 dead 아님**
`src/app/**/{page,layout,loading,error,global-error,not-found,template,default}.tsx`, 모든 `route.ts`, `src/middleware.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `src/auth.ts`, `src/auth.config.ts`, `next.config.ts`, `src/app/manifest.json/route.ts`, `prisma/` 이하 전부.

**구조적 이유로 나뉜 것 — 병합 금지**

- `src/lib/transaction-context.ts`(8L) — `prisma.ts:3` ↔ `domain-events.ts:4` ↔ `realtime-events.ts:3`. `prisma.ts:44,51` 이 **동적** import 를 쓰는 이유가 이 순환 차단이다. 병합하면 module-init 시점에 순환 복귀.
- `src/services/service-registry.ts` — 생성자 부수효과로 SR 알림 리스너를 등록하고 `instrumentation.ts:15` 가 이를 의도적으로 트리거. `setMockInstance` 는 `permission.actions.test.ts:17`, `role.actions.test.ts:49` 의 시임.

**테스트만이 소비자지만 그것이 유일한 계약 커버**

- `src/services/__tests__/sr.service.perf.test.ts:141` — `SRService.createSR` 이 `sr:created` 를 emit 한다는 **저장소 유일** 단언.
- `src/hooks/__tests__/use-permissions.test.ts:41` — 대소문자 무시 매칭 회귀 가드(`use-permissions.ts:10-12` 주석이 1년간 조용히 false 를 반환한 버그를 기록).
- `src/lib/__tests__/api-rate-limit.test.ts:107,154,182,209` — `withRateLimit` 의 `includeHeaders`/`keyGenerator`/`onRateLimitExceeded` 를 **실제로 전달**한다. 옵션 삭제·un-export 시 파손.
- `src/app/api/clients/[id]/__tests__/route.test.ts:108-127, :128-155` — PATCH/DELETE 교차 테넌트 차단의 **유일** 커버. 라우트 삭제 = 규칙 커버 삭제.
- `src/actions/__tests__/client.actions.{access,security,tenant}.test.ts` — 교차 테넌트 거부 유일 커버(단 `access.test.ts` 는 `getClientAction` 과 함께 사망하므로 §1-3 참조).
- `sr.service.update.coverage.test.ts:173` — **실제** state machine 의 required-field 규칙을 타는 유일 테스트(`sr.service.coverage.test.ts:104` 는 state machine 을 mock 하므로 대체 불가).
- `user.service.coverage2.test.ts` 의 `result.password).toBeUndefined()` 7건 — password stripping 계약의 유일 커버.

**UI 호출자가 없어도 살아 있는 라우트**

- `GET /api/permissions` — `e2e/roles/manager.spec.ts:240-257` 이 MANAGER 403 을 단언. `role.service.ts:170`, `role.service.escalation.test.ts:13` 이 이 엔드포인트를 escalation vector 로 명시.
- `POST /api/srs`, `DELETE /api/srs/[id]` — `e2e/helpers/test-helpers.ts:277-320` 픽스처 + `api/srs/__tests__/route.{test,security.test}.ts`.
- `PATCH /api/clients/[id]` — **UI 호출자 있음**: `organization/page.tsx:126-130` 의 활성/비활성 토글.
- `PATCH /api/srs/[id]`, `GET /api/srs/[id]` — `e2e/sr-permissions.spec.ts:235-270` 인가 음성 테스트.

**config-only / 간접 소비**

- 연결 확인된 테스트 설정 6종: `vitest.config.ts`, `vitest.setup.ts`, `vitest.integration.setup.ts`, `vitest.stryker.config.ts`, `stryker.config.mjs`, `playwright.config.ts` + `vitest.shims.d.ts`(tsconfig `**/*.ts` 로 흡수, `vitest.config.ts:6` 의 타입 지원).
- `.gemini/rules/{be,db,fe}-rules.md` — `GEMINI.md:3` 이 명시 참조. `.claude/settings.json` — 실동작 권한 설정. `scripts/{backup,restore,restore-rehearsal,setup-letsencrypt,renew-letsencrypt}.sh` — CI 가 scp 로 배포.
- `scripts/generate-dummy-hash.ts` — `src/lib/security.ts:8 DUMMY_HASH`(타이밍 공격 방어 상수)의 유일한 출처 기록. 삭제한다면 **cost 12 로 정정한 주석을 `security.ts:8` 로 이관**(현재 스크립트는 cost 10 을 쓰는데 상수와 `security.test.ts:16` 은 12 요구 — 이미 드리프트).
- `rateLimiters.middleware` — `src/proxy.ts:12` 사용. `getAppUrl`(`app-url.ts:42`), `toPlainObject`/`PlainObject`(`utils.ts:52,58,87` → `(dashboard)/layout.tsx:4,13`), `stopNotificationDispatcher`(instrumentation.ts:19-20 인터벌 teardown) — 전부 라이브.
- shadcn 프리미티브의 미사용 하위 export(`DialogTrigger`, `ContextMenu*`, `DropdownMenu*`, `TableCaption`, `badgeVariants`, `useFormField` 등) — upstream 동일성 유지가 `npx shadcn add/diff` 의 전제. 제거 금지.
- `public/favicon.ico`, `public/icons/icon-{192,512}.png` — 바이트 동일한 단일 JPEG 3벌이고 확장자·해상도가 전부 거짓이지만, **세 경로 모두 라이브 참조**(`layout.tsx:14-15`, `manifest.json/route.ts:32,38`). 이번 정비에서는 이슈 등록만, 삭제·재생성 금지.
- `src/components/dashboard/StatsCardSkeleton.tsx` — `DashboardSkeleton.tsx:1,10-13` 이 4회 렌더. `StatsCard` 를 지워도 이것과 그 스토리는 남긴다.
- `src/app/api/api-error-handler.ts`(정확히는 `src/lib/api-error-handler.ts`) — 6개 라우트 테스트가 **모듈 경로로 vi.mock** 하고 2개 전용 스위트가 import. 이동·통합 금지(`api-error-handler.leak.test.ts` 는 프로덕션 메시지 redaction 의 유일 가드).
- `src/lib/constants/sr.ts` 의 `statusLabels`/`priorityLabels` — 6개 파일이 import. 색상 맵 2개만 죽었다.
- `src/types/user.ts` — 삭제 금지(개명 대상). `UsersClient.tsx` 는 `'use client'` + HTTP fetch 라 서버 서비스 반환 타입을 소비할 수 없고, `userType` 은 Prisma 컬럼이 아니라 `user.service.ts:251` 계산값이다.
- `e2e/24~28` 스펙 — bare skip 이 많지만 해당 화면(조직도·내 요청·설정·서비스 카테고리·활동 이력)의 유일 커버. **skip 을 고칠 일이지 파일을 지울 일이 아니다.**

**동작이 바뀌므로 이번 범위 밖 (별도 티켓)**
`dashboard/page.tsx:177-184` D-day 산식 통일 / `profile/password` 라우트의 서비스 위임(401→400, 감사로그 복구) / `profile/route.ts` 스키마 파생(아바타 지우기 파손) / `roles` 응답 봉투 `{data,meta}` 전환 / `srs/page.tsx` zod 검증 도입 / `users/[id]/page.tsx` 사용자 유형 라벨 정본 결정 / `getSRScopeFilter` 를 dashboard·reports 에 확대(ENGINEER 가시 범위 변경) / `users/[id]/roles/route.ts:82-138` 상호배타 응답 형태.

---

## 6. 재발 방지 장치 (구체 설정)

| 도구                         | 패키지                                                | 설정 파일                                                                                                                                                                  | npm script                                     | CI 스텝                                                                                      |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| dead file/export/dep 검출    | `knip` (devDep)                                       | `knip.json` — `entry` 에 Next 관례 진입점 + `prisma/**` + `e2e/**` + `scripts/**` + `*.config.{ts,mjs}`, `ignoreDependencies` 에 config-only 소비자                        | `"check:dead": "knip --max-issues <baseline>"` | `ci-cd.yml` lint 스텝 뒤 `run: pnpm check:dead`                                              |
| React Hooks 규칙 (팬텀 해소) | `eslint-plugin-react-hooks@7` (devDep, **명시 선언**) | `eslint.config.mjs:9,45,59-60`(기존 그대로)                                                                                                                                | 기존 `lint`                                    | 기존 `ci-cd.yml:67`                                                                          |
| 경고 부채 래칫               | (기존)                                                | `package.json:13` `--max-warnings 1056` — **내리기만**, 구성 내역 주석 1줄 추가                                                                                            | 기존 `lint`                                    | 기존 `ci-cd.yml:62-67`                                                                       |
| e2e bare skip 금지           | (기존 스크립트 확장)                                  | `scripts/check-e2e-assertions.ts` 에 `/test\.skip\(\s*\)/` 검출 추가                                                                                                       | 기존 `check:e2e-assertions`(package.json:46)   | `e2e.yml` 에 `run: pnpm check:e2e-assertions` 추가                                           |
| 커버리지 래칫                | (기존)                                                | `vitest.config.ts:99-103` — 삭제 커밋마다 재측정                                                                                                                           | 기존 `test:coverage`                           | 기존 `ci-cd.yml:188`                                                                         |
| mutation 게이트              | (기존)                                                | `stryker.config.mjs` → `vitest.stryker.config.ts`                                                                                                                          | 기존 `test:mutation:ci`                        | 기존 `ci-cd.yml:287`                                                                         |
| 빌드 컨텍스트 오염 방지      | —                                                     | `.dockerignore` 에 `*.tar.gz`, `*.tsbuildinfo`, `coverage_summary*.txt`, `actions_runs.json`, `output.css`, `vitest.stryker.config.ts`, `vitest.integration.setup.ts` 추가 | —                                              | PR 템플릿 체크박스: "새 생성물 패턴을 `.gitignore` **와** `.dockerignore` 양쪽에 추가했는가" |
| 잔여물 재발 차단             | —                                                     | `.gitignore` 에 `*.bak`, `*.orig`, `*.original.*`, `playwright/.test-files/`, `.jules/` 추가 / `:22 .vercelignore` 죽은 규칙 삭제                                          | —                                              | —                                                                                            |

**knip baseline 운용 규칙**: 도입 시점의 issue 수를 `--max-issues` 에 박고, `--max-warnings` 와 동일하게 **숫자를 올려 통과시키는 것을 금지**한다. PR 마다 내려가거나 유지되어야 한다.

---

## 7. 예상 효과

| 지표                      | 값                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 삭제 LOC (소스)           | **~2,400** (dead 2,100 + globals.css 294)                                                                                                                                                |
| 삭제 LOC (테스트)         | **~4,300** (유령 660 + 자기충족 562 + 중복 스위트 ~3,100)                                                                                                                                |
| 정리 LOC (중복 통합 순감) | **~820** (Phase 2 620 + Phase 3 200)                                                                                                                                                     |
| **총 감소**               | **≈ 7,500 LOC** (src ~67k 대비 **약 11%**)                                                                                                                                               |
| 삭제 파일                 | **~45개** (소스 6 + 테스트 20 + 설정 5 + 문서 1 + `src/stories/` 10 + 잔여물 5)                                                                                                          |
| 삭제 아티팩트             | **≈ 16MB** (루트 4.0MB + `.stryker-tmp` 2.1MB + test-results 537KB + 커밋 픽스처 11.5MB + stories assets 757KB)                                                                          |
| 제거 의존성               | **6개** — `recharts`, `@radix-ui/react-visually-hidden`, `msw`, `@storybook/nextjs`, `@storybook/addon-onboarding`, `eslint-plugin-import` (+ `eslint-plugin-react-hooks` **추가** 선언) |
| 제거 npm script           | 4개 (39 → 35)                                                                                                                                                                            |
| 축소 공개 표면            | `'use server'` 액션 **7개** 제거(RPC 엔드포인트), REST 라우트 **5개** 제거                                                                                                               |

**유지보수자 관점에서 쉬워지는 것**

1. **"이 권한 체크는 어디서 하나?"** — 지금은 3벌(hook / session flag / DB). DB 판이 사라지고 `hasAnyPermissionFlag`류 죽은 사본이 없어져 **hook(클라이언트) / `hasPermissionFlag`(서버) 2개**만 남는다.
2. **"Client 타입이 뭐냐?"** — 답이 12개에서 1개(`@/types`)로. `User` 는 7개 → 뷰 타입 1개 + Prisma 1개(이름이 겹치지 않게 개명).
3. **"상태 라벨을 어디서 고치나?"** — 4벌 → `src/lib/constants/sr.ts` 1곳(components 판은 재-export).
4. **"이 서비스 메서드 쓰이나?"** — `pnpm check:dead` 가 CI 에서 답한다. 지금은 17개가 테스트에만 부양되며 살아 있는 척했다.
5. **"이 SR 상태 다이얼로그 하나를 고치면 다른 3개도?"** — 4벌 621L → 설정 배열 1벌.
6. **`src/actions/` 를 열면 전부 action** — `sr-form.utils.ts` 이동으로 RPC 표면 감사가 파일 목록만으로 끝난다.
7. **CI 신호의 정직성** — 벽시계 flake 2건(`benchmark.test.ts` 20ms 임계값, `permissions.perf.test.ts` if/else 항상 통과)이 차단 경로에서 제거되고, e2e 의 bare skip 29곳이 실제 단언으로 바뀌어 **초록불이 초록불을 의미**하게 된다.
8. **빌드 캐시** — 매 이미지 빌드마다 builder 레이어에 구워지던 4MB 가 사라지고 GHA 빌드 캐시도 그만큼 가벼워진다.

---

**한 줄 요약:** dead code 2,400 LOC·중복 테스트 4,300 LOC·아티팩트 16MB·불필요 의존성 6개를 위험도 오름차순 6단계(Phase 0 잔여물 → 1 dead code → 2 중복 통합 → 3 가독성 → 4 테스트 정리 → 5 knip/CI 가드레일)로 제거하되, 동작을 바꾸는 항목은 전부 §5 에 분리해 별도 티켓으로 남기는 계획이다.
