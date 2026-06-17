# Project Rules (Constitution) & Verification Harness Design Spec

## 1. 개요 (Overview)

본 문서는 프로젝트의 개발 위생 및 비즈니스 정합성을 극대화하기 위해 **프로젝트 헌법(Rules)**과 **검증 하네스(Verification Harness)**를 구축하기 위한 설계 명세서이다.
기술 스택(Next.js, Prisma, Vitest, Playwright 등)에 따른 기술 헌법은 **기술 KI**로 격리하여 관리하고, 비즈니스 도메인 규칙은 루트의 **`GEMINI.md` 헌법**에 작성하여 관리한다. 또한 에이전트와 개발자가 변경 사항을 확실하게 검증하고 "증거 기반 실행"을 만족할 수 있도록 통합 검증 하네스 스크립트를 구축한다.

---

## 2. 파일 및 디렉토리 구조 (File Structure)

```
d:\project\sr\
├── GEMINI.md                   # 헌법: 비즈니스 도메인 규칙 (PRD/docs 기반)
├── .gemini/
│   ├── tasks/                  # 기존 태스크 히스토리 보관
│   └── rules/                  # 기술 규칙 KI (Git 관리 및 에이전트 상시 참조)
│       ├── db-rules.md         # DB: Prisma 모델링, 마이그레이션 및 쿼리 성능 규칙
│       ├── fe-rules.md         # FE: Next.js App Router, Tailwind 및 WOW UI 프리미엄 스타일 가이드
│       └── be-rules.md         # BE: Server Actions/API, Auth 및 비동기 큐 연동 규칙
├── scripts/
│   └── run-verification.ps1    # 하네스: 로컬 통합 검증 스크립트 (PowerShell)
└── package.json                # "verify" 스크립트 연동
```

---

## 3. 컴포넌트별 명세 (Specification)

### 3.1. 루트 헌법 (`GEMINI.md`)

프로젝트 고유의 비즈니스 룰 및 프로세스 요구사항을 정의한다.

- **사용자 역할 및 권한 (RBAC)**:
  - `SYSTEM_ADMIN`: 전체 시스템 설정 및 모든 리소스 CRUD
  - `CLIENT_ADMIN`: 본인 고객사 내 사용자 및 SR 관리 (삭제 제외)
  - `DEVELOPER`: 자신에게 할당된 SR 접수, 처리, 댓글 작성, 상태 변경
  - `CLIENT_USER`: 본인 고객사의 SR 신청 및 본인이 신청한 SR 조회/댓글 작성
- **SR 라이프사이클 흐름 규칙**:
  - 상태 전이 경로: `신청` -> `접수` -> `진행중` -> `완료` -> `확인완료`
  - 거절(`REJECTED`) 상태로 변경 시 **거절 사유**(`rejectedReason` 또는 관련 필드) 기입 필수.
  - 완료(`COMPLETED`) 상태로 변경 시 **완료 내용**(`completionNotes` 또는 관련 필드) 기입 필수.
  - 재오픈(`REOPENED`): 완료 후 7일 이내에만 1회 오픈 가능.
- **SLA 및 우선순위**:
  - 긴급(Critical): 1시간 내 접수, 4시간 내 완료
  - 높음(High): 2시간 내 접수, 24시간 내 완료
  - 중간(Medium): 24시간 내 접수, 48시간 내 완료
  - 낮음(Low): 48시간 내 접수, 1주일 내 완료
- **자동 알림 연동**:
  - SR 신청 시 담당자 알림, 담당자 배정 시 새 담당자 알림, 완료 시 신청자 알림이 비동기적으로(이메일, 매터모스트 채널) 유발되어야 함.

### 3.2. 기술 KI 규칙 (`.gemini/rules/`)

에이전트가 코드를 수정하고 설계할 때 참조할 기술 규칙 모음.

- **`db-rules.md`**:
  - Prisma Schema 변경 시 반드시 `npx prisma migrate dev`를 수행하고 마이그레이션 파일을 Git에 포함할 것.
  - 임의의 테이블 데이터 직접 삭제 금지. 논리적 삭제(Soft Delete) 속성(`/deletedAt/` 등)이 제공되는 경우 논리적 삭제 적용.
  - 외래키 연쇄 삭제(`onDelete: Cascade`)로 인한 의도치 않은 데이터 삭제를 방지하고 관계 무결성 보장.
- **`fe-rules.md`**:
  - Next.js App Router (16.x) 기준의 Server/Client Component 구분 준수.
  - Tailwind CSS 조합 시 `tailwind-merge` (`cn` 유틸리티) 필수 적용.
  - Storybook 컴포넌트 추가 시 비주얼 테스트 준수.
  - 프리미엄 WOW UI 디자인 철학 적용: HSL 기반 조화로운 컬러칩 사용, 글래스모피즘(glassmorphism), 부드러운 그라데이션, 적절한 마이크로 애니메이션 제공.
- **`be-rules.md`**:
  - NextAuth JWT 세션 및 어드민/개발자/고객사별 API 권한 필터링 검증 철저.
  - API Routes 및 Server Actions 호출 시 입력값 검증을 위해 `Zod` 스키마 필수 적용.
  - 알림 발송 실패 시 재시도(Retry) 및 폴백(Fallback: Mattermost 실패 시 이메일로 전환) 로직 유지.

### 3.3. 검증 하네스 스크립트 (`scripts/run-verification.ps1`)

Windows Powershell 환경에서 구동 가능한 원클릭 통합 검증 하네스를 작성한다.

- **수행 단계**:
  1. **Prisma Client Generate**: 최신 스키마가 로컬에 적용되었는지 빌드 전 생성 (`pnpm prisma generate`)
  2. **Type Checking**: TypeScript 컴파일 검증 (`pnpm type-check`)
  3. **Linting**: ESLint 정적 분석 (`pnpm lint`)
  4. **Formatting Check**: Prettier 포맷 확인 (`pnpm format:check`)
  5. **Unit & Integration Testing**: Vitest를 통한 유닛/통합 테스트 실행 (`pnpm test` 또는 `vitest run`)
  6. **E2E Testing**: Playwright를 통한 엔드투엔드 테스트 실행 (`pnpm test:e2e`)
- **결과 출력**: 각 단계별 성공/실패 여부를 색상이 들어간 콘솔로 출력하고, 실패 시 즉시 중단 및 오류 로그 표시.
- **package.json 연동**: `"verify": "powershell -ExecutionPolicy Bypass -File ./scripts/run-verification.ps1"` 스크립트 추가.

---

## 4. 검증 계획 (Verification Plan)

### 4.1. 자동화 테스트

- 통합 하네스 실행(`pnpm verify`)을 통해 모든 빌드, 린트, 테스트가 정상 통과하는지 확인.

### 4.2. 수동 검증

- 에이전트가 코드를 임의로 망가뜨렸을 때(예: 타입 에러 유발, 테스트 실패 코드 작성) 하네스가 이를 감지하고 빌드를 중단하는지 여부 확인.
