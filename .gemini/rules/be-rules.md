# ⚙️ 기술 규칙: 백엔드 (be-rules.md)

본 문서는 백엔드 레이어(Next.js Server Actions, API Routes, NextAuth, Node.js)와 관련된 기술 헌법 및 보안 가이드이다.

---

## 1. Next.js Server Actions 및 API 아키텍처

- **Server-Only 로직 강제**: 백엔드에서만 사용되어야 하는 로직이나 모듈은 파일 최상단에 `"use server"` 또는 `import 'server-only'`를 선언하여 클라이언트 측으로 노출되는 것을 컴파일 타임에 차단한다.
- **예외 처리 구조화**: API 및 Server Actions 내에서 발생하는 모든 예외는 적절한 HTTP 상태 코드 및 비즈니스 에러 메시지 객체 형태로 가공하여 반환한다. 호출처에서 에러의 Root Cause를 알기 쉽도록 구조적인 에러 객체를 리턴한다.
- **성능 로깅**: 모든 Server Actions와 API 엔드포인트는 처리 소요 시간을 모니터링하기 위해 Pino 등의 로거 라이브러리([package.json:pino](file:///d:/project/sr/package.json))를 활용해 실행 성능을 측정 및 로깅해야 한다.

---

## 2. 보안 및 인증/인가 (Authentication & Authorization)

- **NextAuth 세션 검증**: 사용자 요청을 처리하는 모든 백엔드 엔드포인트는 호출 즉시 NextAuth의 세션 정보를 조회하여 유효한 토큰 및 로그인 세션을 가졌는지 검증해야 한다.
- **세분화된 권한 검사 (RBAC)**: 세션 검증을 통과한 후, 사용자의 역할(`SYSTEM_ADMIN`, `CLIENT_ADMIN`, `DEVELOPER`, `CLIENT_USER`)이 해당 액션을 수행할 자격이 있는지 확인하는 인가 로직을 반드시 비즈니스 코드 최상단에 추가한다.
- **데이터 범위 검사**: 자신이 생성했거나 자신이 소속된 고객사(`clientId`)가 아닌 리소스에 접근하여 수정을 시도하는 불법 요청을 탐지하고 즉시 차단(Forbidden)한다.

---

## 3. Zod 기반 데이터 유효성 검증

- **스키마 검증 강제**: 백엔드로 인입되는 모든 파라미터 및 Request Body는 사전에 정의된 `Zod` 스키마([package.json:zod](file:///d:/project/sr/package.json))를 통해 `.parse()` 혹은 `.safeParse()` 검증을 거친 후 비즈니스 로직에 투입되어야 한다.
- **타입 바인딩**: Zod 스키마로부터 `z.infer<typeof schema>`를 추출해 TypeScript의 정적 타입으로 바인딩하여 런타임 값의 정합성과 컴파일 타임의 타입 안전성을 동시에 확보한다.

---

## 4. 알림 발송 및 연동 정책

- **비동기 처리**: 이메일이나 매터모스트 등의 알림 발송 로직은 API 메인 스레드를 블로킹하지 않도록 백그라운드 비차단 프로미스 실행기(예: `src/lib/wait-until.ts`에 구현된 `backgroundTask` 헬퍼 및 Vercel Serverless 환경을 고려한 `@vercel/functions`의 `waitUntil` 폴백)를 사용하여 비동기로 실행되어야 한다.
- **재시도 규칙**: 일시적인 네트워크 장애로 발송 실패 시, 즉시 파괴하지 않고 백오프(Exponential Backoff)를 적용한 자동 재시도(Retry) 정책(최대 3~4회)을 수행해야 한다.
- **폴백 메커니즘**: 매터모스트 Webhook 호출 실패 시, 시스템은 즉시 대체 채널(이메일 SMTP 발송)로 폴백하여 사용자에게 중요한 알림이 전달되지 못하는 상황을 방지한다.

---

## 5. 비밀번호 및 환경변수 보호

- **비밀번호 해싱**: 사용자 비밀번호는 데이터베이스 저장 전 반드시 [bcryptjs](file:///d:/project/sr/package.json)와 같은 강력한 암호화 알고리즘을 사용해 해싱하여 보관한다. 단방향 해싱되지 않은 원본 패스워드는 어떠한 변수나 로그에도 저장되지 않는다.
- **비밀 값 환경변수화**: API Key, JWT Secret Key, DB Connection String 등의 비밀 값은 절대로 코드에 하드코딩해서는 안 되며, 반드시 `.env` 파일로 로컬 개발 시 관리하고 배포 시점에 환경변수에서 주입받아 사용해야 한다.
