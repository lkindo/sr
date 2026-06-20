# 20260620-fix-sidebar-styles

사이드바 및 모바일 헤더 영역에서 남아있는 하드코딩된 다크 테마 클래스(`text-gray-300`, `text-white`, `bg-[hsl(var(--sr-primary-dark))]` 등)를 제거하고, 라이트 테마에 맞추어 디자인 표준(SaaSify UI Kit)의 일관성을 완전하게 보장하는 태스크.

## 📋 진행 상태 체크리스트

- [x] **Think** — 요구사항 분석 및 기존 코드 영향 파악
  - [x] `Sidebar.tsx`와 `Header.tsx`에서 남아있는 다크 테마 하드코딩 속성 조사 완료.
  - [x] 라이트 테마(Slate 50 / Slate 100) 스펙과 텍스트 대비 확보 방안 분석 완료.
- [x] **Plan** — 구체적 수정/추가 단계 정의
  - [x] `Sidebar.tsx`와 `Header.tsx` 파일 내 다크 스타일 및 텍스트 칼라 클래스 변경 계획 수립.
- [x] **Implement** — 코드 작성 및 리팩토링
  - [x] `Sidebar.tsx` 내 `text-gray-300 hover:text-white`, `text-white` 하드코딩 수정.
  - [x] `Header.tsx` 내 모바일 메뉴 시트 및 모바일 로고 색상 수정.
- [x] **Test** — 테스트·빌드 실행으로 검증
  - [x] 로컬 빌드 및 타입 체크 확인. (pnpm build 검증 완료)
- [x] **Summarize** — 결과 요약 및 다음 루프 준비
