# SR Management System

Service Request(SR) 관리 시스템 - 고객 요청을 효율적으로 접수, 처리, 추적하는 엔터프라이즈급 웹 애플리케이션

---

## 📋 주요 기능

- **SR 요청 관리**: 고객 서비스 요청 생성, 조회, 수정, 삭제
- **상태 추적**: 요청됨 → 접수 → 진행중 → 완료/취소 워크플로우
- **우선순위 관리**: 긴급, 높음, 보통, 낮음 우선순위 지정
- **사용자 역할**: ADMIN, MANAGER, ENGINEER, CLIENT_ADMIN, CLIENT_USER
- **실시간 알림**: 이메일 및 푸시 알림 지원
- **파일 첨부**: SR에 문서/이미지 첨부 가능
- **대시보드**: 통계 및 차트로 SR 현황 파악

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│                   (Next.js React 19)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Server Actions                            │
│              (src/actions/*.ts)                              │
│         - 인증/권한 검증 (Policy)                             │
│         - Result 타입 반환                                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   Service Layer                              │
│              (src/services/*.ts)                             │
│         - 비즈니스 로직                                       │
│         - Prisma DB 접근                                      │
│         - 트랜잭션 관리                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Database                                  │
│               (PostgreSQL + Prisma)                          │
└─────────────────────────────────────────────────────────────┘
```

### 핵심 설계 패턴
- **Service Layer Pattern**: 비즈니스 로직 캡슐화
- **Policy Pattern**: 권한 검증 분리 (`canCreateSR`, `ensureCanUpdate`)
- **Result Type**: 에러 처리 표준화 (`{ success, data, error }`)

---

## 🛠️ 기술 스택

| 분류 | 기술 | 버전 |
|---|---|---|
| **Frontend** | Next.js | 16.x |
| **UI** | React | 19.x |
| **Language** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 3.x |
| **Database** | PostgreSQL | - |
| **ORM** | Prisma | 6.x |
| **Auth** | NextAuth.js | 5.0-beta |
| **Validation** | Zod | 4.x |
| **Cache** | Upstash Redis | - |
| **Storage** | Vercel Blob | - |
| **Email** | Resend | - |
| **Testing** | Vitest, Playwright | - |
| **Deploy** | Vercel | - |

---

## 📁 프로젝트 구조

```
src/
├── actions/           # Server Actions (클라이언트-서버 통신)
├── app/
│   ├── (auth)/        # 인증 페이지 (로그인)
│   ├── (dashboard)/   # 대시보드 페이지
│   └── api/           # REST API Routes
├── components/        # React UI 컴포넌트
│   ├── srs/           # SR 관련 컴포넌트
│   ├── users/         # 사용자 관리 컴포넌트
│   └── ui/            # 공통 UI (Button, Input, Dialog 등)
├── hooks/             # 커스텀 React 훅
├── lib/               # 유틸리티 및 헬퍼
│   ├── policies.ts    # 권한 검증 함수
│   ├── errors.ts      # 커스텀 에러 클래스
│   └── schemas.ts     # Zod 검증 스키마
├── services/          # 비즈니스 로직 서비스
│   ├── sr.service.ts
│   ├── user.service.ts
│   └── client.service.ts
└── types/             # TypeScript 타입 정의
```

---

## 🚀 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
```

**필수 환경 변수**:
- `DATABASE_URL` - PostgreSQL 연결 URL
- `NEXTAUTH_SECRET` - 세션 암호화 키 (32자 이상)
- `NEXTAUTH_URL` - 애플리케이션 URL
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob 토큰

### 3. 데이터베이스 설정

```bash
pnpm prisma migrate dev   # 마이그레이션
pnpm db:seed              # 초기 데이터 시드
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인

---

## 🧪 테스트

### 단위 테스트 (Vitest)
```bash
pnpm test              # 테스트 실행
pnpm test:coverage     # 커버리지 리포트
```

### E2E 테스트 (Playwright)
```bash
pnpm test:e2e          # 전체 E2E 테스트
pnpm test:e2e:ui       # UI 모드 (디버깅)
```

**현재 커버리지**: ~78% (핵심 서비스 90%+)

---

## 📡 API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/srs` | SR 목록 조회 (페이징, 필터) |
| `POST` | `/api/srs` | SR 생성 |
| `GET` | `/api/srs/[id]` | SR 상세 조회 |
| `PATCH` | `/api/srs/[id]` | SR 수정 |
| `DELETE` | `/api/srs/[id]` | SR 삭제 |
| `GET` | `/api/users` | 사용자 목록 |
| `POST` | `/api/users` | 사용자 생성 |
| `GET` | `/api/clients` | 고객사 목록 |
| `GET` | `/api/dashboard/stats` | 대시보드 통계 |

---

## 📜 스크립트

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 실행 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint 검사 |
| `pnpm type-check` | TypeScript 타입 체크 |
| `pnpm test` | 단위 테스트 |
| `pnpm test:e2e` | E2E 테스트 |

---

## 📖 관련 문서

- [PRD](./docs/SR_Management_System_PRD.md) - 요구사항 정의
- [TRD](./docs/TRD.md) - 기술 명세
- [LLD](./docs/LLD.md) - 상세 설계
- [DB](./docs/DB.md) - 데이터베이스 스키마

---

## 📄 라이선스

Private

