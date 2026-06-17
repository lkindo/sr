# 20260617-setup-rules-and-harness.md

## 진행 상태 (Status)

- **상태**: 진행 중 (`IN_PROGRESS`)
- **목표**: 프로젝트의 헌법(Rules/Constitution) 및 검증 하네스(Harness) 셋업 완료.

## 체크리스트 (Checklist)

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악 (완료)
- [x] **Plan** — 구체적 수정/추가 단계 정의 (완료)
- [/] **Implement** — 코드 작성 및 리팩토링 (진행 중)
  - [x] 비즈니스 도메인 헌법 `GEMINI.md` 작성
  - [x] 기술 규칙 KI 작성 (`.gemini/rules/db-rules.md`, `fe-rules.md`, `be-rules.md`)
  - [x] 검증 하네스 스크립트 작성 (`scripts/run-verification.ps1`)
  - [x] `package.json` 연동
- [/] **Test** — 테스트·빌드 실행으로 검증 (진행 중: pnpm verify:fast 구동 중)
- [ ] **Summarize** — 결과 요약 및 다음 루프 준비
