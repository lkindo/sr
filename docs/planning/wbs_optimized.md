# SR 관리 시스템 WBS (AI 개발자 최적화 버전)

**문서 버전:** 2.0
**작성일:** 2025-11-07
**최적화 목표:** AI 개발자(Claude Code)가 효율적으로 작업할 수 있도록 설계
**전체 예상 기간:** 6-8주

---

## 📋 WBS 최적화 원칙

### 1. **검증 가능한 단위 작업**

- 각 작업은 독립적으로 테스트 및 검증 가능
- 작업 완료 시 즉시 실행/확인 가능한 산출물 생성

### 2. **의존성 최소화**

- 병렬 작업 가능한 항목을 명확히 구분
- Critical Path 식별 및 우선 처리

### 3. **점진적 통합**

- 각 Phase 완료 시 통합 및 동작 확인
- 조기 문제 발견 및 수정

### 4. **자동화 우선**

- 반복 작업은 스크립트화
- 테스트, 린트, 빌드 자동화

---

## 🎯 Phase 0: 프로젝트 초기화 및 인프라 설정 (1주)

> **목표**: 개발 환경 완전 구축, 첫 페이지 배포
> **완료 기준**: localhost와 Vercel에서 "Hello World" 실행

### 0.1 로컬 개발 환경 구축 (1일)

**우선순위: P0 (Critical)**

- [ ] **INIT-0.1.1**: Next.js 14 프로젝트 생성
  - `npx create-next-app@latest` 실행
  - TypeScript, ESLint, Tailwind CSS 설정
  - App Router 선택
  - 예상 시간: 30분

- [ ] **INIT-0.1.2**: 프로젝트 구조 생성

  ```
  src/
  ├── app/
  ├── components/
  ├── lib/
  ├── types/
  └── utils/
  ```

  - 예상 시간: 15분

- [ ] **INIT-0.1.3**: 개발 도구 설정
  - ESLint 규칙 추가 (Next.js recommended)
  - Prettier 설정
  - `.vscode/settings.json` 추가
  - 예상 시간: 30분

- [ ] **INIT-0.1.4**: Git 초기화 및 첫 커밋
  - `.gitignore` 설정
  - README.md 작성
  - 초기 커밋
  - 예상 시간: 15분

**산출물**: 실행 가능한 Next.js 프로젝트 (`pnpm dev` 동작)

---

### 0.2 데이터베이스 설정 (1일)

**우선순위: P0 (Critical)**

- [ ] **DB-0.2.1**: Supabase 프로젝트 생성
  - Supabase 계정 생성
  - 새 프로젝트 생성 (PostgreSQL 15)
  - Connection String 확보 (Pooler, Direct)
  - 예상 시간: 20분

- [ ] **DB-0.2.2**: Prisma 초기화
  - `npm install prisma @prisma/client`
  - `npx prisma init`
  - `.env` 파일에 DATABASE_URL 설정
  - 예상 시간: 15분

- [ ] **DB-0.2.3**: 기본 스키마 정의 (User, Client만)
  - `prisma/schema.prisma` 작성
  - User, Client 모델만 우선 정의
  - 예상 시간: 45분

- [ ] **DB-0.2.4**: 첫 마이그레이션 실행
  - `npx prisma migrate dev --name init`
  - Prisma Studio로 확인 (`npx prisma studio`)
  - 예상 시간: 15분

- [ ] **DB-0.2.5**: Prisma Client 설정
  - `src/lib/prisma.ts` 생성 (Singleton 패턴)
  - HMR 대응 설정
  - 예상 시간: 20분

**산출물**: Supabase PostgreSQL 연결 완료, User/Client 테이블 생성

---

### 0.3 외부 서비스 설정 (1일)

**우선순위: P0 (Critical)**

- [ ] **SVC-0.3.1**: Vercel 프로젝트 생성
  - GitHub 저장소 연결
  - 환경 변수 설정 (DATABASE_URL, DIRECT_URL)
  - 첫 배포 (main 브랜치)
  - 예상 시간: 30분

- [ ] **SVC-0.3.2**: Vercel Blob 설정
  - Vercel Blob Storage 활성화
  - `BLOB_READ_WRITE_TOKEN` 환경 변수 추가
  - 예상 시간: 15분

- [ ] **SVC-0.3.3**: Upstash Redis 설정
  - Upstash 계정 생성
  - Redis 데이터베이스 생성
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 환경 변수
  - 예상 시간: 20분

- [ ] **SVC-0.3.4**: Resend 설정
  - Resend 계정 생성
  - API 키 발급
  - 도메인 인증 (선택적, 테스트용은 불필요)
  - `RESEND_API_KEY` 환경 변수
  - 예상 시간: 20분

- [ ] **SVC-0.3.5**: 환경 변수 문서화
  - `.env.example` 파일 생성
  - README에 설정 가이드 추가
  - 예상 시간: 15분

**산출물**: 모든 외부 서비스 연결 완료, Vercel 배포 성공

---

### 0.4 UI 프레임워크 설정 (1일)

**우선순위: P1 (High)**

- [ ] **UI-0.4.1**: Shadcn/ui 초기화
  - `npx shadcn-ui@latest init`
  - Tailwind 설정 확인
  - 예상 시간: 20분

- [ ] **UI-0.4.2**: 기본 컴포넌트 추가
  - Button, Input, Label, Card, Select
  - `npx shadcn-ui@latest add button input label card select`
  - 예상 시간: 15분

- [ ] **UI-0.4.3**: 레이아웃 컴포넌트 구현
  - `src/components/layout/Header.tsx`
  - `src/components/layout/Sidebar.tsx`
  - `src/components/layout/Footer.tsx`
  - 예상 시간: 2시간

- [ ] **UI-0.4.4**: 공통 레이아웃 적용
  - `src/app/(dashboard)/layout.tsx` 생성
  - Header + Sidebar + Footer 조합
  - 예상 시간: 1시간

**산출물**: Shadcn/ui 설정 완료, 기본 레이아웃 동작

---

### 0.5 인증 시스템 기초 (2일)

**우선순위: P0 (Critical)**

- [ ] **AUTH-0.5.1**: NextAuth.js v5 설치
  - `npm install next-auth@beta`
  - `npm install bcryptjs @types/bcryptjs`
  - 예상 시간: 10분

- [ ] **AUTH-0.5.2**: NextAuth 설정 파일 생성
  - `src/auth.ts` 생성
  - Credentials Provider 설정
  - JWT 전략 선택
  - 예상 시간: 1시간

- [ ] **AUTH-0.5.3**: 미들웨어 설정
  - `src/middleware.ts` 생성
  - 보호된 라우트 정의 (`/dashboard/*`)
  - 예상 시간: 30분

- [ ] **AUTH-0.5.4**: 로그인 페이지 구현
  - `src/app/(auth)/login/page.tsx`
  - React Hook Form + Zod 검증
  - Server Action 연결
  - 예상 시간: 2시간

- [ ] **AUTH-0.5.5**: 회원가입 페이지 구현
  - `src/app/(auth)/register/page.tsx`
  - 비밀번호 해싱 (bcrypt)
  - Server Action으로 User 생성
  - 예상 시간: 2시간

- [ ] **AUTH-0.5.6**: 인증 테스트
  - 회원가입 → 로그인 → Dashboard 접근 테스트
  - 예상 시간: 30분

**산출물**: 로그인/회원가입 동작, Dashboard 접근 제어

---

**Phase 0 완료 체크리스트:**

- ✅ `pnpm dev`로 localhost:3000 실행
- ✅ Vercel 배포 성공
- ✅ 데이터베이스 연결 확인
- ✅ 회원가입 → 로그인 → Dashboard 접근 가능

---

## 🎯 Phase 1: 권한 시스템 및 고객사 관리 (1주)

> **목표**: RBAC 구현, 고객사 CRUD 완성
> **완료 기준**: 고객사 생성/수정/삭제/조회 가능

### 1.1 RBAC 스키마 확장 (1일)

**우선순위: P0 (Critical)**

- [ ] **RBAC-1.1.1**: Prisma 스키마 확장
  - Role, Permission, UserRole 모델 추가
  - Enum (RoleType, PermissionAction) 정의
  - 마이그레이션 실행
  - 예상 시간: 1시간

- [ ] **RBAC-1.1.2**: Seed 데이터 생성
  - 기본 Role (SYSTEM_ADMIN, CLIENT_ADMIN, DEVELOPER, CLIENT_USER)
  - 권한 매핑
  - `prisma/seed.ts` 작성
  - 예상 시간: 1.5시간

- [ ] **RBAC-1.1.3**: 권한 체크 유틸리티
  - `src/lib/permissions.ts` 생성
  - `hasPermission(user, permission)` 함수
  - `requirePermission()` 데코레이터 함수
  - 예상 시간: 1시간

**산출물**: RBAC 스키마 완성, 권한 체크 함수 동작

---

### 1.2 고객사 CRUD (Backend) (1일)

**우선순위: P0 (Critical)**

- [ ] **CLIENT-1.2.1**: Client 모델 완성
  - Prisma 스키마 Client 모델 상세화
  - 마이그레이션
  - 예상 시간: 30분

- [ ] **CLIENT-1.2.2**: Client Service 구현
  - `src/lib/services/client.service.ts`
  - createClient, getClient, updateClient, deleteClient
  - Prisma 쿼리 최적화
  - 예상 시간: 2시간

- [ ] **CLIENT-1.2.3**: Client Server Actions
  - `src/app/actions/client.actions.ts`
  - createClientAction, updateClientAction, deleteClientAction
  - Zod 스키마 검증
  - 권한 체크 추가
  - 예상 시간: 2시간

- [ ] **CLIENT-1.2.4**: 통합 테스트
  - Vitest로 Service 테스트
  - Server Action 테스트
  - 예상 시간: 1시간

**산출물**: Client CRUD API 완성

---

### 1.3 고객사 관리 UI (Frontend) (2일)

**우선순위: P1 (High)**

- [ ] **CLIENT-UI-1.3.1**: 고객사 목록 페이지
  - `src/app/(dashboard)/clients/page.tsx`
  - TanStack Table 구현
  - 검색, 필터, 정렬 기능
  - 예상 시간: 3시간

- [ ] **CLIENT-UI-1.3.2**: 고객사 생성 폼
  - `src/app/(dashboard)/clients/new/page.tsx`
  - React Hook Form + Zod
  - Server Action 호출
  - 예상 시간: 2시간

- [ ] **CLIENT-UI-1.3.3**: 고객사 수정 폼
  - `src/app/(dashboard)/clients/[id]/edit/page.tsx`
  - 기존 데이터 로드
  - 예상 시간: 1.5시간

- [ ] **CLIENT-UI-1.3.4**: 고객사 상세 페이지
  - `src/app/(dashboard)/clients/[id]/page.tsx`
  - 고객사 정보 표시
  - 담당자 목록
  - 예상 시간: 2시간

- [ ] **CLIENT-UI-1.3.5**: E2E 테스트
  - Playwright로 고객사 CRUD 테스트
  - 예상 시간: 1시간

**산출물**: 고객사 전체 기능 동작 (생성/조회/수정/삭제)

---

**Phase 1 완료 체크리스트:**

- ✅ RBAC 스키마 완성
- ✅ 고객사 CRUD 동작
- ✅ 권한 체크 동작 확인

---

## 🎯 Phase 2: SR 핵심 기능 구현 (2주)

> **목표**: SR 생성/조회/상태관리/담당자 배정
> **완료 기준**: SR 전체 라이프사이클 동작

### 2.1 SR 스키마 및 Service (2일)

**우선순위: P0 (Critical)**

- [ ] **SR-2.1.1**: SR 관련 모델 추가
  - ServiceRequest, Comment, Attachment, SRHistory
  - Enum (SRStatus, SRPriority) 정의
  - 마이그레이션
  - 예상 시간: 1.5시간

- [ ] **SR-2.1.2**: SR Service 구현
  - `src/lib/services/sr.service.ts`
  - createSR, getSR, updateSR, assignSR, changeSRStatus
  - 예상 시간: 3시간

- [ ] **SR-2.1.3**: SR Server Actions
  - `src/app/actions/sr.actions.ts`
  - createSRAction, updateSRAction, assignSRAction
  - 예상 시간: 3시간

- [ ] **SR-2.1.4**: SR 권한 로직
  - SR 소유자/담당자/관리자 권한 분리
  - 조회 권한 체크
  - 예상 시간: 2시간

**산출물**: SR Service 및 Server Actions 완성

---

### 2.2 SR 생성 기능 (1일)

**우선순위: P0 (Critical)**

- [ ] **SR-CREATE-2.2.1**: SR 생성 폼 컴포넌트
  - `src/components/sr/SRCreateForm.tsx`
  - React Hook Form + Zod
  - 고객사 선택, 제목, 설명, 우선순위
  - 예상 시간: 2시간

- [ ] **SR-CREATE-2.2.2**: SR 생성 페이지
  - `src/app/(dashboard)/srs/new/page.tsx`
  - 폼 제출 → Server Action
  - 성공 시 SR 목록으로 리다이렉트
  - 예상 시간: 1시간

- [ ] **SR-CREATE-2.2.3**: 테스트
  - SR 생성 E2E 테스트
  - 예상 시간: 30분

**산출물**: SR 생성 기능 동작

---

### 2.3 SR 목록 및 조회 (2일)

**우선순위: P0 (Critical)**

- [ ] **SR-LIST-2.3.1**: SR 목록 페이지
  - `src/app/(dashboard)/srs/page.tsx`
  - TanStack Table
  - 필터 (상태, 우선순위, 고객사, 담당자)
  - 페이지네이션
  - 예상 시간: 4시간

- [ ] **SR-LIST-2.3.2**: SR 상세 페이지
  - `src/app/(dashboard)/srs/[id]/page.tsx`
  - SR 정보 표시
  - 댓글 섹션
  - 첨부파일 목록
  - 예상 시간: 3시간

- [ ] **SR-LIST-2.3.3**: 권한별 필터링
  - CLIENT_USER: 본인 SR만
  - DEVELOPER: 할당된 SR
  - CLIENT_ADMIN: 고객사 SR
  - SYSTEM_ADMIN: 전체
  - 예상 시간: 1.5시간

**산출물**: SR 목록/상세 조회 동작

---

### 2.4 SR 상태 관리 (1일)

**우선순위: P0 (Critical)**

- [ ] **SR-STATUS-2.4.1**: 상태 변경 컴포넌트
  - `src/components/sr/SRStatusChanger.tsx`
  - 드롭다운 선택 → Server Action
  - 예상 시간: 1.5시간

- [ ] **SR-STATUS-2.4.2**: 상태 변경 로직
  - 상태 전환 규칙 검증
  - SRHistory 기록
  - 예상 시간: 2시간

- [ ] **SR-STATUS-2.4.3**: 담당자 배정 UI
  - `src/components/sr/SRAssignHandler.tsx`
  - 사용자 검색 → 배정
  - 예상 시간: 1.5시간

**산출물**: SR 상태 변경 및 담당자 배정 동작

---

### 2.5 댓글 및 첨부파일 (2일)

**우선순위: P1 (High)**

- [ ] **COMMENT-2.5.1**: Comment Service 및 Actions
  - createComment, deleteComment
  - 내부 노트 vs 공개 댓글 구분
  - 예상 시간: 2시간

- [ ] **COMMENT-2.5.2**: 댓글 UI 컴포넌트
  - `src/components/sr/CommentList.tsx`
  - `src/components/sr/CommentForm.tsx`
  - 실시간 업데이트 (React Query)
  - 예상 시간: 3시간

- [ ] **ATTACHMENT-2.5.3**: 파일 업로드 구현
  - Vercel Blob 통합
  - `src/lib/storage.ts` (put, del 함수)
  - 예상 시간: 2시간

- [ ] **ATTACHMENT-2.5.4**: 첨부파일 UI
  - `src/components/sr/AttachmentList.tsx`
  - 드래그 앤 드롭 업로드
  - 예상 시간: 2시간

**산출물**: 댓글 및 첨부파일 기능 동작

---

**Phase 2 완료 체크리스트:**

- ✅ SR 생성 → 목록 조회 → 상세 조회
- ✅ SR 상태 변경 동작
- ✅ 담당자 배정 동작
- ✅ 댓글 작성/조회
- ✅ 파일 업로드/다운로드

---

## 🎯 Phase 3: 알림 시스템 (1주)

> **목표**: 이메일 알림 자동화
> **완료 기준**: SR 생성 시 담당자에게 이메일 발송

### 3.1 이메일 템플릿 (1일)

**우선순위: P1 (High)**

- [ ] **EMAIL-3.1.1**: React Email 설치
  - `npm install react-email @react-email/components`
  - `emails/` 디렉토리 생성
  - 예상 시간: 15분

- [ ] **EMAIL-3.1.2**: 기본 템플릿 생성
  - `emails/SRCreatedEmail.tsx`
  - `emails/SRStatusChangedEmail.tsx`
  - `emails/SRCompletedEmail.tsx`
  - 예상 시간: 3시간

- [ ] **EMAIL-3.1.3**: 템플릿 미리보기
  - `pnpm email dev` 실행
  - 템플릿 확인
  - 예상 시간: 30분

**산출물**: 이메일 템플릿 완성

---

### 3.2 이메일 발송 시스템 (1일)

**우선순위: P1 (High)**

- [ ] **EMAIL-3.2.1**: Resend 통합
  - `src/lib/email.ts` 생성
  - sendEmail 함수 구현
  - 예상 시간: 1시간

- [ ] **EMAIL-3.2.2**: 알림 Service
  - `src/lib/services/notification.service.ts`
  - sendSRCreatedNotification
  - sendSRStatusChangedNotification
  - 예상 시간: 2시간

- [ ] **EMAIL-3.2.3**: 이메일 발송 테스트
  - 실제 이메일 발송 테스트
  - 예상 시간: 1시간

**산출물**: 이메일 발송 동작

---

### 3.3 Inngest 백그라운드 작업 (2일)

**우선순위: P2 (Medium)**

- [ ] **BG-3.3.1**: Inngest 설치 및 설정
  - `npm install inngest`
  - `src/inngest/client.ts` 생성
  - 예상 시간: 30분

- [ ] **BG-3.3.2**: Inngest 함수 정의
  - `src/inngest/functions/send-email.ts`
  - 이메일 발송 재시도 로직
  - 예상 시간: 2시간

- [ ] **BG-3.3.3**: Inngest API Route
  - `src/app/api/inngest/route.ts`
  - Webhook 엔드포인트
  - 예상 시간: 1시간

- [ ] **BG-3.3.4**: Cron 작업 구현
  - 일일 리포트 (매일 오전 9시)
  - 만료 알림 (매일 오전 10시)
  - 예상 시간: 2시간

- [ ] **BG-3.3.5**: Inngest Dev Server 테스트
  - `npx inngest-cli@latest dev`
  - 로컬 테스트
  - 예상 시간: 1시간

**산출물**: Inngest 백그라운드 작업 동작

---

### 3.4 Mattermost 통합 (1일, 선택적)

**우선순위: P3 (Low)**

- [ ] **MM-3.4.1**: Mattermost Webhook 설정
  - Webhook URL 발급
  - 환경 변수 추가
  - 예상 시간: 20분

- [ ] **MM-3.4.2**: Mattermost 메시지 발송
  - `src/lib/mattermost.ts`
  - sendMessage 함수
  - 예상 시간: 1시간

- [ ] **MM-3.4.3**: 알림 Service에 통합
  - Critical SR 시 Mattermost 알림
  - 예상 시간: 1시간

**산출물**: Mattermost 알림 동작 (선택적)

---

**Phase 3 완료 체크리스트:**

- ✅ SR 생성 시 담당자에게 이메일 발송
- ✅ SR 상태 변경 시 신청자에게 이메일 발송
- ✅ Inngest 백그라운드 작업 동작

---

## 🎯 Phase 4: 대시보드 및 통계 (1주)

> **목표**: 실시간 대시보드, 통계 차트
> **완료 기준**: 메인 대시보드에 SR 현황 표시

### 4.1 대시보드 데이터 집계 (1일)

**우선순위: P1 (High)**

- [ ] **DASH-4.1.1**: Dashboard Service
  - `src/lib/services/dashboard.service.ts`
  - getSRStats (상태별, 우선순위별 집계)
  - getHandlerPerformance
  - getClientStats
  - 예상 시간: 3시간

- [ ] **DASH-4.1.2**: Dashboard API
  - `src/app/actions/dashboard.actions.ts`
  - 캐싱 적용 (React Query)
  - 예상 시간: 1.5시간

**산출물**: 대시보드 데이터 API

---

### 4.2 대시보드 UI (2일)

**우선순위: P1 (High)**

- [ ] **DASH-UI-4.2.1**: 통계 카드 컴포넌트
  - `src/components/dashboard/StatsCard.tsx`
  - 총 SR 수, 진행 중, 완료, 대기
  - 예상 시간: 2시간

- [ ] **DASH-UI-4.2.2**: 차트 컴포넌트
  - Recharts 설치
  - `src/components/dashboard/SRStatusChart.tsx` (파이 차트)
  - `src/components/dashboard/SRTrendChart.tsx` (라인 차트)
  - 예상 시간: 3시간

- [ ] **DASH-UI-4.2.3**: 메인 대시보드 페이지
  - `src/app/(dashboard)/dashboard/page.tsx`
  - 통계 카드 + 차트 배치
  - 예상 시간: 2시간

- [ ] **DASH-UI-4.2.4**: 최근 SR 위젯
  - `src/components/dashboard/RecentSRs.tsx`
  - 최근 생성/완료된 SR 목록
  - 예상 시간: 1.5시간

**산출물**: 대시보드 완성

---

### 4.3 보고서 생성 (2일, 선택적)

**우선순위: P2 (Medium)**

- [ ] **REPORT-4.3.1**: PDF 보고서 생성
  - `@react-pdf/renderer` 설치
  - `src/lib/pdf.ts` 생성
  - SR 리포트 템플릿
  - 예상 시간: 3시간

- [ ] **REPORT-4.3.2**: Excel 내보내기
  - `xlsx` 라이브러리 설치
  - SR 목록 Excel 다운로드
  - 예상 시간: 2시간

- [ ] **REPORT-4.3.3**: 보고서 UI
  - `src/app/(dashboard)/reports/page.tsx`
  - 기간 선택 → 보고서 생성
  - 예상 시간: 2시간

**산출물**: 보고서 생성 기능 (선택적)

---

**Phase 4 완료 체크리스트:**

- ✅ 대시보드에 SR 통계 표시
- ✅ 차트 동작
- ✅ 보고서 생성 (선택적)

---

## 🎯 Phase 5: 성능 최적화 및 테스트 (1주)

> **목표**: 성능 개선, 테스트 커버리지 확보
> **완료 기준**: Lighthouse 점수 > 90, 테스트 커버리지 > 70%

### 5.1 성능 최적화 (2일)

**우선순위: P1 (High)**

- [ ] **PERF-5.1.1**: 데이터베이스 인덱스 추가
  - SR.createdAt, SR.status 인덱스
  - Client.name 인덱스
  - 예상 시간: 1시간

- [ ] **PERF-5.1.2**: Redis 캐싱 구현
  - Upstash Redis 클라이언트 설정
  - 자주 조회되는 데이터 캐싱 (고객사 목록, 사용자 정보)
  - 예상 시간: 3시간

- [ ] **PERF-5.1.3**: Next.js 캐싱 최적화
  - `unstable_cache()` 적용
  - `revalidateTag()` 구현
  - 예상 시간: 2시간

- [ ] **PERF-5.1.4**: 이미지 최적화
  - Next/Image 컴포넌트 적용
  - 예상 시간: 1.5시간

- [ ] **PERF-5.1.5**: Code Splitting
  - Dynamic Import 적용 (모달, 차트)
  - 예상 시간: 1.5시간

**산출물**: 성능 개선 완료

---

### 5.2 테스트 구현 (3일)

**우선순위: P1 (High)**

- [ ] **TEST-5.2.1**: Vitest 설정
  - `npm install -D vitest @vitejs/plugin-react`
  - `vitest.config.ts` 생성
  - 예상 시간: 30분

- [ ] **TEST-5.2.2**: Unit Test 작성
  - 유틸 함수 테스트
  - Zod 스키마 테스트
  - 예상 시간: 3시간

- [ ] **TEST-5.2.3**: Integration Test 작성
  - Service 테스트 (Mock DB)
  - Server Actions 테스트
  - 예상 시간: 4시간

- [ ] **TEST-5.2.4**: Playwright 설정
  - `npm install -D @playwright/test`
  - `playwright.config.ts` 생성
  - 예상 시간: 30분

- [ ] **TEST-5.2.5**: E2E Test 작성
  - 로그인 → SR 생성 → 상태 변경 시나리오
  - 고객사 CRUD 시나리오
  - 예상 시간: 4시간

- [ ] **TEST-5.2.6**: CI/CD 테스트 통합
  - GitHub Actions 워크플로우에 테스트 추가
  - 예상 시간: 1시간

**산출물**: 테스트 커버리지 > 70%

---

### 5.3 보안 강화 (1일)

**우선순위: P1 (High)**

- [ ] **SEC-5.3.1**: Rate Limiting 구현
  - Upstash Redis로 Rate Limiter
  - API 라우트 보호
  - 예상 시간: 2시간

- [ ] **SEC-5.3.2**: Input Validation 강화
  - 모든 Server Actions에 Zod 검증
  - 예상 시간: 2시간

- [ ] **SEC-5.3.3**: CSRF 보호 확인
  - NextAuth CSRF 토큰 확인
  - 예상 시간: 30분

- [ ] **SEC-5.3.4**: XSS 방지
  - DOMPurify 적용 (HTML 콘텐츠)
  - 예상 시간: 1시간

**산출물**: 보안 강화 완료

---

**Phase 5 완료 체크리스트:**

- ✅ Lighthouse 점수 > 90
- ✅ 테스트 커버리지 > 70%
- ✅ Rate Limiting 동작
- ✅ 보안 체크리스트 통과

---

## 🎯 Phase 6: 모니터링 및 배포 (1주)

> **목표**: Production 배포, 모니터링 설정
> **완료 기준**: Production 환경 안정화

### 6.1 모니터링 설정 (2일)

**우선순위: P1 (High)**

- [ ] **MON-6.1.1**: Sentry 설정
  - `@sentry/nextjs` 설치
  - `sentry.client.config.ts`, `sentry.server.config.ts`
  - 소스맵 업로드
  - 예상 시간: 2시간

- [ ] **MON-6.1.2**: Axiom 로깅 설정
  - `next-axiom` 설치
  - 구조화된 로깅
  - 예상 시간: 2시간

- [ ] **MON-6.1.3**: 알림 설정
  - Sentry Slack 통합
  - Critical 에러 즉시 알림
  - 예상 시간: 1시간

**산출물**: 모니터링 시스템 동작

---

### 6.2 CI/CD 파이프라인 (2일)

**우선순위: P1 (High)**

- [ ] **CICD-6.2.1**: GitHub Actions 워크플로우
  - `.github/workflows/ci.yml` 생성
  - Lint → Type Check → Test → Build
  - 예상 시간: 2시간

- [ ] **CICD-6.2.2**: Preview 배포 자동화
  - PR 생성 시 Vercel Preview 배포
  - E2E 테스트 실행
  - 예상 시간: 1.5시간

- [ ] **CICD-6.2.3**: Production 배포 설정
  - main 브랜치 자동 배포
  - 마이그레이션 자동 실행
  - 예상 시간: 1.5시간

**산출물**: CI/CD 파이프라인 동작

---

### 6.3 Production 배포 (2일)

**우선순위: P0 (Critical)**

- [ ] **DEPLOY-6.3.1**: 환경 변수 설정
  - Vercel Production 환경 변수
  - Supabase Production 프로젝트
  - 예상 시간: 1시간

- [ ] **DEPLOY-6.3.2**: 데이터베이스 마이그레이션
  - Production DB에 마이그레이션 실행
  - Seed 데이터 생성
  - 예상 시간: 1시간

- [ ] **DEPLOY-6.3.3**: Production 배포
  - Vercel Production 배포
  - DNS 설정 (커스텀 도메인)
  - 예상 시간: 1.5시간

- [ ] **DEPLOY-6.3.4**: Smoke Test
  - 로그인, SR 생성, 이메일 발송 테스트
  - 예상 시간: 1.5시간

- [ ] **DEPLOY-6.3.5**: 모니터링 확인
  - Sentry 에러 확인
  - Axiom 로그 확인
  - Vercel Analytics 확인
  - 예상 시간: 1시간

**산출물**: Production 환경 안정화

---

**Phase 6 완료 체크리스트:**

- ✅ Sentry 에러 추적 동작
- ✅ Axiom 로그 수집 동작
- ✅ CI/CD 파이프라인 동작
- ✅ Production 배포 성공
- ✅ Smoke Test 통과

---

## 📊 전체 일정 요약

| Phase       | 기간      | 핵심 산출물            | 우선순위 |
| ----------- | --------- | ---------------------- | -------- |
| **Phase 0** | 1주       | 개발 환경, 인증 시스템 | P0       |
| **Phase 1** | 1주       | RBAC, 고객사 관리      | P0       |
| **Phase 2** | 2주       | SR 핵심 기능           | P0       |
| **Phase 3** | 1주       | 알림 시스템            | P1       |
| **Phase 4** | 1주       | 대시보드, 통계         | P1       |
| **Phase 5** | 1주       | 성능 최적화, 테스트    | P1       |
| **Phase 6** | 1주       | 모니터링, 배포         | P0       |
| **총 기간** | **6-8주** |                        |          |

---

## 🔄 병렬 작업 가능 항목

### Phase 2 병렬 작업

- **SR-2.3** (목록/조회) + **SR-2.4** (상태 관리) → 병렬 가능
- **COMMENT-2.5** (댓글) + **ATTACHMENT-2.5** (첨부파일) → 병렬 가능

### Phase 3 병렬 작업

- **EMAIL-3.1** (템플릿) + **EMAIL-3.2** (발송) → 순차 필요
- **BG-3.3** (Inngest) + **MM-3.4** (Mattermost) → 병렬 가능

### Phase 4 병렬 작업

- **DASH-4.1** (데이터) + **DASH-UI-4.2** (UI) → 일부 병렬 가능
- **REPORT-4.3** (보고서) → 독립 작업

---

## 🎯 Critical Path (최우선 경로)

```
Phase 0 (인증)
  → Phase 1 (RBAC)
  → Phase 2.1-2.2 (SR 생성)
  → Phase 2.3 (SR 조회)
  → Phase 2.4 (상태 관리)
  → Phase 3.1-3.2 (이메일)
  → Phase 6 (배포)
```

**Critical Path 총 기간**: 약 4-5주

---

## 📝 작업 진행 방식

### 1. **작업 시작 전**

- 해당 작업의 의존성 확인
- 필요한 환경 변수 확인
- 관련 문서 읽기 (PRD, TRD, LLD, DB)

### 2. **작업 중**

- 코드 작성
- 린트 확인 (`pnpm lint`)
- 타입 체크 (`pnpm type-check`)
- 로컬 테스트

### 3. **작업 완료 후**

- Git 커밋 (의미 있는 커밋 메시지)
- PR 생성 (Preview 배포 확인)
- 체크리스트 확인
- 다음 작업으로 이동

### 4. **Phase 완료 후**

- 전체 통합 테스트
- Phase 완료 체크리스트 확인
- 문서 업데이트 (필요 시)

---

## 🚀 다음 단계

**즉시 시작 가능한 작업:**

1. INIT-0.1.1: Next.js 프로젝트 생성
2. DB-0.2.1: Supabase 프로젝트 생성
3. UI-0.4.1: Shadcn/ui 초기화

**현재 Phase 0을 시작하시겠습니까?**
