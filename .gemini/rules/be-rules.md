# ⚙️ 기술 규칙: 백엔드 (be-rules.md)

본 문서는 백엔드 레이어(Next.js Server Actions, API Routes, NextAuth, Node.js)와 관련된 기술 헌법 및 보안 가이드이다.

---

## 1. Next.js Server Actions 및 API 아키텍처

- **Server-Only 로직 강제**: 백엔드에서만 사용되어야 하는 로직이나 모듈은 파일 최상단에 `"use server"` 또는 `import 'server-only'`를 선언하여 클라이언트 측으로 노출되는 것을 컴파일 타임에 차단한다.

  **두 수단은 동등하다.** `src/actions/` 의 Server Action 파일들은 `'use server'` 로 이미
  경계가 서 있으므로 `server-only` 선언 대상이 아니다 — 그 경계가 전파를 끊는다.

  **선언 대상** (서버 자원을 직접 다루는 모듈):
  `src/lib/prisma.ts`, `src/auth.ts`, `src/lib/storage.ts`, `src/lib/env-validation.ts`,
  `src/lib/policies.ts`, `src/lib/security.ts`, `src/lib/cache.ts`, `src/lib/domain-events.ts`,
  `src/lib/action-helpers.ts`, `src/lib/auth-wrapper.ts`, `src/services/*.service.ts`.

  **선언 금지** (선언하면 깨지는 것들 — 실측 확인):
  - 클라이언트 번들에 정당하게 포함되는 모듈(`src/lib/utils.ts`, `src/lib/api-client.ts`,
    `src/lib/query-keys.ts`, `src/lib/constants/*`, `src/types/*` 등)
  - **`tsx` 스크립트가 직접 실행하는 모듈**: `src/lib/file-validator.ts`, `src/lib/serialization.ts`
  - **Playwright 가 plain Node 로 로드하는 모듈**: `src/lib/sr-state-machine.ts`
    (e2e 스펙이 전이표를 import 해 기대값을 만든다)

  **왜 금지 목록이 필요한가**: `server-only` 패키지는 `react-server` 조건이 없는 환경에서
  **import 즉시 throw** 한다(`node -e "require('server-only')"` 로 실측). vitest 는
  `vitest.config.ts` 의 alias 와 `vitest.setup.node.ts` 의 mock 으로 이중 보호되지만
  **Playwright 와 tsx 스크립트에는 그 보호가 없다.** 목록 없이 "전부 선언" 하면
  e2e 와 스크립트가 파일 수집 단계에서 즉사한다.

  **현재 상태(2026-08-15 실측)**: 클라이언트 번들로의 실제 누출은 **0건**이다.
  이 선언은 지금 있는 사고를 막는 것이 아니라 **회귀를 컴파일 타임에 잡기 위한 것**이다.

- **예외 처리 구조화**: API 및 Server Actions 내에서 발생하는 모든 예외는 적절한 HTTP 상태 코드 및 비즈니스 에러 메시지 객체 형태로 가공하여 반환한다. 호출처에서 에러의 Root Cause를 알기 쉽도록 구조적인 에러 객체를 리턴한다.
- **성능 로깅**: 처리 소요 시간 계측은 **개별 라우트가 아니라 공용 래퍼**(`src/lib/auth-wrapper.ts`의 `withAuth`/`withErrorHandler`)에서 일괄 수행하며, 래퍼는 응답 직후 `logger.logRequest(method, path, status, duration)`를 호출한다. **모든 API 라우트와 Server Action은 이 래퍼를 경유해야 하며 예외를 두지 않는다.** 프로덕션 로그 잡음을 줄이기 위해 임계값(기본 500ms)을 넘는 요청만 `warn` 레벨로 승격한다.
  <sub>정정(2026-08-15): 이 조항은 "모든 라우트가 각자 Pino 로 소요 시간을 로깅한다" 였으나 38개 라우트 전부에서 미준수였고, 프로덕션 로거가 `info` 를 버리므로 라우트마다 로그를 붙여도 2xx 는 사라진다 — 현행 형태로는 **달성 자체가 불가능한 규칙**이었다. 래퍼 일괄 계측으로 바꾸면 한 곳 수정으로 전 라우트가 준수 상태가 된다.</sub>

---

## 2. 보안 및 인증/인가 (Authentication & Authorization)

- **NextAuth 세션 검증**: 사용자 요청을 처리하는 모든 백엔드 엔드포인트는 호출 즉시 NextAuth의 세션 정보를 조회하여 유효한 토큰 및 로그인 세션을 가졌는지 검증해야 한다.
- **세분화된 권한 검사 (RBAC)**: 세션 검증을 통과한 후, 사용자의 역할이 해당 액션을 수행할 자격이 있는지 확인하는 인가 로직을 반드시 비즈니스 코드 최상단에 추가한다. **역할 정의의 정본은 `GEMINI.md` §1.1과 `prisma/seed.ts`의 역할 시드이며, 본 문서는 역할 이름을 복제하지 않는다.**
  <sub>정정(2026-08-15): 이 조항은 `SYSTEM_ADMIN`·`DEVELOPER` 라는 존재하지 않는 역할명을 열거하고 `MANAGER` 를 누락한 채 2개월간 방치되어 있었다. 이름을 복제하지 않는 것이 재드리프트를 막는 유일한 방법이다.</sub>
- **인가 규칙의 단일 지점**: 인가 판정의 정본은 `src/lib/policies.ts`의 `ensure*`·`can*` 함수다. API 라우트와 Server Action은 이 정책 함수를 **호출**할 뿐, 역할 문자열 비교를 자체적으로 복제하지 않는다.
- **권한 문자열은 카탈로그에만 존재한다**: 코드가 검사하는 모든 `resource:action` 문자열은 `prisma/permission-catalog.ts`에 행이 있어야 한다. 카탈로그에 없는 문자열은 운영자가 부여할 수 없으므로 영구히 거부되는 죽은 통제가 된다.
- **데이터 범위 검사**: 자신이 생성했거나 자신이 소속된 고객사(`clientId`)가 아닌 리소스에 접근하여 수정을 시도하는 불법 요청을 탐지하고 즉시 차단(Forbidden)한다. **스코프 인자를 생략하면 전체가 반환되는 조회 함수를 만들지 않는다** — 스코프는 선택 인자가 아니라 필수 인자여야 한다.

---

## 3. Zod 기반 데이터 유효성 검증

- **스키마 검증 강제**: 백엔드로 인입되는 모든 파라미터 및 Request Body는 사전에 정의된 `Zod` 스키마([package.json:zod](file:///d:/project/sr/package.json))를 통해 `.parse()` 혹은 `.safeParse()` 검증을 거친 후 비즈니스 로직에 투입되어야 한다.
- **타입 바인딩**: Zod 스키마로부터 `z.infer<typeof schema>`를 추출해 TypeScript의 정적 타입으로 바인딩하여 런타임 값의 정합성과 컴파일 타임의 타입 안전성을 동시에 확보한다.

---

## 4. 알림 발송 및 연동 정책

> **매터모스트 연동은 폐기되었다**(마이그레이션 `20260730000000_drop_mattermost`로 enum 값과 컬럼까지 제거, `src/` 전역 참조 0건). 재도입을 전제한 규칙을 새로 쓰지 않는다. 알림 채널은 **이메일**과 **웹 푸시** 둘뿐이다(`GEMINI.md` §4).

- **비동기 처리**: 이메일·웹 푸시 발송은 API 메인 스레드를 블로킹하지 않도록 `src/lib/wait-until.ts`의 `backgroundTask` 헬퍼로 비차단 실행한다. 요청 응답이 발송 결과를 기다려서는 안 된다.
- **아웃박스 원칙(이메일)**: 알림은 도메인 트랜잭션 **안에서** `notifications` 테이블에 `PENDING`으로 적재한다. 발송은 별도 디스패처가 `FOR UPDATE SKIP LOCKED`로 claim해 수행하며, **임대(lease) 시간은 한 배치의 최악 처리 시간보다 길게 유지한다** — 짧으면 단일 인스턴스에서도 후속 tick이 같은 행을 다시 집어 중복 발송된다. 실패는 지수 백오프로 재시도하고 상한 도달 시 `FAILED` dead-letter로 고정한다.
  - **재시도 상한과 백오프 간격의 정본은 `src/services/notification-outbox.ts`의 `MAX_ATTEMPTS`·`BACKOFF_MINUTES` 상수이며, 본 문서는 숫자를 복제하지 않는다.**
  - 주기 실행 tick에는 재진입 가드를 둔다. 이전 배치가 끝나기 전에 다음 tick이 겹치면 안 된다.
- **웹 푸시의 예외**: 웹 푸시는 **최선 노력(best-effort) 채널**이다. 재시도·dead-letter를 적용하지 않으며, 실패는 구독 단위로 격리하고 만료 응답(410/404)을 받은 구독만 정리한다. 푸시를 아웃박스로 편입하려면 `notifications`에 `type='PUSH'` 행을 적재하고 디스패처 claim 조건을 함께 넓힌다.
- **실패를 삼키지 않는다**: 발송 함수는 실패 시 예외를 던진다. `Promise.allSettled`로 감싸 항상 fulfilled로 만들면 실패 경로가 코드상 존재하지 않는 것과 같아지고, 디스패처가 `failReason`을 기록할 수 없다.

---

## 5. 비밀번호 및 환경변수 보호

- **비밀번호 해싱**: 사용자 비밀번호는 데이터베이스 저장 전 반드시 [bcryptjs](file:///d:/project/sr/package.json)와 같은 강력한 암호화 알고리즘을 사용해 해싱하여 보관한다. 단방향 해싱되지 않은 원본 패스워드는 어떠한 변수나 로그에도 저장되지 않는다.
- **비밀 값 환경변수화**: API Key, JWT Secret Key, DB Connection String 등의 비밀 값은 절대로 코드에 하드코딩해서는 안 되며, 반드시 `.env` 파일로 로컬 개발 시 관리하고 배포 시점에 환경변수에서 주입받아 사용해야 한다.
