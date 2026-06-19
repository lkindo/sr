# 20260619-refactor-design-system

docs/design.md의 SaaSify UI Kit 디자인 시스템 스펙에 맞추어 글로벌 CSS, 테마(Tailwind) 및 공통 UI 컴포넌트(Button, Card, Input, Checkbox 등)를 전면 개편하고 동기화하는 태스크.

## 📋 진행 상태 체크리스트

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악
  - [x] `docs/design.md` 스펙과 `src/components/ui/` 공통 컴포넌트 매칭 분석
- [x] **Plan** — 구체적 수정/추가 단계 정의
  - [x] 구현 계획(`implementation_plan.md`) 작성 및 피드백 요청
- [x] **Implement** — 코드 작성 및 리팩토링
  - [x] 글로벌 CSS 및 테마 수정 (`globals.css`, `tailwind.config.ts`)
  - [x] UI 컴포넌트 개편 (`button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `file-upload.tsx`, `badge.tsx`, `avatar.tsx`)
- [x] **Test** — 테스트·빌드 실행으로 검증
  - [x] 프로젝트 타입 체크 및 빌드 검증 (`pnpm type-check`, `pnpm build` 정상 빌드 통과)
- [x] **Summarize** — 결과 요약 및 다음 루프 준비
